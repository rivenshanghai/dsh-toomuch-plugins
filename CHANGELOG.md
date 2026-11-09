# Changelog / 变更日志

All notable changes to this project are documented here. / 本项目的所有重要变更都记录在此。

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## 0.4.0 (2026-11-09)

### Added / 新增

- **Plugin activity log** — the sidebar footer gains an icon right of the 「收起 / 展开全局面板」 toggle; clicking it opens a window with two tabs: 「安装/删除」 (every record) and 「启用/禁用」 (the last month). The host half listens for DSH's `plugin-manager/operation` events and writes what was installed, removed, enabled or disabled — with the plugin name and the time — to `~/.dsh/plugins/dsh-toomuch-plugins/plugin-history.json` . Upgrades are left out: DSH performs one as a removal plus an installation of the same package, so a removal followed by an installation of a *different* version is recognised as an upgrade and both records are dropped. A version exemption also changes a bundle without switching anything, so a toggle only counts when the enablement state really changed. / **插件操作记录** —— 侧栏底部在「收起 / 展开全局面板」按钮右侧多一个图标，点开是一个带两个标签的窗口：「安装/删除」（全量）与「启用/禁用」（最近一个月）。Host 半边监听 DSH 的 `plugin-manager/operation` 事件，把安装、删除、启用、禁用的插件名与时间写入 `~/.dsh/plugins/dsh-toomuch-plugins/plugin-history.json` 。升级不计入：DSH 的升级就是「先删后装同一个包」，所以「删除后紧跟一个不同版本的重装」会被判定为升级，两条记录一并丢弃。版本豁免同样只动 bundle 而不改变开关状态，因此只有开关状态真的变了才算一次启停。
- **First-run scan** — the first time the plugin runs in a profile it has no history yet, so it scans the profile once and records the plugins that were already there (and whether they are enabled) as the starting point. Those rows carry the scan time with an 「初始」 marker, so the time column is never blank. / **首次扫描** —— 插件在某 profile 首次运行时还没有历史，于是扫一遍 profile，把已经装着的插件（以及它们当前是开是关）作为起点记下来；这些行带上扫描时间并标一个「初始」小标记，时间列不会空着。

### Fixed / 修复

- **A removal was lost when the window was not opened at the right moment** — removals used to be held in memory for a few seconds (to tell an upgrade apart) and written only when the window asked for the log. Delete a plugin and open the window at once and nothing was written; close the window and the record never reached the disk at all, and a restart dropped it outright. A removal is now written as it settles and an upgrade retracts that record afterwards, so the log no longer depends on when the window happens to be opened. / **删除记录会漏掉** —— 删除原先在内存里压几秒（为了识别升级），只有窗口来取日志时才写盘。删完立刻开窗口，什么都不会写；关掉窗口后这条记录就再也到不了磁盘，重启更是直接丢。现在删除一确认就落盘，升级再把那条回撤掉，日志不再取决于窗口什么时候被打开。

### Changed / 变更

- **Activity rows are icons, and sorted by time** — the action column no longer spells 「安装 / 删除 / 启用 / 禁用」 as text (illegible at row height); each action is a 14px stroke glyph on its state colour (down-arrow for install, up-arrow for remove, power-on for enable, power-off for disable) with an `aria-label` for screen readers. Both tabs are returned newest first, by timestamp. / **操作列改为图标并按时间倒序** —— 操作列不再用文字写「安装 / 删除 / 启用 / 禁用」（行高下看不清），改为按状态色画 14px 线条图标（安装向下箭头、删除向上箭头、启用电源开、禁用电源关），并给屏幕阅读器留 `aria-label`；两个标签页都按时间倒序返回。

## 0.3.1 (2026-11-03)

### Fixed / 修复

