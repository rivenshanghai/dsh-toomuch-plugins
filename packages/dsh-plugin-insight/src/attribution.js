/**
 * 归属解析层（FR-2）：给定一次调用，回答「这是哪个插件的」。
 *
 * 运行时拿不到「工具名 → 插件」的官方映射——这是查证过的硬事实：
 * `ToolDefinition` 不带 owner 字段，`ctx.tools.register()` 不记录调用方，
 * 插件 manifest（`DshManifest`）也只声明 bundle / profile / client 三段，
 * 不列导出的工具。所以归属走两级来源：
 *
 *  1. 插件自报：插件在 package.json 的 `dsh.capabilities` 里列出自己注册的
 *     tool / command / skill 名，命中即 high——这是唯一精确的来源。
 *  2. 名名前缀启发式：工具名的下划线前缀（`docker_exec` → `docker_exec` /
 *     `docker`）归一化后与 loader 里的 bundle 行 id、模块名比对。归一化后
 *     完全相等记 high，落在模块名里的一段记 medium，命中多个插件记 low。
 *
 * 两条都不中就如实标 unknown——不硬猜。宿主自带（`@deepseek-ai/` 开头的
 * 基座包）记 builtin。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 官方基座包的模块前缀：命中它们的工具算宿主自带，不算用户插件。 */
const HOST_MODULE_PREFIX = '@deepseek-ai/'

/** MCP 工具名的固定形状：`mcp__<server>__<tool>`。 */
const MCP_PREFIX = 'mcp__'

/**
 * 归一化时丢弃的噪声词：出现在包名或行 id 里，但不带插件身份。
 * 例如 `dsh-mattpocock-skills-deck` 去掉 dsh / skills 后只剩 mattpocock / deck。
 */
const NOISE = new Set([
  'dsh', 'plugin', 'plugins', 'client', 'cli', 'ui', 'app', 'web', 'core',
  'base', 'runtime', 'service', 'tool', 'tools', 'suite', 'deepseek',
  'agent', 'agents', 'memory', 'server', 'client',
])

/**
 * 归一化一个标识：小写，下划线/空格/点统一成连字符。
 * @param {unknown} value 原始标识。
 * @returns 归一化后的字符串。
 */
export function normalize(value) {
  return String(value ?? '').toLowerCase().replace(/[_\s.]+/g, '-')
}

/**
 * 切出标识的词段。
 * @param {unknown} value 原始标识。
 * @returns 词段数组（已去空）。
 */
export function segments(value) {
  return normalize(value)
    .split(/[^a-z0-9]+/)
    .filter((segment) => segment !== '')
}

/**
 * 切出标识的「有信息量」的词段（去掉噪声词）。
 * @param {unknown} value 原始标识。
 * @returns 词段数组。
 */
export function significantSegments(value) {
  return segments(value).filter((segment) => !NOISE.has(segment))
}

/**
 * 工具名的下划线前缀候选，从长到短。
 *
 * `skill_manager_list` → `skill_manager_list` / `skill_manager` / `skill`。
 * 从长到短是为了让 `skill_manager` 抢先于 `skill` 命中更精确的插件。
 * @param {string} name 工具名。
 * @returns 候选前缀数组。
 */
export function prefixCandidates(name) {
  const parts = String(name ?? '').split('_').filter(Boolean)
  const candidates = []
  for (let count = parts.length; count > 0; count -= 1) {
    candidates.push(parts.slice(0, count).join('_'))
  }
  return candidates
}

/**
 * 候选词段是否作为连续一段出现在目标词段里。
 * @param {string[]} candidate 候选的词段。
 * @param {string[]} target 目标条目的词段。
 * @returns 是否命中。
 */
function containsRun(candidate, target) {
  if (candidate.length === 0 || candidate.length > target.length) return false
  for (let start = 0; start + candidate.length <= target.length; start += 1) {
    let matched = true
    for (let offset = 0; offset < candidate.length; offset += 1) {
      if (candidate[offset] !== target[start + offset]) {
        matched = false
        break
      }
    }
    if (matched) return true
  }
  return false
}

/**
 * 把 loader 的一个 bundle 行变成可归属对象。
 * @param {object} options 行的 options（`id` / `name`）。
 * @returns 可归属对象。
 */
