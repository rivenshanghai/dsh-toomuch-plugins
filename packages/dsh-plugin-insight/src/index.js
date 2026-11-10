/**
 * dsh-plugin-insight 的宿主入口。
 *
 * 三个半边在这里装起来：
 *
 *  - FR-1 采集层：订阅运行时事件，把观察到的事实写进本地 JSONL。
 *  - FR-2 归属解析层：回答「这次调用属于哪个插件」。
 *  - FR-3 能力档案 + FR-4 使用率统计：把事件流汇总成插件档案与三类口径。
 *
 * 这个包的 client 半边（src/client.js）在主工作区里渲染整页统计。
 * 没有出站请求，也不碰 DSH 的配置与会话目录。
 */
import { createAttributor } from './attribution.js'
import { createCollector } from './collect.js'
import { createProfiler } from './profile.js'
import { statsFromFile } from './stats.js'

/** Typert service key; also its namespace (the client mounts against it). */
const SERVICE_KEY = 'pluginInsight'
const NAMESPACE = 'pluginInsight'
/** Prototype marker the Typert gateway reads to discover remote methods. */
const REMOTE_METHODS = '@deepseek-ai/dsh-typert-protocol/remote-methods'

/**
 * Build a Typert-bound service: the gateway falls back to source-described
 * endpoints for provided services, so no zod manifest is needed. The marker on
 * the prototype publishes the methods; methodParameterNames parses each
 * parameter from source — keep the signatures simple.
 * @param serviceKey Service name the client mounts against.
 * @param namespace Namespace of the service.
 * @param methods Remote method names.
 * @param implementation The methods themselves.
 * @returns The service instance, ready for `ctx.provide`.
 */
function remoteService(serviceKey, namespace, methods, implementation) {
  const proto = { ...implementation }
  Object.defineProperty(proto, REMOTE_METHODS, {
    value: {
      version: 1,
      methods: methods.map((method) => ({ method, invocation: { kind: 'direct' } })),
    },
  })
  const service = Object.create(proto)
  Object.defineProperty(service, 'typertRemote', {
    value: { service, serviceKey, namespace },
  })
  return service
}

/** Pass-through codec: the payload crosses the wire unchanged. */
const PASS_THROUGH = { parse: (value) => value, create: () => ({ parse: (value) => value }) }

/**
 * 装配三层，并注册只读服务。
 * @param {object} ctx 插件上下文。
 * @returns 对内暴露的只读服务。
 */
export function apply(ctx) {
  const attributor = createAttributor(ctx)
  const collector = createCollector(ctx, { attributor })
  const profiler = createProfiler(ctx, {
    attributor,
    eventsFile: collector.store.file,
  })

  /**
   * 算使用率统计。
   * @returns 统计结果。
   */
  function stats() {
    return statsFromFile(collector.store.file, { profiles: profiler.profiles() })
  }

  const service = remoteService(SERVICE_KEY, NAMESPACE, ['stats', 'profiles'], {
    stats,
    profiles() {
      return profiler.profiles()
    },
  })

  ctx.provide(SERVICE_KEY, service)
  return service
}
