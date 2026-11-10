/**
 * 冒烟检查：归属解析 + 事件落盘。
 *
 * 跑法：`node packages/dsh-plugin-insight/test/smoke.js`
 * 不依赖任何第三方库，也不碰真实 profile——用临时目录伪造一个 profile。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAttributor, normalize, packageOf, prefixCandidates } from '../src/attribution.js'
import { createCollector, gestureSkills } from '../src/collect.js'
import { createProfiler, readEvents } from '../src/profile.js'
import { computeStats, percentile95, statsFromFile } from '../src/stats.js'
import { createStore } from '../src/store.js'

/**
 * 伪造一个插件上下文：有 loader 行、有 profile 目录。
 * @param {Array<{id: string, name: string}>} rows bundle 行。
 * @param {string} profileDir profile 目录。
 * @returns 上下文。
 */
function fakeCtx(rows, profileDir) {
  return {
    loader: {
      entries: () => rows.map((row) => ({ options: { id: row.id, name: row.name } })),
    },
    get(name) {
      if (name === 'profileContext') return { dir: profileDir }
      return undefined
    },
  }
}

/** 造一个临时 profile，里面放一个自报了能力的插件。 */
const profileDir = mkdtempSync(join(tmpdir(), 'dsh-plugin-insight-'))
const declaredModule = '@example/dsh-declared'
const declaredDir = join(profileDir, 'node_modules', '@example', 'dsh-declared')
mkdirSync(declaredDir, { recursive: true })
writeFileSync(
  join(declaredDir, 'package.json'),
  JSON.stringify({
    name: declaredModule,
    version: '1.0.0',
    dsh: { capabilities: { tools: ['my_custom_tool'], skills: ['my-skill'] } },
  }),
)

const attributor = createAttributor(
  fakeCtx(
    [
      { id: 'docker', name: '@hyzyn/dsh-docker' },
      { id: 'skill-manager', name: '@yanglaofish/dsh-skill-manager' },
      { id: 'ui-chat', name: '@deepseek-ai/dsh-client-ui-chat' },
      { id: 'declared', name: declaredModule },
    ],
    profileDir,
  ),
)

// —— 归一化与候选 ——
assert.equal(normalize('skill_manager'), 'skill-manager')
assert.deepEqual(prefixCandidates('skill_manager_list'), [
  'skill_manager_list',
  'skill_manager',
  'skill',
])

// —— 前缀启发式 ——
const docker = attributor.resolve({ kind: 'tool', name: 'docker_exec' })
assert.equal(docker.pluginId, 'pkg:@hyzyn/dsh-docker')
assert.equal(docker.confidence, 'high')

// 下划线与连字符不同，但归一化后与行 id 相等。
const skillManager = attributor.resolve({ kind: 'tool', name: 'skill_manager_list' })
assert.equal(skillManager.pluginId, 'pkg:@yanglaofish/dsh-skill-manager')
assert.equal(skillManager.confidence, 'high')

// 落在模块名的一段里：deck ⊂ dsh-mattpocock-skills-deck。
const rows = [
  { id: 'docker', name: '@hyzyn/dsh-docker' },
  { id: 'skill-manager', name: '@yanglaofish/dsh-skill-manager' },
  { id: 'ui-chat', name: '@deepseek-ai/dsh-client-ui-chat' },
  { id: 'declared', name: declaredModule },
]
const deckAttributor = createAttributor(
  fakeCtx([...rows, { id: 'dsh-mattpocock-skills-deck', name: 'dsh-mattpocock-skills-deck' }], profileDir),
)
const deck = deckAttributor.resolve({ kind: 'tool', name: 'deck_context' })
assert.equal(deck.pluginId, 'pkg:dsh-mattpocock-skills-deck')
assert.equal(deck.confidence, 'medium')

// —— 宿主自带 ——
const builtin = attributor.resolve({ kind: 'tool', name: 'bash' })
assert.equal(builtin.pluginId, 'builtin')

// —— MCP ——
const mcp = attributor.resolve({ kind: 'tool', name: 'mcp__dbhub__execute_sql_prod_mysql' })
assert.equal(mcp.pluginId, 'mcp:dbhub')
assert.equal(mcp.confidence, 'high')

// —— 技能 ——
const skill = attributor.resolve({ kind: 'skill', name: 'grilling' })
assert.equal(skill.pluginId, 'skill:grilling')

// —— 插件自报：唯一精确的来源 ——
const declared = attributor.resolve({ kind: 'tool', name: 'my_custom_tool' })
assert.equal(declared.pluginId, `pkg:${declaredModule}`)
assert.equal(declared.confidence, 'high')

// —— 认不出来就如实标 unknown ——
const unknown = attributor.resolve({ kind: 'tool', name: 'zzz_unmapped_thing' })
assert.equal(unknown.pluginId, 'unknown')
assert.equal(unknown.confidence, 'unknown')