function toEntry(options) {
  const id = typeof options?.id === 'string' ? options.id : ''
  const moduleName = typeof options?.name === 'string' ? options.name : ''
  const base = moduleName.includes('/')
    ? moduleName.slice(moduleName.lastIndexOf('/') + 1)
    : moduleName
  return {
    id,
    moduleName,
    /** 宿主基座包（官方）还是用户插件。 */
    host: moduleName.startsWith(HOST_MODULE_PREFIX),
    idNorm: normalize(id),
    moduleNorm: normalize(base),
    idSegments: significantSegments(id),
    moduleSegments: significantSegments(base),
  }
}

/**
 * 候选前缀与某个条目的匹配强度。
 * @param {string} candidate 候选前缀。
 * @param {object} entry 可归属对象。
 * @returns 'high' / 'medium' / null。
 */
function matchStrength(candidate, entry) {
  const norm = normalize(candidate)
  if (norm === '') return null
  // 完全相等：归一化后与行 id 或模块名一致（skill_manager ↔ skill-manager 走这条）。
  if (norm === entry.idNorm || norm === entry.moduleNorm) return 'high'
  // 落在模块名的一段里：deck ↔ dsh-mattpocock-skills-deck、study ↔ study-suite-runtime。
  const candidateSegments = significantSegments(candidate)
  if (containsRun(candidateSegments, entry.idSegments)) return 'medium'
  if (containsRun(candidateSegments, entry.moduleSegments)) return 'medium'
  return null
}

/**
 * 读取 profile 目录，插件自报声明要从这里的 node_modules 里取。
 * @param {object} ctx 插件上下文。
 * @returns profile 目录路径，或 null。
 */
function readProfileDir(ctx) {
  try {
    const profile = ctx.get('profileContext')
    if (!profile || typeof profile.dir !== 'string') return null
    return profile.dir
  } catch {
    // 没有 profile：自报声明这条路走不通，只剩前缀启发式。
    return null
  }
}

/**
 * 建归属解析器。
 *
 * 索引在第一次解析时构建，之后只在 loader 的行集合变化时重建——manifest
 * 不变就不重复解析。
 * @param {object} ctx 插件上下文。
 * @param {object} [options] `now` 用于测试注入时钟。
 * @returns 归属解析器。
 */
