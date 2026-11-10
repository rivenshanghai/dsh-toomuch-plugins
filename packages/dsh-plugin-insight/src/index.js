/**
 * dsh-plugin-insight 的宿主入口。
 *
 * 两个半边在这里装起来：
 *
 *  - FR-1 采集层：订阅运行时事件，把观察到的事实写进本地 JSONL。
 *  - FR-2 归属解析层：回答「这次调用属于哪个插件」，并对内提供只读查询。
 *
 * 这个包没有 client 半边——它不渲染界面，也不做任何出站请求。
 */
import { createAttributor } from './attribution.js'
import { createCollector } from './collect.js'

/**
 * 装配采集层与归属层，并注册只读服务。
 * @param {object} ctx 插件上下文。
 * @returns 对内暴露的只读服务。
 */
export function apply(ctx) {
  const attributor = createAttributor(ctx)
  const collector = createCollector(ctx, { attributor })

  const service = {
    /**
     * 解析一次调用的归属。
     * @param {object} event 事件，形状 `{ kind, name }`。
     * @returns `{ pluginId, confidence, candidates }`。
     */
    resolve(event) {
      return attributor.resolve(event)
    },
    /**
     * 已加载的插件清单。
     * @returns 插件元信息数组。
     */
    listPlugins() {
      return attributor.listPlugins()
    },
    /**
     * 静态的「可调用名 → 归属」映射。
     * @returns 名称到归属的映射。
     */
    getAttributionMap() {
      return attributor.getAttributionMap()
    },
    /**
     * 丢弃缓存，下次解析时重建索引。
     */
    refresh() {
      attributor.refresh()
    },
    /**
     * 事件流落盘位置。
     * @returns 文件路径。
     */
    eventsFile() {
      return collector.store.file
    },
  }

  ctx.provide('pluginInsight', service)
  return service
}
