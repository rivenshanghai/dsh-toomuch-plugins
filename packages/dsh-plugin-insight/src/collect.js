/**
 * 采集层（FR-1）：订阅 dsh 运行时事件，输出原始事件流。
 *
 * 这一层只做两件事：订阅、把观察到的事实写下来。它不内嵌任何归属规则——
 * 归属由 FR-2 的解析器给出，解析器不可用时归属记 unknown。
 *
 * 订阅的事件都是查证过真实存在的：
 *
 *  - `tools/pre-execute`（waterfall）：一次工具调用开始，带 callId 与 agent。
 *  - `tools/result`（emit）：一次工具调用结束，带冻结后的最终结果。
 *  - `session/event`：会话的持久事件流，含 `command/run`、`approval/asked`、
 *    `approval/decided`。
 *  - `agent/pre-step`（waterfall）：进入步骤前拿到本次认领的消息，用它识别
 *    用户手写的 `/技能名` 手势。
 *  - `plugin-manager/changed`：插件编排发生变化。
 *
 * 注意：PRD 里写的 `skill/invoke` 与 `agent/session-start` 在当前 DSH 里并不存在，
 * 技能调用走的是名为 `skill` 的工具，用户手势走的是 `agent/pre-step` 的消息。
 */
import { createStore } from './store.js'
import { packageOf } from './attribution.js'

/** 用户手写的技能手势 `/name`，与 dsh-tool-skill 的约定保持一致。 */
const SKILL_GESTURE = /(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g

/** 一次 DSH 进程的身份。dsh 启动次数 = 事件流里出现过的 boot 数。 */
const BOOT = `${Date.now()}-${process.pid}`

/**
 * 从消息批次里找出用户手写的技能手势。
 * @param {unknown} messages 本步骤认领的消息。
 * @returns 技能名数组。
 */
export function gestureSkills(messages) {
  const names = []
  if (!Array.isArray(messages)) return names
  for (const message of messages) {
    // 只有直接来自用户的文本才算手势，其它来源不能伪造。
    if (message?.source?.kind !== 'user') continue
    const content = message?.content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (block?.type !== 'text' || typeof block.text !== 'string') continue
      for (const match of block.text.matchAll(SKILL_GESTURE)) {
        const name = match[2]
        if (name !== undefined && !names.includes(name)) names.push(name)
      }
    }
  }
  return names
}

/**
 * 建采集器。
 * @param {object} ctx 插件上下文。
 * @param {object} [options] `store` 写入器、`attributor` 归属解析器、`now` 时钟。
 * @returns 采集器。
 */
