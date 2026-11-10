/**
 * 插件能力档案（FR-3）。
 *
 * 档案的每一格都要有**证据来源**，推不出来的就留空并在 `unknown` 里点名，
 * 不拿猜测填表：
 *
 *  - `ui`    来自 manifest 的 `dsh.client`——声明了就有浏览器半边。
 *  - `tools` / `skills` / `commands`
 *            = 插件自报声明 ∪ 事件流里实际观察到的名字。两者分开记，
 *            「声明了但从没被调用」正是 PRD 要的 `declaredButInactive`。
 *  - `hooks` 没有声明渠道，运行时也拿不到监听器归属——**留空**。
 *  - `data` / `auth` 同理——**留空**。
 *
 * 第一版只填有证据的维度，比填一张看不懂的表有用。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { packageOf } from './attribution.js'

/** 计进「用过」的事件类别。 */
const USAGE_KINDS = new Set(['tool', 'skill', 'command'])

/**
 * 读事件流。坏行跳过，不因为一行坏了丢掉整个档案。
 * @param {string} file 事件流路径。
 * @returns 事件行数组。
 */
export function readEvents(file) {
  let text = ''
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    // 还没有事件流：档案就只有声明部分。
    return []
  }
  const rows = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      const row = JSON.parse(line)
      if (row !== null && typeof row === 'object') rows.push(row)
    } catch {
      // 半行（进程被杀时可能出现）：跳过。
    }
  }
  return rows
}

/**
 * 读一个插件的本地 manifest。
 * @param {string} profileDir profile 目录。
 * @param {string} moduleName 模块说明符。
 * @returns manifest 对象，或 null。
 */
function readManifest(profileDir, moduleName) {
  if (profileDir === null) return null
  try {
    return JSON.parse(
      readFileSync(join(profileDir, 'node_modules', packageOf(moduleName), 'package.json'), 'utf8'),
    )
  } catch {
    return null
  }
}

/**
 * 建能力档案读取器。
 * @param {object} ctx 插件上下文。
 * @param {object} options `attributor`、`eventsFile`、`profileDir`。
 * @returns `{ profiles }`。
 */
export function createProfiler(ctx, options = {}) {
  const attributor = options.attributor
  const eventsFile = options.eventsFile
  const profileDir = options.profileDir ?? null

  /**
   * 汇总事件流里每个归属用到的名字。
   * @param {object[]} rows 事件行。
   * @returns 归属 → 统计。
   */
  function usageByPlugin(rows) {
    const usage = new Map()
    for (const row of rows) {
      if (!USAGE_KINDS.has(row.kind)) continue
      const pluginId = row.pluginId
      if (typeof pluginId !== 'string' || pluginId === '') continue
      let entry = usage.get(pluginId)
      if (entry === undefined) {
        entry = { calls: 0, errors: 0, names: new Set(), sessions: new Set(), lastSeen: null }
        usage.set(pluginId, entry)
      }
      entry.calls += 1
      if (row.error === true) entry.errors += 1
      if (typeof row.name === 'string' && row.name !== '') entry.names.add(row.name)
      if (typeof row.sessionId === 'string') entry.sessions.add(row.sessionId)
      if (typeof row.ts === 'number' && (entry.lastSeen === null || row.ts > entry.lastSeen)) {
        entry.lastSeen = row.ts
      }
    }
    return usage
  }

  /**
   * 每个插件最近一次被加载的时间，从 plugin 行里取。
   * @param {object[]} rows 事件行。
   * @returns 归属 → 时间戳。
   */
  function loadedAt(rows) {
    const seen = new Map()
    for (const row of rows) {
      if (row.kind !== 'plugin') continue
      if (typeof row.ts !== 'number' || typeof row.pluginId !== 'string') continue
      const previous = seen.get(row.pluginId)
      if (previous === undefined || row.ts > previous) seen.set(row.pluginId, row.ts)
    }
    return seen
  }

  /**
   * 生成全部插件的能力档案。
   * @returns 档案数组。
   */
  function profiles() {
    const rows = typeof eventsFile === 'string' ? readEvents(eventsFile) : []
    const usage = usageByPlugin(rows)
    const loaded = loadedAt(rows)
    const plugins = attributor && typeof attributor.listPlugins === 'function'
      ? attributor.listPlugins()
      : []

    // 一个包可以插多行：按包合并成一份档案。
    const byPackage = new Map()
    for (const plugin of plugins) {
      const pkg = packageOf(plugin.moduleName)
      const pluginId = plugin.host ? 'builtin' : `pkg:${pkg}`
      let profile = byPackage.get(pluginId)
      if (profile === undefined) {
        profile = {
          pluginId,
          name: pkg,
          version: null,
          capabilities: { ui: [], tools: [], skills: [], commands: [], hooks: [], data: [], auth: [] },
          declaredButInactive: [],
          observed: { calls: 0, errors: 0, names: [], sessions: 0 },
          firstSeen: null,
          lastLoaded: null,
          /** 这一版没有证据来源的维度，点名而不是留空让读者以为是「没有」。 */
          unknown: ['hooks', 'data', 'auth'],
        }
        byPackage.set(pluginId, profile)
      }
      // 只有用户插件读 manifest；宿主基座包的档案没有实际用途。
      if (!plugin.host && profile.version === null) {
        const manifest = readManifest(profileDir, plugin.moduleName)
        if (manifest !== null) {
          if (typeof manifest.version === 'string') profile.version = manifest.version
          if (manifest.dsh?.client !== undefined) profile.capabilities.ui.push('client-ext')
        }
      }
      const declared = Array.isArray(plugin.declared) ? plugin.declared : []
      for (const name of declared) {
        if (profile.capabilities.tools.includes(name)) continue
        if (profile.capabilities.skills.includes(name)) continue
        if (profile.capabilities.commands.includes(name)) continue
        // 声明里没有类别信息，先按名字放：观察到的类别优先，否则进 tools。
        profile.capabilities.tools.push(name)
      }
    }

    // 叠加观察到的使用情况。
    for (const [pluginId, entry] of usage) {
      const profile = byPackage.get(pluginId)
      if (profile === undefined) continue
      const names = [...entry.names].sort()
      profile.observed = {
        calls: entry.calls,
        errors: entry.errors,
        names,
        sessions: entry.sessions.size,
      }
      profile.lastSeen = entry.lastSeen
      for (const name of names) {
        if (!profile.capabilities.tools.includes(name)) profile.capabilities.tools.push(name)
      }
      const loadedTime = loaded.get(pluginId)
      if (loadedTime !== undefined) profile.lastLoaded = loadedTime
    }

    // 声明了但从没被调用过的，正是 PRD 要的「安装未激活」。
    for (const profile of byPackage.values()) {
      const usedNames = new Set(profile.observed.names)
      profile.declaredButInactive = profile.capabilities.tools.filter((name) => !usedNames.has(name))
      if (profile.firstSeen === null && profile.lastLoaded !== null) profile.firstSeen = profile.lastLoaded
      profile.capabilities.tools.sort()
      profile.capabilities.skills.sort()
      profile.capabilities.commands.sort()
    }

    return [...byPackage.values()].sort((a, b) => {
      const callsDiff = b.observed.calls - a.observed.calls
      return callsDiff !== 0 ? callsDiff : a.pluginId.localeCompare(b.pluginId)
    })
  }

  return { profiles }
}