export function createAttributor(ctx, options = {}) {
  let profileDir = options.profileDir ?? null
  /** 模块 → 它自报声明的能力名列表；模块升级后随索引一起失效。 */
  const declarationCache = new Map()
  let index = null

  /**
   * profile 目录：自报声明要从这里的 node_modules 里取。
   * 延后到第一次用到时才解析，避免插件激活那一刻 profile 还没就绪。
   * @returns profile 目录路径，或 null。
   */
  function profileDirectory() {
    if (profileDir === null) profileDir = readProfileDir(ctx)
    return profileDir
  }

  /**
   * 列出 loader 里的 bundle 行。
   * @returns 行数组。
   */
  function loaderEntries() {
    try {
      const loader = ctx.loader ?? ctx.get('loader')
      if (!loader || typeof loader.entries !== 'function') return []
      return [...loader.entries()]
    } catch {
      // 拿不到 loader：归属全部落 unknown，不影响其它功能。
      return []
    }
  }

  /**
   * 读一个插件自报的能力名。
   * @param {string} moduleName 模块说明符。
   * @returns 声明的能力名数组。
   */
  function declarationsOf(moduleName) {
    if (declarationCache.has(moduleName)) return declarationCache.get(moduleName)
    const names = []
    const dir = profileDirectory()
    if (dir) {
      try {
        const manifest = JSON.parse(
          readFileSync(join(dir, 'node_modules', moduleName, 'package.json'), 'utf8'),
        )
        const capabilities = manifest?.dsh?.capabilities
        if (capabilities && typeof capabilities === 'object') {
          for (const key of ['tools', 'commands', 'skills']) {
            const list = capabilities[key]
            if (!Array.isArray(list)) continue
            for (const name of list) {
              if (typeof name === 'string' && name !== '') names.push(name)
            }
          }
        }
      } catch {
        // 没有这个包，或没有声明：按「没声明」处理。
      }
    }
    declarationCache.set(moduleName, names)
    return names
  }

  /**
   * 构建（或复用）索引。
   * @returns 索引。
   */
  function ensure() {
    const rows = loaderEntries()
    const signature = rows
      .map((row) => `${row.options?.id ?? ''}@${row.options?.name ?? ''}`)
      .join('|')
    if (index !== null && index.signature === signature) return index
    const entries = rows.map((row) => toEntry(row.options))
    /** 能力名 → 模块说明符。 */
    const declared = new Map()
    for (const entry of entries) {
      for (const name of declarationsOf(entry.moduleName)) {
        if (!declared.has(name)) declared.set(name, entry.moduleName)
      }
    }
    index = { signature, entries, declared }
    return index
  }

  /**
   * 归属解析。
   *
   * @param {object} event 事件，形状 `{ kind, name }`。
   * @returns `{ pluginId, confidence, candidates }`。
   */
  function resolve(event) {
    const kind = typeof event?.kind === 'string' ? event.kind : 'tool'
    const name = typeof event?.name === 'string' ? event.name : ''
    if (name === '') return { pluginId: 'unknown', confidence: 'unknown', candidates: [] }

    const current = ensure()

    // 1) 插件自报：唯一精确的来源。
    const declaredModule = current.declared.get(name)
    if (declaredModule !== undefined) {
      return { pluginId: `pkg:${declaredModule}`, confidence: 'high', candidates: [declaredModule] }
    }

    // 2) MCP 工具：归属到 MCP 服务器，不归属到承载它的插件。
    if (name.startsWith(MCP_PREFIX)) {
      const server = name.slice(MCP_PREFIX.length).split('__')[0]
      if (server !== '') return { pluginId: `mcp:${server}`, confidence: 'high', candidates: [] }
    }

    // 3) 技能：由 kind 决定，落到 skill:<名字>；若某插件自报了这个技能名，
    //    上面的自报分支已经先把它归给了那个插件。
    if (kind === 'skill') {
      return { pluginId: `skill:${name}`, confidence: 'high', candidates: [] }
    }

    // 4) 名名前缀启发式：从长前缀往短试，先精确后宽松。
    for (const candidate of prefixCandidates(name)) {
      const hits = []
      for (const entry of current.entries) {
        const strength = matchStrength(candidate, entry)
        if (strength !== null) hits.push({ entry, strength })
      }
      if (hits.length === 0) continue
      // 用户插件优先于宿主基座：同一前缀命中两边时，报用户插件更有信息量。
      const userHits = hits.filter((hit) => !hit.entry.host)
      const chosen = userHits.length > 0 ? userHits : hits
      const modules = [...new Set(chosen.map((hit) => hit.entry.moduleName))]
      const confidence = chosen.some((hit) => hit.strength === 'high')
        ? 'high'
        : modules.length > 1
          ? 'low'
          : 'medium'
      const moduleName = modules[0]
      const pluginId = chosen[0].entry.host ? 'builtin' : `pkg:${moduleName}`
      return { pluginId, confidence, candidates: modules }
    }

    // 5) 没有下划线前缀的名字：宿主基座工具的形态（bash / read / edit …）。
    if (!name.includes('_')) {
      return { pluginId: 'builtin', confidence: 'medium', candidates: [] }
    }
    return { pluginId: 'unknown', confidence: 'unknown', candidates: [] }
  }

  /**
   * 已加载的插件清单。
   * @returns 插件元信息数组。
   */
  function listPlugins() {
    const current = ensure()
    return current.entries.map((entry) => ({
      id: entry.id,
      moduleName: entry.moduleName,
      host: entry.host,
      declared: declarationsOf(entry.moduleName),
    }))
  }

  /**
   * 静态的「可调用名 → 归属」映射。
   *
   * 只收两类确定的键：插件自报的能力名，以及 bundle 行 id（生态里约定的
   * 工具名前缀）。前缀启发式的其余部分要在解析时才算得出来，不入表。
   * @returns 名称到归属的映射。
   */
  function getAttributionMap() {
    const current = ensure()
    const map = new Map()
    for (const entry of current.entries) {
      const pluginId = entry.host ? 'builtin' : `pkg:${entry.moduleName}`
      for (const name of declarationsOf(entry.moduleName)) map.set(name, pluginId)
      if (entry.id !== '') {
        map.set(entry.id, pluginId)
        map.set(entry.id.replace(/-/g, '_'), pluginId)
      }
    }
    return map
  }

  /**
   * 丢弃缓存，下次解析时重建。
   */
  function refresh() {
    declarationCache.clear()
    index = null
    ensure()
  }

  return { resolve, listPlugins, getAttributionMap, refresh, ensure }
}
