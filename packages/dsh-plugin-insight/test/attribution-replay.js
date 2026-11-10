/**
 * 归属回放：用**真实**的 profile 编排树，跑**真实**的工具名，看归属命中情况。
 *
 * 跑法：
 *   dsh --profile web --dump-config > /tmp/dsh-dump.yml
 *   node packages/dsh-plugin-insight/test/attribution-replay.js /tmp/dsh-dump.yml
 *
 * 这不是单元测试——它回答的是「这套匹配规则在真实插件生态上准不准」，
 * 所以工具名清单取自真实会话里模型可见的工具名，编排行取自真实 profile。
 */
import { readFileSync } from 'node:fs'
import { createAttributor } from '../src/attribution.js'

const dumpPath = process.argv[2]
if (!dumpPath) {
  console.error('用法：node attribution-replay.js <dsh --dump-config 的输出文件>')
  process.exit(1)
}

/**
 * 从 dump 的 YAML 里抽出编排行。
 *
 * dump 里一行不一定紧挨着 id 与 name——中间可能夹着 config 块（比如 study 那组）。
 * 所以按「遇到 id 开一个新块，往块里继续找 name」的方式解析，找不到 name 的块丢掉。
 * @param {string} text dump 内容。
 * @returns 行数组 `{ id, name }`。
 */
function parseRows(text) {
  const rows = []
  let current = null
  for (const line of text.split('\n')) {
    const idMatch = /^\s*-?\s*id:\s*(\S+)\s*$/.exec(line)
    if (idMatch !== null) {
      if (current !== null && current.name !== undefined) rows.push(current)
      current = { id: idMatch[1] }
      continue
    }
    if (current === null || current.name !== undefined) continue
    const nameMatch = /^\s*name:\s*'?([^'\n]+?)'?\s*$/.exec(line)
    // 运行时 `options.name` 一定是模块说明符；dump 里还混着 agent-preset 的展示行
    // （`name` 是「学习模式 · StudyHub」这种标题），那些不是插件，跳过。
    if (nameMatch !== null && !/\s/.test(nameMatch[1].trim())) current.name = nameMatch[1].trim()
  }
  if (current !== null && current.name !== undefined) rows.push(current)
  return rows
}

/**
 * 真实会话里模型可见的工具名（按插件分组）。
 * 前 12 个是宿主基座工具，其余是插件提供的。
 */
const TOOL_NAMES = [
  // 宿主基座
  'bash', 'read', 'write', 'edit', 'grep', 'glob', 'skill',
  'todo_write', 'create_goal', 'get_goal', 'update_goal',
  'ask_user_question', 'list_agents', 'send_message', 'subagent', 'workflow', 'present',
  // 插件
  'deck_context', 'deck_issue_create', 'deck_map_snapshot',
  'univer_api', 'univer_status', 'univer_screenshot',
  'study_workspace', 'study_materials', 'study_practice',
  'docker_ps', 'docker_exec', 'docker_images',
  'skill_manager_list', 'skill_manager_workspace_list',
  'ssh_manager', 'ssh_manager_action',
  'reme_search', 'plugin_manager',
  'schedule_create', 'schedule_list',
  'remote_list_hosts', 'remote_send_message',
  'mcp__dbhub__execute_sql_prod_mysql', 'mcp__engram__mem_save',
]

const rows = parseRows(readFileSync(dumpPath, 'utf8'))
const attributor = createAttributor({
  loader: { entries: () => rows.map((row) => ({ options: row })) },
  get: () => undefined,
})

console.log(`编排行 ${rows.length} 条，回放 ${TOOL_NAMES.length} 个真实工具名\n`)
const tally = new Map()
const table = []
for (const name of TOOL_NAMES) {
  const result = attributor.resolve({ kind: 'tool', name })
  tally.set(result.pluginId, (tally.get(result.pluginId) ?? 0) + 1)
  table.push({ name, pluginId: result.pluginId, confidence: result.confidence })
}
for (const row of table) {
  console.log(`${row.name.padEnd(38)} ${row.pluginId.padEnd(46)} ${row.confidence}`)
}

console.log('\n=== 汇总 ===')
for (const [pluginId, count] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(3)}  ${pluginId}`)
}
const byConfidence = new Map()
for (const row of table) byConfidence.set(row.confidence, (byConfidence.get(row.confidence) ?? 0) + 1)
console.log('\n=== 置信度分布 ===')
for (const [confidence, count] of byConfidence) console.log(`  ${confidence.padEnd(10)} ${count}`)
