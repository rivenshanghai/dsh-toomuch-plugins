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
import { createAttributor, normalize, prefixCandidates } from '../src/attribution.js'
import { createCollector, gestureSkills } from '../src/collect.js'
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

console.log('smoke: 全部断言通过')