// —— 宿主行命中多个时，归属值仍然是 builtin，置信度不该被拖到 low ——
// （实测发现：bash 同时命中 dsh-bash-local 与 dsh-bash-sandbox）
const bashAttributor = createAttributor(
  fakeCtx(
    [
      { id: 'dsh-bash-local', name: '@deepseek-ai/dsh-bash-local' },
      { id: 'dsh-bash-sandbox', name: '@deepseek-ai/dsh-bash-sandbox' },
    ],
    profileDir,
  ),
)
const bash = bashAttributor.resolve({ kind: 'tool', name: 'bash' })
assert.equal(bash.pluginId, 'builtin')
assert.equal(bash.confidence, 'medium')

// —— cordis 伪模块不是插件 ——
// （实测发现：cordis:include 被算成了 pkg:cordis:include）
const pseudoAttributor = createAttributor(
  fakeCtx([{ id: 'cordis-inspect', name: 'cordis:inspect' }], profileDir),
)
const pseudo = pseudoAttributor.resolve({ kind: 'tool', name: 'cordis_inspect_list' })
assert.equal(pseudo.pluginId, 'builtin')

// —— 精确命中优先于更长的宽松命中 ——
// （实测发现：docker_ps 的长候选先撞上 docker 行的宽松匹配就提前返回，
//   永远走不到更短的 docker —— 那才是精确命中）
const orderedAttributor = createAttributor(
  fakeCtx([{ id: 'docker', name: '@hyzyn/dsh-docker' }], profileDir),
)
const dockerPs = orderedAttributor.resolve({ kind: 'tool', name: 'docker_ps' })
assert.equal(dockerPs.pluginId, 'pkg:@hyzyn/dsh-docker')
assert.equal(dockerPs.confidence, 'high')

// —— 宿主精确命中不会被用户插件的宽松命中抢走 ——
// （实测发现：内置 skill 工具被归到了 skill-manager）
const collisionAttributor = createAttributor(
  fakeCtx(
    [
      { id: 'skill', name: '@deepseek-ai/dsh-skill' },
      { id: 'skill-manager', name: '@yanglaofish/dsh-skill-manager' },
    ],
    profileDir,
  ),
)
const skillTool = collisionAttributor.resolve({ kind: 'tool', name: 'skill' })
assert.equal(skillTool.pluginId, 'builtin')
assert.equal(skillTool.confidence, 'high')

// —— 同一包的多行按包去重，不算多候选 ——
// （实测发现：deck 命中了同包的两行，被误判成 low）
const multiRowAttributor = createAttributor(
  fakeCtx(
    [
      { id: 'dsh-mattpocock-skills-deck', name: 'dsh-mattpocock-skills-deck' },
      { id: 'dsh-mattpocock-skills-deck-tools', name: 'dsh-mattpocock-skills-deck/tools' },
    ],
    profileDir,
  ),
)
const deckTool = multiRowAttributor.resolve({ kind: 'tool', name: 'deck_context' })
assert.equal(deckTool.pluginId, 'pkg:dsh-mattpocock-skills-deck')
assert.equal(deckTool.confidence, 'medium')

// —— 插件清单与静态映射 ——
const plugins = attributor.listPlugins()
assert.equal(plugins.length, 4)
assert.ok(plugins.some((plugin) => plugin.moduleName === declaredModule))
const map = attributor.getAttributionMap()
assert.equal(map.get('docker'), 'pkg:@hyzyn/dsh-docker')
assert.equal(map.get('my_custom_tool'), `pkg:${declaredModule}`)

// —— 手势识别 ——
const gestures = gestureSkills([
  { source: { kind: 'user' }, content: [{ type: 'text', text: '/grill-with-docs 帮我看看' }] },
  { source: { kind: 'skill-catalog' }, content: [{ type: 'text', text: '/fake-skill' }] },
])
assert.deepEqual(gestures, ['grill-with-docs'])

// —— 事件落盘 ——
const eventsFile = join(profileDir, 'events.jsonl')
const store = createStore(eventsFile)
assert.equal(store.append({ ts: 1, kind: 'tool', name: 'docker_exec' }), true)
assert.equal(store.append({ ts: 2, kind: 'tool', name: 'broken' }), true)
const lines = readFileSync(eventsFile, 'utf8').trim().split('\n')
assert.equal(lines.length, 2)
assert.equal(JSON.parse(lines[0]).name, 'docker_exec')

// —— 采集层：事件怎么变成事件行 ——

/**
 * 造一个只记录监听器的事件总线。
 * @returns `{ handlers, ctx }`。
 */
function fakeEventCtx() {
  const handlers = new Map()
  return {
    handlers,
    ctx: {
      on(name, listener) {
        handlers.set(name, listener)
        return () => {}
      },
    },
  }
}

