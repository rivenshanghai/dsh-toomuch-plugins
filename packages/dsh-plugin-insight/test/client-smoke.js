/**
 * 冒烟检查：insight 的 client 半边（整页统计视图）。
 *
 * 跑法：`node packages/dsh-plugin-insight/test/client-smoke.js`
 * 零依赖：桩掉 window.__ModuleLoader__ 与 react，断言它注册 main 槽、广播
 * 就绪、挂对 Typert 贡献，并把统计画成表。
 */
import assert from 'node:assert/strict'

// --- 浏览器桩 -------------------------------------------------------------
const windowHandlers = new Map()
const dispatched = []
global.window = {
  addEventListener: (type, fn) => {
    if (!windowHandlers.has(type)) windowHandlers.set(type, [])
    windowHandlers.get(type).push(fn)
  },
  removeEventListener: (type, fn) => {
    const list = windowHandlers.get(type) ?? []
    const at = list.indexOf(fn)
    if (at >= 0) list.splice(at, 1)
  },
  dispatchEvent: (event) => {
    dispatched.push(event.type)
    for (const fn of (windowHandlers.get(event.type) ?? []).slice()) fn(event)
    return true
  },
}
let loaded = null
window.__ModuleLoader__ = { load: (mod) => { loaded = mod } }

// --- react 桩 --------------------------------------------------------------
// 有状态的 useState：页面要能先拿到数据再渲染。
const hookSlots = []
let hookIndex = 0
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (init) => {
    const index = hookIndex++
    if (hookSlots[index] === undefined) hookSlots[index] = typeof init === 'function' ? init() : init
    const setState = (value) => {
      hookSlots[index] = typeof value === 'function' ? value(hookSlots[index]) : value
    }
    return [hookSlots[index], setState]
  },
  // Effects run on mount, like React does — the page loads its data there.
  useEffect: (fn) => { if (typeof fn === 'function') fn() },
  useRef: (init) => ({ current: init }),
}

// --- 加载模块 --------------------------------------------------------------
await import('../src/client.js')
assert.ok(loaded && typeof loaded.factory === 'function', '模块已加载')
const mod = loaded.factory((name) => {
  assert.strictEqual(name, 'react', '意外的 require: ' + name)
  return React
})
assert.deepStrictEqual(
  mod.inject,
  ['slots', 'locale', 'remote', 'layout'],
  '注入的宿主面（layout 缺了就点不开整页）',
)

// --- 宿主桩 ---------------------------------------------------------------
const registrations = []
const injected = []
const contributions = []
const statsPayload = {
  generatedAt: 2000,
  totals: { activeSessions: 2, agentSteps: 10, boots: 1, plugins: 2, calls: 5, explicitCalls: 3, implicitCalls: 2 },
  plugins: [
    {
      pluginId: 'pkg:demo', name: 'demo', calls: 4, errors: 1, errorRate: 0.25, p95Ms: 30,
      explicit: 3, implicit: 1, explicitRate: 1.5, implicitRate: 0.1, survivalRate: 1,
      sessions: 2, active30d: true, lastSeen: 1000, declaredButInactive: [],
    },
    {
      pluginId: 'pkg:other', name: 'other', calls: 1, errors: 0, errorRate: 0, p95Ms: null,
      explicit: 0, implicit: 1, explicitRate: 0, implicitRate: 0.1, survivalRate: 0,
      sessions: 1, active30d: false, lastSeen: 1000, declaredButInactive: ['never_used'],
    },
  ],
}
const fakeRpc = { stats: async () => ({ ok: true, value: statsPayload }) }
const selectedPanels = []
const ctx = {
  effect: (fn) => { fn(); return () => {} },
  // 宿主布局服务：切页就靠它。桩里必须真的记下来，否则「点了没反应」这种
  // bug 会一路溜过去——那正是当初注入列表漏写 layout 时的症状。
  layout: { selectPanel: (id) => selectedPanels.push(id) },
  slots: {
    inject: (name, fn) => { injected.push(name); fn() },
    register: (entry, component) => { registrations.push({ entry, component }); return () => {} },
  },
  locale: {
    register: (ns, dicts) => { ctx.dicts = dicts },
    bind: () => (key) => key,
  },
  remote: {
    $mount: async (contribution) => { contributions.push(contribution); return () => {} },
  },
  get: (name) => (name === 'remote.pluginInsight' ? fakeRpc : undefined),
}
mod.apply(ctx)

// --- 就绪广播 -------------------------------------------------------------
assert.ok(window.__dshPluginInsightReady === true, 'client 半边起来后置就绪标记')
assert.ok(dispatched.includes('dsh-plugin-insight:ready'), '广播就绪事件')

// --- 侧栏按钮那一下必须真的把主工作区切过来 -------------------------------
assert.deepStrictEqual(selectedPanels, [], '没人点之前不切页')
window.dispatchEvent(new CustomEvent('dsh-plugin-insight:open-usage'))
assert.deepStrictEqual(selectedPanels, ['plugin-insight-usage'], '收到 open 事件后切到整页')

// --- main 槽 --------------------------------------------------------------
assert.ok(injected.includes('main'), '注入 main 槽')
const main = registrations.find((r) => r.entry.name === 'main')
assert.ok(main, '注册了 main 槽')
assert.strictEqual(main.entry.key, 'plugin-insight-usage', '整页的 key')

// --- Typert 贡献 ----------------------------------------------------------
assert.strictEqual(contributions.length, 1, '挂了一个 Typert 贡献')
const descriptor = contributions[0].descriptors[0]
assert.strictEqual(descriptor.service, 'pluginInsight', '调的是自己的宿主服务')
assert.strictEqual(descriptor.method, 'stats', '调的是 stats')
// Typert 的 validateCodec 只认顶层 create()：把它嵌进 schema 里会抛
// "strict codec has no create() factory"，而 $mount 的失败被 catch 吞掉，
// 表现就是页面一直显示「读不到统计数据」。
assert.strictEqual(typeof descriptor.result.create, 'function', 'result 顶层要有 create()')
assert.strictEqual(descriptor.result.mode, 'strict', 'result 是 strict 编码')
assert.strictEqual(typeof descriptor.result.typeSymbol, 'string', 'result 要有类型符号')
assert.strictEqual(typeof descriptor.result.create().parse, 'function', 'create() 返回带 parse 的 schema')

// --- 渲染 -----------------------------------------------------------------
// 远程调用在微任务里落地，先等一拍；再渲染一次，表格才有数据。
await new Promise((resolve) => setTimeout(resolve, 0))
hookIndex = 0
main.component({})
await new Promise((resolve) => setTimeout(resolve, 0))
hookIndex = 0
const tree = main.component({})
const text = JSON.stringify(tree)
assert.ok(text.includes('pkg:demo'), '表里画出了插件')
assert.ok(text.includes('pkg:other'), '第二个插件也在')
assert.ok(text.includes('30ms'), 'P95 耗时画出来了')
assert.ok(text.includes('25.0%'), '错误率画出来了')
assert.ok(text.includes('never_used'), '安装未激活被点出来了')

console.log('client-smoke: 全部断言通过')
