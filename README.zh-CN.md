<div align="center">

# toomuch-plugins

**给 DSH Web 侧栏腾点地方。** · *Too many plugins, too little room.*

[![license](https://img.shields.io/github/license/rivenshanghai/dsh-toomuch-plugins)](https://github.com/rivenshanghai/dsh-toomuch-plugins/blob/main/LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](https://nodejs.org)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-plugin-blue)](https://github.com/rivenshanghai/dsh-toomuch-plugins)
[![topic](https://img.shields.io/badge/topic-dsh--plugin-8A2BE2)](https://github.com/topics/dsh-plugin)

[English](README.md) | [简体中文](README.zh-CN.md)

</div>

---

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）Web
侧栏做减法的小插件集。

目前只内置一个插件：

| 插件 | 作用 |
| --- | --- |
| 侧栏面板收起 | 把工作区上方的「全局面板入口」列收成侧栏底部的一个开关 |

## 为什么

DSH Web 侧栏从上到下依次是：品牌行 → 新会话 → **全局面板入口** → 工作区 → 设置。

每个往侧栏加一项的插件都会在这列里加一行：插件、插件市场、定时任务、MCP
Studio、上下文、技能管理器、系统监控……七行大概 280px，工作区区域被压得只剩几个会话。

这个插件只做一件事：**把这一列全局面板入口收起来**，需要时再展开。

## 特性

- **默认收起** —— 装上之后工作区立刻多出约 280px。
- **只要一个开关** —— 放在侧栏底部，「设置」那一行的上面。
- **记住选择** —— 存在 `localStorage`，刷新、重启都保持。
- **不碰别的东西** —— 不动任何面板、工作区或 Host 行为，只切换侧栏本来就会渲染的那个列表元素的显示状态。
- **跟随主题** —— 只用 `--dsw-alias-*` 主题变量，明暗主题都一致。
- **窄栏友好** —— 侧栏收成 56px rail 时，开关变成一个圆形图标按钮。

## 安装

本插件是「仓库根即包」的形式：根 `package.json` 里就声明了 `dsh.bundle` 清单，
所以 DSH 可以直接从 GitHub 安装。

```sh
# 从 GitHub 安装
dsh plugin --profile web add github:rivenshanghai/dsh-toomuch-plugins

# 或者从本地 clone
git clone https://github.com/rivenshanghai/dsh-toomuch-plugins.git
dsh plugin --profile web add /path/to/dsh-toomuch-plugins
```

`dsh plugin` 实际是把参数转交给 profile 里的 `pnpm`。装完之后还要在 DSH 的插件设置里
**启用它**（它会被写进 profile 的 `dsh.profile.bundles`），然后刷新页面。

如果已经被收录进插件市场：在 DSH 里打开 **设置 → 插件市场**，搜索 `toomuch-plugins`。

**验证方式：** 侧栏底部「设置」上面会多出一行「收起全局面板 / 展开全局面板」，
同时那列全局面板入口消失。

环境要求：带 `web` profile 的 DSH（DeepSeek Harness）；Node.js ≥ 20。

## 实现原理

`src/client.js` 做三件事：

1. 在侧栏底部插槽 `sidebar.footer.action` 注册一个开关按钮（即「设置」旁边那一行）；
2. 从自己的根节点向上回溯，找到侧栏根节点下的直接子元素 `<nav>` —— 那就是全局面板
   列表 —— 切换它的 `display`；
3. 把选择写进 `localStorage`。

依据是 DSH 自己的 `@deepseek-ai/dsh-client-ui-sidebar`：`nav.panelList` 是侧栏根节点的
直接子元素，所以从底部按钮往上回溯一定能找到它。样式只用 `--dsw-alias-*` 主题变量，
样式表随组件一起挂载，卸载时一并消失。

不 import 任何 DSH 内部包，也不改动 DSH 的任何文件。完整约定见
[docs/design.md](docs/design.md)。

## 目录结构

```
.
├── package.json            插件清单：dsh.bundle.patch + dsh.client
├── cordis.patch.yml        往 profile 里插入插件加载行
├── src/
│   ├── index.js            Host 半边（不需要 Host 能力，apply 为空）
│   └── client.js           Client 半边：底部开关 + 收起/展开逻辑
├── locale/{en,zh}.json     插件列表里的标题与描述
├── docs/                   设计说明、市场提交、提交前清单
├── icon.svg                图标
├── CHANGELOG.md
└── LICENSE
```

## 已知限制

- 只收起**全局面板入口**这一列。品牌行、新会话、设置都保持原样 —— 在
  Linux / Windows 上品牌行里的「收起侧栏」是唯一的收起入口，把它藏起来等于少一个功能。
- 一个全局面板都没装时，侧栏不会渲染那个 `<nav>`，开关就是个无害的空操作。
- 目前只在 DSH Web（Linux）上验证过。

## 插件市场

DSH 插件收录在 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
目录里，而这个目录聚合的是所有带 **`dsh-plugin`** GitHub topic 的仓库。给本仓库加上这个
topic 之后，往那个目录提一个单文件的 PR 即可：条目文件是
`data/plugins/<owner>__<repo>.yml`，填上 `category`、一行 `description.en` 和可选的
`description.zh`（详细规则见那个仓库的 contributing guide）。

## 相关插件

- [dsh-sidebar-quiet](https://www.npmjs.com/package/dsh-sidebar-quiet) —— 把侧栏**底部**那些行（余额 / 导入 / 记忆 / 退出）折成一行
- [dsh-sidebar-buttons](https://github.com/lywusichen/dsh-sidebar-buttons) —— 管理侧栏底部按钮：拖动排序、显示 / 折进更多 / 隐藏
- [dsh-sidebar-pins](https://github.com/AndreyTepaykin/dsh-sidebar-pins) —— 在设置行上方加一个可收起的置顶会话块
- [dsh-sidebar-drawer](https://github.com/1dustycy/dsh-sidebar-drawer) —— 鼠标贴边悬停即可展开侧栏的抽屉
- [dsh-plugin-sidebar-visibility](https://github.com/Robert-Wang-08/dsh-plugin-sidebar-visibility) —— 在工作区层面隐藏 / 收起

## 参与贡献

欢迎提 issue 和 PR。请附上你的 DSH 版本、浏览器，以及侧栏底部有没有出现开关。改动尽量
聚焦：这个插件只做一件事，它依赖的 DOM 约定写在
[docs/design.md](docs/design.md) 里。

## 许可证

MIT © [rivenshanghai](https://github.com/rivenshanghai) —— 见 [LICENSE](LICENSE)。
