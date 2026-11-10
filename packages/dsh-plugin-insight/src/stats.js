/**
 * 使用率统计层（FR-4）。
 *
 * 三类口径**分开算、不合并排行**（PRD §FR-4）：
 *
 *  1. 显式使用率 = 显式调用数 / active_sessions
 *     显式 = 用户输入的命令、用户手写的 `/技能名` 手势、用户点头批准的工具调用。
 *  2. 隐式命中率 = 隐式调用数 / agent_steps
 *     隐式 = 模型自己发起的调用（减去被用户批准过的那部分，两口径不重叠）。
 *  3. 加载存活率 = 被加载过的启动次数 / dsh 启动次数
 *
 * 分母是全局的，分子是每个插件的。一个插件装上却一次没被调用，它的显式与
 * 隐式都是 0，加载存活率却可能很高——这正是「安装未激活」要暴露的东西。
 */
import { readEvents } from './profile.js'
import { packageOf } from './attribution.js'

/** 多少天内算「活跃」。 */
const DEFAULT_ACTIVE_WINDOW_DAYS = 30

/**
 * 归一一个归属值。
 *
 * 事件流是长期累积的：早先的版本把子模块当成独立插件记下来（同一个包出现七条），
 * 后来的版本改成按包归一。统计这一侧统一一次，历史行和新行才不会分裂成两个
 * 插件。
 * @param {string} pluginId 归属值。
 * @returns 归一后的归属值。
 */
export function normalizePluginId(pluginId) {
  if (typeof pluginId !== 'string' || !pluginId.startsWith('pkg:')) return pluginId
  return `pkg:${packageOf(pluginId.slice(4))}`
}

/**
 * 一个插件的累加器。
 * @returns 累加器。
 */
function newBucket() {
  return {
    calls: 0,
    errors: 0,
    explicit: 0,
    implicit: 0,
    durations: [],
    sessions: new Set(),
    lastSeen: null,
    loadedBoots: new Set(),
    names: new Set(),
  }
}

/**
 * 算 P95。
 * @param {number[]} values 耗时数组。
 * @returns P95 毫秒数；没有样本时为 null。
 */
export function percentile95(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  return sorted[Math.max(0, index)]
}

/**
 * 取当前时刻：接受毫秒数或取时函数，方便测试注入。
 * @param {unknown} value 毫秒数或函数。
 * @returns 毫秒数。
 */
function resolveNow(value) {
  if (typeof value === 'function') return value()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  return Date.now()
}

/**
 * 算统计。
 *
 * @param {object[]} rows 事件行。
 * @param {object} [options] `now` 时钟、`activeWindowDays` 活跃窗口、
 *   `profiles` FR-3 的档案（用来合并「安装未激活」）。
 * @returns 统计结果。
 */
