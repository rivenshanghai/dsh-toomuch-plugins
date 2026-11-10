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
| FR-3 能力档案 | 每个插件「能做什么」+「实际做了什么」 | `src/profile.js` |
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

## 能力档案（FR-3）

每格都要有证据来源，推不出来的留空并在 `unknown` 里点名，不拿猜测填表：

| 维度 | 来源 |
| --- | --- |
| `ui` | manifest 有 `dsh.client` → 有浏览器半边 |
| `tools` / `skills` / `commands` | 插件自报声明 ∪ 事件流里实际观察到的名字 |
| `hooks` / `data` / `auth` | **没有证据来源**，留空并在 `unknown` 里点名 |

`declaredButInactive` = 声明了但一次都没被调用过的名字，就是 PRD 说的「安装未激活」。

## 对内服务

宿主侧 `ctx.provide('pluginInsight', …)`，只读五个方法：

```js
const insight = ctx.get('pluginInsight')
insight.resolve({ kind: 'tool', name: 'docker_exec' })
// → { pluginId: 'pkg:@hyzyn/dsh-docker', confidence: 'high', candidates: [...] }
insight.listPlugins()      // 已加载的插件清单
insight.getAttributionMap()// 名称 → 归属 的静态映射
insight.profiles()         // 能力档案，按调用次数倒序
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
# 断言级：归属规则、手势识别、事件行组装、落盘、能力档案
node packages/dsh-plugin-insight/test/smoke.js

# 回放级：拿真实 profile 的编排行跑真实工具名，测命中率
dsh --profile web --dump-config > .dsh-dump.yml
node packages/dsh-plugin-insight/test/attribution-replay.js .dsh-dump.yml
```

回放是这套系统唯一能证明「匹配规则在真实插件生态上准不准」的手段。当前实测
41 个真实工具名：20 high / 17 medium / 4 unknown / **0 误判**。

## 已知边界

- **归属靠命名约定**：没有自报声明时，前缀启发式可能误判（例如工具名首段恰好与
  某个无关插件的包名片段相同）。置信度 `medium` / `low` 就是留给这种情况的信号。
- **带下划号的宿主核心工具认不出归属**：`create_goal` / `update_goal` /
  `send_message` 会落 `unknown`。宿主工具大多无前缀（`bash` / `read` / `edit`），
  少数带下划号的推不出归属，按 PRD「不硬猜」如实保留。
- **用户批准**记成独立的 `approval` 事件行，不与工具调用合并——两条流合并要处理
  时序竞争，收益不抵复杂度。
- 详见 `docs/adr/0003-插件归属解析.md`。