const captured = []
const eventBus = fakeEventCtx()
createCollector(eventBus.ctx, {
  store: { file: 'memory', append: (row) => { captured.push(row); return true } },
  attributor: {
    resolve: (event) => ({ pluginId: `pkg:test:${event.name}`, confidence: 'high', candidates: [] }),
    listPlugins: () => [],
  },
})

// 名为 skill 的工具：技能 id 在参数里。
const skillExec = {
  callId: 'call-1',
  name: 'skill',
  arguments: { name: 'grilling' },
  agent: { id: 'agent-1', session: { id: 'session-1' } },
}
eventBus.handlers.get('tools/pre-execute')(skillExec, () => 'allow')
eventBus.handlers.get('tools/result')(skillExec, { isError: false })
const skillRow = captured.find((row) => row.kind === 'skill')
assert.ok(skillRow, '工具名为 skill 时应记成技能行')
assert.equal(skillRow.name, 'grilling')
assert.equal(skillRow.sessionId, 'session-1')
assert.equal(skillRow.error, false)
assert.equal(skillRow.pluginId, 'pkg:test:grilling')

// 用户手势：不产生工具调用，只在进入步骤的消息里。
eventBus.handlers.get('agent/pre-step')(
  {
    agent: { id: 'agent-1', session: { id: 'session-1' } },
    messages: [{ source: { kind: 'user' }, content: [{ type: 'text', text: '/grill-with-docs' }] }],
  },
  () => 'ok',
)
const gestureRow = captured.find((row) => row.kind === 'skill' && row.source === 'user-gesture')
assert.ok(gestureRow, '用户手势应记成技能行')
assert.equal(gestureRow.name, 'grill-with-docs')

// 命令：显式口径的一半。
eventBus.handlers.get('session/event')(
  { id: 'session-1' },
  { type: 'command/run', data: { name: 'compact', source: { kind: 'user' } } },
)
const commandRow = captured.find((row) => row.kind === 'command')
assert.ok(commandRow, '命令应记成命令行')
assert.equal(commandRow.name, 'compact')
assert.equal(commandRow.source, 'user')

// 审批：与工具调用分开记，靠 callId 关联。
eventBus.handlers.get('session/event')(
  { id: 'session-1' },
  { type: 'approval/asked', data: { id: 'ap-1', toolName: 'bash', callId: 'call-9' } },
)
eventBus.handlers.get('session/event')(
  { id: 'session-1' },
  { type: 'approval/decided', data: { id: 'ap-1', outcome: 'allowed-once' } },
)
const approvalRow = captured.find((row) => row.kind === 'approval')
assert.ok(approvalRow, '审批应记成审批行')
assert.equal(approvalRow.name, 'bash')
assert.equal(approvalRow.callId, 'call-9')
assert.equal(approvalRow.outcome, 'allowed-once')

// —— 能力档案（FR-3）——

// 包装名：带 scope 与子路径两种形状。
assert.equal(packageOf('@a/b/c'), '@a/b')
assert.equal(packageOf('a/b'), 'a')
assert.equal(packageOf('@a/b'), '@a/b')

const profileEvents = join(profileDir, 'profile-events.jsonl')
writeFileSync(
  profileEvents,
  [
    // 声明了 tool_a 但一次没调用；tool_b 调过两次，其中一次出错。
    JSON.stringify({ ts: 10, kind: 'plugin', pluginId: `pkg:${declaredModule}`, name: declaredModule }),
    JSON.stringify({ ts: 20, kind: 'tool', name: 'tool_b', pluginId: `pkg:${declaredModule}`, error: false, sessionId: 's1' }),
    JSON.stringify({ ts: 30, kind: 'tool', name: 'tool_b', pluginId: `pkg:${declaredModule}`, error: true, sessionId: 's2' }),
    'not json at all',
  ].join('\n') + '\n',
)
assert.equal(readEvents(profileEvents).length, 3, '坏行应被跳过')

const profiler = createProfiler(
  {},
  {
    attributor: {
      listPlugins: () => [
        { id: 'declared', moduleName: declaredModule, host: false, declared: ['my_custom_tool'] },
      ],
    },
    eventsFile: profileEvents,
    profileDir,
  },
)
const [profile] = profiler.profiles()
assert.equal(profile.pluginId, `pkg:${declaredModule}`)
assert.equal(profile.version, '1.0.0', '应从 manifest 读到版本')
assert.equal(profile.observed.calls, 2)
assert.equal(profile.observed.errors, 1)
assert.equal(profile.observed.sessions, 2, '两个会话应去重计数')
assert.ok(profile.capabilities.tools.includes('my_custom_tool'), '自报的声明应进能力表')
assert.ok(profile.capabilities.tools.includes('tool_b'), '观察到的名字应进能力表')
assert.deepEqual(profile.declaredButInactive, ['my_custom_tool'], '声明了没调用的应被点出来')
assert.ok(profile.unknown.includes('hooks'), '没有证据来源的维度应被点名')