export function computeStats(rows, options = {}) {
  const now = resolveNow(options.now)
  const windowMs = (options.activeWindowDays ?? DEFAULT_ACTIVE_WINDOW_DAYS) * 24 * 60 * 60 * 1000

  const sessions = new Set()
  const boots = new Set()
  let agentSteps = 0
  /** 用户批准过的工具调用：这些算显式，不算隐式。 */
  const approvedCalls = new Set()
  const buckets = new Map()

  /**
   * 取某个归属的累加器。
   * @param {string} pluginId 归属。
   * @returns 累加器。
   */
  function bucketOf(rawId) {
    const pluginId = normalizePluginId(rawId)
    let bucket = buckets.get(pluginId)
    if (bucket === undefined) {
      bucket = newBucket()
      buckets.set(pluginId, bucket)
    }
    return bucket
  }

  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    const kind = row.kind
    if (kind === 'session') {
      if (typeof row.sessionId === 'string') sessions.add(row.sessionId)
      continue
    }
    if (kind === 'turn') {
      if (typeof row.steps === 'number' && Number.isFinite(row.steps)) agentSteps += row.steps
      continue
    }
    if (kind === 'boot') {
      if (typeof row.boot === 'string') boots.add(row.boot)
      continue
    }
    if (kind === 'approval') {
      if (typeof row.callId === 'string') approvedCalls.add(row.callId)
      continue
    }
    if (kind === 'plugin') {
      if (typeof row.pluginId === 'string') {
        const bucket = bucketOf(row.pluginId)
        if (typeof row.boot === 'string') bucket.loadedBoots.add(row.boot)
      }
      continue
    }
    if (kind !== 'tool' && kind !== 'skill' && kind !== 'command') continue

    const pluginId = typeof row.pluginId === 'string' && row.pluginId !== '' ? row.pluginId : 'unknown'
    const bucket = bucketOf(pluginId)
    bucket.calls += 1
    if (row.error === true) bucket.errors += 1
    if (typeof row.durationMs === 'number' && Number.isFinite(row.durationMs)) {
      bucket.durations.push(row.durationMs)
    }
    if (typeof row.sessionId === 'string' && row.sessionId !== '') bucket.sessions.add(row.sessionId)
    if (typeof row.name === 'string' && row.name !== '') bucket.names.add(row.name)
    if (typeof row.ts === 'number' && (bucket.lastSeen === null || row.ts > bucket.lastSeen)) {
      bucket.lastSeen = row.ts
    }

    // 显式与隐式不重叠：用户批准过的工具调用算显式。
    const approved = typeof row.callId === 'string' && approvedCalls.has(row.callId)
    const explicit =
      approved ||
      (kind === 'command' && row.source === 'user') ||
      (kind === 'skill' && row.source === 'user-gesture')
    if (explicit) bucket.explicit += 1
    else bucket.implicit += 1
  }

  const bootCount = boots.size
  const sessionCount = sessions.size
  const declaredByPlugin = new Map()
  if (Array.isArray(options.profiles)) {
    for (const profile of options.profiles) {
      if (typeof profile?.pluginId !== 'string') continue
      declaredByPlugin.set(normalizePluginId(profile.pluginId), profile.declaredButInactive ?? [])
    }
  }

  const plugins = [...buckets.entries()].map(([pluginId, bucket]) => ({
    pluginId,
    name: bucket.names.size > 0 ? [...bucket.names][0] : pluginId,
    calls: bucket.calls,
    errors: bucket.errors,
    errorRate: bucket.calls === 0 ? 0 : bucket.errors / bucket.calls,
    p95Ms: percentile95(bucket.durations),
    explicit: bucket.explicit,
    implicit: bucket.implicit,
    explicitRate: sessionCount === 0 ? 0 : bucket.explicit / sessionCount,
    implicitRate: agentSteps === 0 ? 0 : bucket.implicit / agentSteps,
    survivalRate: bootCount === 0 ? 0 : bucket.loadedBoots.size / bootCount,
    sessions: bucket.sessions.size,
    active30d: bucket.lastSeen !== null && now - bucket.lastSeen <= windowMs,
    lastSeen: bucket.lastSeen,
    declaredButInactive: declaredByPlugin.get(pluginId) ?? [],
  }))
  // 显式多的排前面；显式一样多时看总调用数。隐式与加载存活各看各的，不混排。
  plugins.sort((a, b) => b.explicit - a.explicit || b.calls - a.calls || a.pluginId.localeCompare(b.pluginId))

  return {
    generatedAt: now,
    activeWindowDays: options.activeWindowDays ?? DEFAULT_ACTIVE_WINDOW_DAYS,
    totals: {
      activeSessions: sessionCount,
      agentSteps,
      boots: bootCount,
      plugins: plugins.length,
      calls: plugins.reduce((sum, plugin) => sum + plugin.calls, 0),
      explicitCalls: plugins.reduce((sum, plugin) => sum + plugin.explicit, 0),
      implicitCalls: plugins.reduce((sum, plugin) => sum + plugin.implicit, 0),
    },
    plugins,
  }
}

/**
 * 从事件文件算统计。
 * @param {string} eventsFile 事件文件。
 * @param {object} [options] 同 computeStats。
 * @returns 统计结果。
 */
export function statsFromFile(eventsFile, options = {}) {
  return computeStats(readEvents(eventsFile), options)
}
