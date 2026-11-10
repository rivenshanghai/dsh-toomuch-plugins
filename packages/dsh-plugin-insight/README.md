# dsh-plugin-insight

> 采集 DSH 运行时事件，回答「**这一次调用属于哪个插件**」。

本地优先、不出站：事件只写到本机的 JSONL 文件，不做任何远程请求，也不碰 DSH 的
配置与会话目录。

---

## 它做什么

| 层 | 职责 | 位置 |
| --- | --- | --- |
| FR-1 采集层 | 订阅 dsh 运行时事件，只记录观察到的事实 | `src/collect.js` |
| FR-2 归属解析层 | 给定一次调用，回答它是哪个插件的 | `src/attribution.js` |
| 落盘 | 最小字段 JSONL 追加写 | `src/store.js` |

事件流写在 `<DSH_HOME>/plugins/dsh-plugin-insight/events.jsonl`
（`DSH_HOME` 未设时是 `~/.dsh`）。每行一条，只含归属统计需要的字段——**不写参数
正文与结果正文**。

## 归属怎么判

运行时拿不到「工具名 → 插件」的官方映射（`ToolDefinition` 不带 owner 字段、
`ctx.tools.register()` 不记录调用方、插件 manifest 也不声明导出的工具），所以
归属走两级来源：

1. **插件自报**——插件在 `package.json` 的 `dsh.capabilities` 里列出自己注册的
   `tools` / `commands` / `skills`，命中即 `high`。这是唯一精确的来源。
2. **名名前缀启发式**——工具名的下划线前缀（`docker_exec` → `docker`）归一化后
   与 loader 里的 bundle 行 id、模块名比对：归一化后完全相等记 `high`，落在模块名
   的一段里记 `medium`，命中多个插件记 `low`。

两条都不中就如实标 `unknown`——不硬猜。归属取值域：

```
pkg:<模块说明符>   用户插件
builtin            宿主自带（@deepseek-ai/ 开头的官方基座包）
mcp:<服务器名>     MCP 工具
skill:<技能名>     技能
unknown            认不出来
```

插件想把自己的工具标成精确归属，只要在 `package.json` 里加：

```json
{
  "dsh": {
    "capabilities": {
      "tools": ["my_tool"],
      "commands": ["my-command"],
      "skills": ["my-skill"]
    }
  }
}
```

## 对内服务

宿主侧 `ctx.provide('pluginInsight', …)`，只读四个方法：

```js
const insight = ctx.get('pluginInsight')
insight.resolve({ kind: 'tool', name: 'docker_exec' })
// → { pluginId: 'pkg:@hyzyn/dsh-docker', confidence: 'high', candidates: [...] }
insight.listPlugins()      // 已加载的插件清单
insight.getAttributionMap()// 名称 → 归属 的静态映射
insight.eventsFile()       // 事件流落盘位置
```

这是**内部 API**，不承诺跨版本稳定。

## 订阅的事件

| 事件 | 用途 |
| --- | --- |
| `tools/pre-execute` | 工具调用开始（callId、agent） |
| `tools/result` | 工具调用结束（耗时、是否出错） |
| `session/event` | `command/run`、`approval/asked`、`approval/decided` |
| `agent/pre-step` | 识别用户手写的 `/技能名` 手势 |
| `plugin-manager/changed` | 编排变化时记一份插件集合快照 |

## 验证

```sh
node packages/dsh-plugin-insight/test/smoke.js
```

## 已知边界

- **归属靠命名约定**：没有自报声明时，前缀启发式可能误判（例如工具名首段恰好与
  某个无关插件的包名片段相同）。置信度 `medium` / `low` 就是留给这种情况的信号。
- **核心工具里带下划号的那些**（如 `todo_write`）认不出归属，会落 `unknown`。
- **用户批准**记成独立的 `approval` 事件行，不与工具调用合并——两条流合并要处理
  时序竞争，收益不抵复杂度。
- 详见 `docs/adr/0003-插件归属解析.md`。