// —— 使用率统计（FR-4）——
assert.equal(percentile95([10, 20, 30, 40, 100]), 100, 'P95 取上分位')
assert.equal(percentile95([]), null, '没有样本时 P95 为 null')
assert.equal(percentile95([5]), 5, '单样本就是它自己')

const statRows = [
  { ts: 1000, kind: 'boot', boot: 'b1' },
  { ts: 1000, kind: 'session', sessionId: 's1' },
  { ts: 1000, kind: 'session', sessionId: 's2' },
  { ts: 1000, kind: 'turn', sessionId: 's1', turn: 1, steps: 4 },
  { ts: 1000, kind: 'turn', sessionId: 's2', turn: 1, steps: 6 },
  { ts: 1000, kind: 'plugin', pluginId: 'pkg:demo', boot: 'b1' },
  // 显式：用户命令、用户手势、用户批准过的调用
  { ts: 1000, kind: 'command', name: 'compact', pluginId: 'pkg:demo', source: 'user', sessionId: 's1' },
  { ts: 1000, kind: 'skill', name: 'grilling', pluginId: 'pkg:demo', source: 'user-gesture', sessionId: 's1' },
  { ts: 1000, kind: 'approval', name: 'demo_tool', callId: 'c1', outcome: 'allowed-once' },
  { ts: 1000, kind: 'tool', name: 'demo_tool', pluginId: 'pkg:demo', callId: 'c1', sessionId: 's1', durationMs: 30 },
  // 隐式：模型自己发起的
  { ts: 1000, kind: 'tool', name: 'demo_tool', pluginId: 'pkg:demo', callId: 'c2', sessionId: 's2', durationMs: 10, error: true },
  // 别的插件
  { ts: 1000, kind: 'tool', name: 'other_tool', pluginId: 'pkg:other', callId: 'c3', sessionId: 's2', durationMs: 50 },
]
const stats = computeStats(statRows, { now: 2000 })
assert.equal(stats.totals.activeSessions, 2, '活跃会话数')
assert.equal(stats.totals.agentSteps, 10, '步骤数由轮次汇总')
assert.equal(stats.totals.boots, 1, '启动次数')
const demo = stats.plugins.find((plugin) => plugin.pluginId === 'pkg:demo')
assert.equal(demo.calls, 4, '调用次数')
assert.equal(demo.explicit, 3, '显式：命令 + 手势 + 被批准的工具')
assert.equal(demo.implicit, 1, '隐式：模型自己发起的')
assert.equal(demo.explicitRate, 1.5, '显式使用率 = 显式调用 / 活跃会话')
assert.equal(demo.implicitRate, 0.1, '隐式命中率 = 隐式调用 / 步骤数')
assert.equal(demo.survivalRate, 1, '加载存活率 = 被加载的启动 / 总启动')
assert.equal(demo.errorRate, 0.25, '错误率')
assert.equal(demo.p95Ms, 30, 'P95 耗时')
assert.equal(demo.sessions, 2, '跨会话数')
assert.equal(demo.active30d, true, '30 天内活跃')
assert.equal(stats.plugins[0].pluginId, 'pkg:demo', '按显式使用率排序')
// 统计能从文件读出来
const statsFile = join(profileDir, 'stats-events.jsonl')
writeFileSync(statsFile, statRows.map((row) => JSON.stringify(row)).join('\n') + '\n')
assert.equal(statsFromFile(statsFile, { now: 2000 }).totals.calls, 5, '从文件算统计')

// 历史行与现行行的归属写法不同（早先按子模块记，现在按包归一），统计要合并它们。
const mixedStats = computeStats([
  { ts: 1000, kind: 'tool', name: 'a', pluginId: 'pkg:@scope/pkg/plugins/audio', callId: 'x1' },
  { ts: 1000, kind: 'tool', name: 'b', pluginId: 'pkg:@scope/pkg', callId: 'x2' },
], { now: 2000 })
assert.equal(mixedStats.plugins.length, 1, '同一个包的两种写法合成一条')
assert.equal(mixedStats.plugins[0].pluginId, 'pkg:@scope/pkg')
assert.equal(mixedStats.plugins[0].calls, 2)

// 统计结果要跨 Typert 远程传给浏览器，必须能无损 JSON 往返——
// Map / Set / undefined 都会在线上变成别的形状。
const roundTripped = JSON.parse(JSON.stringify(stats))
assert.deepEqual(roundTripped, stats, '统计结果必须能无损 JSON 往返')

console.log('smoke: 全部断言通过')