export function createCollector(ctx, options = {}) {
  const store = options.store ?? createStore()
  const attributor = options.attributor
  const clock = typeof options.now === 'function' ? options.now : () => Date.now()
  /** callId → 调用开始时的快照。 */
  const pending = new Map()
  /** 审批 id → 审批问题，等审批结果回来时补齐。 */
  const approvals = new Map()
  /** `会话 id + 轮次` → 该轮跑过的最大步号。 */
  const stepsOfTurn = new Map()

  /**
   * 取会话标识；不同版本字段名不一致，取不到就留 null，不猜。
   * @param {unknown} session 会话对象。
   * @returns 会话 id 或 null。
   */
  function sessionIdOf(session) {
    if (!session) return null
    if (typeof session.id === 'string') return session.id
    if (typeof session.sessionId === 'string') return session.sessionId
    return null
  }

  /**
   * 取 agent 标识。
   * @param {unknown} agent agent 对象。
   * @returns agent id 或 null。
   */
  function agentIdOf(agent) {
    if (!agent) return null
    return typeof agent.id === 'string' ? agent.id : null
  }

  /**
   * 问归属层这次调用属于谁；归属层不可用时如实记 unknown。
   * @param {string} kind 事件类别。
   * @param {string} name 可调用名。
   * @returns 归属结果。
   */
  function attribute(kind, name) {
    if (!attributor || typeof attributor.resolve !== 'function') {
      return { pluginId: 'unknown', confidence: 'unknown', candidates: [] }
    }
    try {
      return attributor.resolve({ kind, name })
    } catch {
      // 归属失败不影响采集。
      return { pluginId: 'unknown', confidence: 'unknown', candidates: [] }
    }
  }

  /**
   * 写一行事件。
   * @param {object} row 事件行。
   */
  function write(row) {
    store.append(row)
  }

  /**
   * 记录当前已加载的插件集合。
   * @param {string} action 这次记录的原因。
   * @param {string|null} reason 编排变化的原因。
   */
  function recordPlugins(action, reason) {
    const plugins = attributor && typeof attributor.listPlugins === 'function'
      ? attributor.listPlugins()
      : []
    for (const plugin of plugins) {
      write({
        ts: clock(),
        kind: 'plugin',
        name: plugin.moduleName,
        action,
        reason: reason ?? null,
        boot: BOOT,
        pluginId: plugin.host ? 'builtin' : `pkg:${packageOf(plugin.moduleName)}`,
        confidence: 'high',
      })
    }
  }

  // 一次 DSH 启动记一行：dsh 启动次数是三个分母之一。
  write({ ts: clock(), kind: 'boot', boot: BOOT })

  // 工具调用开始：只记下身份与时间，归属等结果回来再算。
  ctx.on('tools/pre-execute', (exec, next) => {
    try {
      pending.set(exec.callId, {
        name: exec.name,
        ts: clock(),
        sessionId: sessionIdOf(exec.agent?.session),
        agentId: agentIdOf(exec.agent),
      })
    } catch {
      // 记不上就等结果时尽力补。
    }
    return next()
  })

  // 工具调用结束：写一行，含耗时与是否出错。
  ctx.on('tools/result', (exec, result) => {
    const start = pending.get(exec.callId)
    pending.delete(exec.callId)
    const toolName = start?.name ?? exec.name
    // 名为 `skill` 的工具承载的是技能调用，技能 id 在参数里。
    const isSkill = toolName === 'skill'
    const skillName = isSkill ? skillNameOf(exec.arguments) : null
    const kind = isSkill ? 'skill' : 'tool'
    const name = isSkill ? skillName : toolName
    if (name === null || name === '') return
    const attribution = attribute(kind, name)
    const row = {
      ts: start?.ts ?? clock(),
      kind,
      name,
      sessionId: start?.sessionId ?? null,
      agentId: start?.agentId ?? null,
      callId: String(exec.callId),
      durationMs: start === undefined ? null : clock() - start.ts,
      error: result?.isError === true,
      pluginId: attribution.pluginId,
      confidence: attribution.confidence,
    }
    if (isSkill) row.toolName = 'skill'
    write(row)
  })

  // 会话创建：active_sessions 是显式使用率的分母。
  ctx.on('session/created', (session) => {
    const sessionId = sessionIdOf(session)
    if (sessionId === null) return
    write({ ts: clock(), kind: 'session', sessionId, boot: BOOT })
  })

  // 会话持久事件流：命令、审批、步数。
  ctx.on('session/event', (session, event) => {
    const type = event?.type
    const data = event?.data
    const sessionId = sessionIdOf(session)
    if (type === 'step/start') {
      // 只记每个轮次跑到的最大步号；轮次结束时落一行，步数就是它。
      const key = `${sessionId}:${data?.turn ?? 0}`
      const step = typeof data?.step === 'number' ? data.step : 0
      const previous = stepsOfTurn.get(key)
      if (previous === undefined || step > previous) stepsOfTurn.set(key, step)
      return
    }
    if (type === 'turn/end') {
      const key = `${sessionId}:${data?.turn ?? 0}`
      const steps = stepsOfTurn.get(key) ?? 0
      stepsOfTurn.delete(key)
      write({ ts: clock(), kind: 'turn', sessionId, turn: data?.turn ?? null, steps })
      return
    }
    if (type === 'command/run') {
      const name = typeof data?.name === 'string' ? data.name : ''
      if (name === '') return
      const attribution = attribute('command', name)
      write({
        ts: clock(),
        kind: 'command',
        name,
        sessionId: sessionIdOf(session),
        source: sourceKindOf(data?.source),
        pluginId: attribution.pluginId,
        confidence: attribution.confidence,
      })
      return
    }
    if (type === 'approval/asked') {
      const id = String(data?.id ?? '')
      if (id === '') return
      approvals.set(id, { toolName: data?.toolName, callId: data?.callId })
      return
    }
    if (type === 'approval/decided') {
      const id = String(data?.id ?? '')
      const asked = approvals.get(id)
      approvals.delete(id)
      if (!asked || typeof asked.toolName !== 'string') return
      const attribution = attribute('tool', asked.toolName)
      write({
        ts: clock(),
        kind: 'approval',
        name: asked.toolName,
        sessionId: sessionIdOf(session),
        callId: asked.callId === undefined ? null : String(asked.callId),
        outcome: typeof data?.outcome === 'string' ? data.outcome : null,
        pluginId: attribution.pluginId,
        confidence: attribution.confidence,
      })
    }
  })

  // 用户手势触发的技能：它不产生工具调用，只在进入步骤的消息里出现。
  ctx.on('agent/pre-step', (payload, next) => {
    try {
      for (const name of gestureSkills(payload?.messages)) {
        const attribution = attribute('skill', name)
        write({
          ts: clock(),
          kind: 'skill',
          name,
          source: 'user-gesture',
          sessionId: sessionIdOf(payload?.agent?.session),
          agentId: agentIdOf(payload?.agent),
          pluginId: attribution.pluginId,
          confidence: attribution.confidence,
        })
      }
    } catch {
      // 手势识别失败不能挡住这一步。
    }
    return next()
  })

  // 编排变化：记下这一刻的插件集合，FR-3 的加载存活统计靠它。
  ctx.on('plugin-manager/changed', (change) => {
    try {
      recordPlugins('composition-changed', typeof change?.reason === 'string' ? change.reason : null)
    } catch {
      // 编排变了但记不上，不影响其它采集。
    }
  })

  // 启动时的插件集合快照。
  recordPlugins('startup', null)

  return { store, pending, approvals, recordPlugins }
}

/**
 * 取 `skill` 工具参数里的技能名。
 * @param {unknown} args 工具参数。
 * @returns 技能名或 null。
 */
function skillNameOf(args) {
  const name = args?.name
  return typeof name === 'string' && name !== '' ? name : null
}

/**
 * 取命令来源的用户/模型标记。
 * @param {unknown} source 命令来源。
 * @returns 字符串或 null。
 */
function sourceKindOf(source) {
  if (typeof source === 'string') return source
  if (source && typeof source === 'object' && typeof source.kind === 'string') return source.kind
  return null
}
