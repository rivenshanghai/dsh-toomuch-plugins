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
import { gestureSkills } from '../src/collect.js'
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

console.log('smoke: 全部断言通过')