- **Order picker is drawn by the page, not by a native `<select>`** — a native `<select>` popup is painted by the browser or the OS, so page CSS cannot reach it: in the dark theme its rows stayed unreadable, and the invisible popup still swallowed clicks and wheel events, which left the settings page unscrollable. The 「插件显示顺序」 picker is now a page-drawn dropdown — a trigger button plus a list of item buttons, all on theme tokens — that expands in flow so a scrolling panel can never crop it, closes on Escape or an outside click, and keeps the 20-entry cap and the disabled state. / **顺序下拉改为页面自绘，不再用原生 `<select>`** —— 原生下拉弹层由浏览器或操作系统绘制，页面 CSS 够不着：深色主题下它的列表文字看不见，而看不见的弹层照样吞掉点击与滚轮，于是设置页也滚不动。现在「插件显示顺序」改由页面自绘下拉（触发按钮 + 列表项按钮，配色全走主题 token），在文档流内展开、滚动面板不会裁掉它，Esc 或点外部关闭，20 项上限与禁用态照旧。

## 0.3.0 (2026-10-30)

### Added / 新增

- **Plugin display order** — the display settings page gains a 「插件显示顺序」 section: pick panels one by one from a dropdown; the list order is the sidebar display order (applied as lossless CSS `order` overrides). Capped at 20 entries; duplicates are dropped on save; per-row move up / move down / remove controls. The collapsed limit keeps the first N entries *visually*. / **插件显示顺序** —— 显示设置页新增「插件显示顺序」：从下拉框逐个挑选面板，列表顺序即侧栏显示顺序（以无损 CSS `order` 重排）。上限 20 项，重复项保存时自动去掉；每行带上移 / 下移 / 移除。收起限额按视觉顺序保留前 N 个。
- **Click counting** — clicking a panel entry reports its id to the plugin's host half over a hand-rolled Typert remote (`spcClicks.recordClick`, cost-meter style), which accumulates counts into `~/.dsh/plugins/dsh-toomuch-plugins/click-counts.json` . Best effort: if the remote is unavailable the sidebar keeps working without counts. / **点击计数** —— 点击面板入口会把手写 Typert 远程调用（`spcClicks.recordClick`，cost-meter 同款接线）报给本插件 Host 半边，累加写入 `~/.dsh/plugins/dsh-toomuch-plugins/click-counts.json`。尽力而为：远程不可用时侧栏照常工作、只是不计数。
- **Icon size picker** — the display settings page gains an 「图标尺寸」 row with three choices: small (12px), medium (the sidebar's own size, default) and large (24px). Applied as a marker class on the panel-list nav; the stylesheet scales the row glyphs, in list and grid mode alike, and an unknown stored value falls back to medium. / **图标尺寸** —— 显示设置页新增「图标尺寸」行，三档：小（12px）/ 中（侧栏原生尺寸，默认）/ 大（24px）。以 nav 标记类套用，样式表缩放行内图标，列表与网格模式都生效；脏值读回回「中」。
- **Third-party entries in the order dropdown** — the display-order dropdown now also lists the bundles that insert themselves beside the panel list instead of through `sidebar.panellist` (今日值得读 / 全局搜索 / 容器 and other `data-dsh-*-entry` followers), discovered generically from their attribute name, plus slot panels registered late (上下文洞察, which registers behind a settings gate — the tab now re-renders on slot changes). Listing one makes the order real: listed entries are adopted into the nav where CSS `order` can reach them, and released back when the order is cleared. Click counting walks the click target up to the entry, so clicks on the icon or the search input count too. / **第三方条目进下拉** —— 显示顺序下拉现在也会列出那些绕过 `sidebar.panellist`、自己插在面板列表旁的条目（今日值得读 / 全局搜索 / 容器等沿用 `data-dsh-*-entry` 约定的插件，按属性名通用发现），以及后注册的槽位面板（上下文洞察——它挂在设置开关后才注册，设置页现在随槽位变化重渲染）。列进列表的条目会被收养进 nav，CSS `order` 才够得着，清空顺序后放回原位。点击计数改为从点击目标向上找条目，点图标、点搜索框也计数。

## 0.2.0 (2026-10-26)

### Added / 新增

- **Display settings page** — Settings → Built-in plugins gains a "Sidebar panel display" tab, registered through the `settings.plugins.tab` slot (same mechanism the built-in inventory tab uses). / **显示设置页** —— 设置 → 内置插件 新增「侧栏面板显示」页，走 `settings.plugins.tab` 槽注册（与内置「插件列表」同一机制）。
- **Partial list while collapsed** — when the panels are collapsed the list can keep showing the first N entries (list mode, 0–5) or the first N rows (grid mode, 0–3, rows × icons); 0 keeps everything collapsed (the original behaviour). / **收起时保留部分入口** —— 收起后列表可保留前 N 个入口（列表模式 0–5）或前 N 行（网格模式 0–3，行 × 列）；0 为全部收起，与原行为一致。
- **Grid display mode** — the global-panel entry list can show icons only, with each panel's name as a hover tooltip; icons per row configurable 2–4. Preferences live in `localStorage` (`dsh.sidebar-panel-collapse.display`); defaults keep the native look, corrupt or out-of-range values fall back safely. **Injected entries included** — bundles that insert their own sidebar buttons beside the panel list (following the `data-dsh-*-entry` convention, e.g. 今日值得读 / 全局搜索 / 容器) are adopted into the grid while it is on and put back in place when it is off. / **网格显示模式** —— 全局面板入口只显示图标，面板名进悬停提示；每行图标数 2–4 可调。偏好存 `localStorage`（`dsh.sidebar-panel-collapse.display`），默认保持原生外观，脏值 / 越界值安全回退。**注入式入口一并纳入** —— 那些绕过面板槽、自己往侧栏插按钮的插件（沿用 `data-dsh-*-entry` 约定，如今日值得读 / 全局搜索 / 容器）开启网格时被收养进网格，关闭时还原原位。
- Zero-dependency smoke check `test/smoke.js` (`node test/smoke.js`). / 零依赖冒烟检查 `test/smoke.js`。

## 0.1.1 (2026-10-22)

### Changed / 变更

- Published to npm as **`dsh-toomuch-plugins`** — the package name now matches the repository name, and the bundle id in `cordis.patch.yml` plus the client module id follow it. / 包名改为 **`dsh-toomuch-plugins`**（与仓库同名），`cordis.patch.yml` 的 bundle id 与 client 模块 id 同步改名。
- `package.json` is no longer `private`, so the package can be published. / 去掉 `package.json` 里的 `private`，可以正式发布到 npm。

## 0.1.0 (2026-10-19)

### Added / 新增

- First public release. / 首个公开版本。
- Still on `0.x`: plugin behaviour and the install path may still change; `1.0` comes after the interface settles. / 当前为 `0.x` 版本：插件行为与安装方式仍可能调整，接口稳定后再进 `1.0`。
- **Sidebar panel collapse** — collapses the global-panel entry list above the workspace in the DSH Web left sidebar into a single toggle in the sidebar footer. The choice is remembered in `localStorage` and survives reloads. / **侧栏面板收起** —— 把 DSH Web 左栏工作区上方的全局面板入口收起成侧栏底部的一个开关，选择记在 `localStorage` 里，刷新后保持。
- Works in the narrow 56px rail, where the toggle collapses into a round icon button. / 窄栏（56px rail）下自动变成圆钮。

[Unreleased]: https://github.com/rivenshanghai/dsh-toomuch-plugins/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/rivenshanghai/dsh-toomuch-plugins/releases/tag/v0.3.1
[0.3.0]: https://github.com/rivenshanghai/dsh-toomuch-plugins/releases/tag/v0.3.0
[0.2.0]: https://github.com/rivenshanghai/dsh-toomuch-plugins/releases/tag/v0.2.0
[0.1.1]: https://github.com/rivenshanghai/dsh-toomuch-plugins/releases/tag/v0.1.1
[0.1.0]: https://github.com/rivenshanghai/dsh-toomuch-plugins/releases/tag/v0.1.0
