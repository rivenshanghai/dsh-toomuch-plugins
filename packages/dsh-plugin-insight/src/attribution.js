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
 * 包的身份：去掉子路径。
 *
 * 一个包可以插多行并指向自己的子模块（`dsh-mattpocock-skills-deck/tools`、
 * `@example/p/plugins/runtime`）。归属的单位是**包**，不是行，所以比较前先
 * 归一到一个包名。
 * @param {string} moduleName 模块说明符。
 * @returns 包名。
 */
export function packageOf(moduleName) {
  const name = String(moduleName ?? '')
  if (name.startsWith('@')) {
    const parts = name.split('/')
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : name
  }
  return name.split('/')[0]
}

/**
 * 前段是否逐项等于后段的开头。
 * @param {string[]} head 待检查的前段。
 * @param {string[]} body 目标词段。
 * @returns 是否是其前缀。
 */
function isPrefix(head, body) {
  if (head.length === 0 || head.length > body.length) return false
  for (let index = 0; index < head.length; index += 1) {
    if (head[index] !== body[index]) return false
  }
  return true
}

/**
 * 候选前缀与某个条目的匹配强度。
 *
 * 只认三种有依据的形状，不做「任意位置包含」——实测那会让 `plugin_manager`
 * 因为一个 `manager` 就命中 `skill-manager`：
 *
 *  - 完全相等：归一化后与行 id 或模块名一致（`skill_manager` ↔ `skill-manager`）。
 *  - 条目是候选的开头：`docker` + `docker_exec`、`univer` + `univer_api`。
 *  - 候选是条目的开头：`ssh` + `dsh-ssh-manage`。
 *  - 候选首词等于条目的末段：`deck` + `dsh-mattpocock-skills-deck`（包名很长，
 *    真正携带身份的是最后那一段）。
 * @param {string} candidate 候选前缀。
 * @param {object} entry 可归属对象。
 * @returns 'high' / 'medium' / null。
 */
function matchStrength(candidate, entry) {
  const norm = normalize(candidate)
  if (norm === '') return null
  if (norm === entry.idNorm || norm === entry.moduleNorm) return 'high'
  const candidateSegments = significantSegments(candidate)
  if (candidateSegments.length === 0) return null
  for (const entrySegments of [entry.idSegments, entry.moduleSegments]) {
    if (isPrefix(entrySegments, candidateSegments)) return 'medium'
    if (isPrefix(candidateSegments, entrySegments)) return 'medium'
    if (candidateSegments[0] === entrySegments[entrySegments.length - 1]) return 'medium'
  }
  return null
}

/**
 * 模块名是不是一个包说明符（能当 npm 包名解析）。
 *
 * loader 树里混着两类东西：真正的包，和 cordis 自己的伪模块（`cordis:include`
 * 之类）。后者不是插件，归属该算宿主自带。
 * @param {string} moduleName 模块说明符。
 * @returns 是否是包说明符。
 */
function isPackageSpecifier(moduleName) {
  if (moduleName === '') return false
  if (moduleName.includes(':')) return false
  if (moduleName.startsWith('.') || moduleName.startsWith('/')) return false
  return true
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
    /** 宿主基座包（官方）或 cordis 伪模块，而不是用户插件。 */
    host: moduleName.startsWith(HOST_MODULE_PREFIX) || !isPackageSpecifier(moduleName),
    idNorm: normalize(id),
    moduleNorm: normalize(base),
    idSegments: significantSegments(id),
    moduleSegments: significantSegments(base),
  }
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
   * 在一批命中里挑归属：先按匹配强度分高下，再在同一档里偏向用户插件。
   *
   * 顺序反了会出事：宿主行 `skill`（`@deepseek-ai/dsh-skill`）精确命中，却会被
   * `skill-manager` 的弱命中抢走——这是实测到的第一个误判。
   * @param {Array<{entry: object, strength: string}>} hits 命中列表。
   * @returns `{ result, confidence }`。
   */
  function pickHit(hits) {
    const best = hits.some((hit) => hit.strength === 'high') ? 'high' : 'medium'
    const top = hits.filter((hit) => hit.strength === best)
    const userTop = top.filter((hit) => !hit.entry.host)
    const chosen = userTop.length > 0 ? userTop : top
    // 一个包可以插多行并指向自己的子模块，归属的单位是包，先按包去重再判断多候选。
    const packages = [...new Set(chosen.map((hit) => packageOf(hit.entry.moduleName)))]
    const confidence = best === 'high'
      ? 'high'
      : packages.length > 1 && userTop.length > 0
        ? 'low'
        : 'medium'
    const pluginId = chosen[0].entry.host ? 'builtin' : `pkg:${packages[0]}`
    return { result: { pluginId, confidence, candidates: packages }, confidence }
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

    // 4) 名名前缀启发式。
    //
    // 两趟，不按候选长短一轮定输赢：长候选未必更准。`docker_ps` 的长候选会先撞上
    // `docker` 行的「条目是候选开头」拿到 medium，如果就此返回，就永远走不到更短的
    // `docker` —— 那才是精确命中。这是实测到的第二个误判。
    const candidates = prefixCandidates(name)
    let fallback = null
    for (const candidate of candidates) {
      const hits = []
      for (const entry of current.entries) {
        const strength = matchStrength(candidate, entry)
        if (strength !== null) hits.push({ entry, strength })
      }
      if (hits.length === 0) continue
      const picked = pickHit(hits)
      if (picked.confidence === 'high') return picked.result
      if (fallback === null) fallback = picked.result
    }
    if (fallback !== null) return fallback

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
      const pluginId = entry.host ? 'builtin' : `pkg:${packageOf(entry.moduleName)}`
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
