# Changelog / 变更日志

All notable changes to this project are documented here. / 本项目的所有重要变更都记录在此。

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## Unreleased / 未发布

### Added / 新增

- **Plugin usage analysis** — a full page in the main workspace area (not a popup), living in the `packages/dsh-plugin-insight` bundle: the collector layer, the attribution layer and the page itself are all in place. The sidebar entry sits next to the 「插件操作记录」 icon and only shows once that bundle's client half announces itself; **it is hidden while the grid display is on**, because the grid is the plugin's own icon layout and the extra entry only gets in the way there. / **插件使用率分析** —— 主工作区的一整页（不是弹窗），代码在 `packages/dsh-plugin-insight` 包里：采集层、归属解析层与页面都已就位。侧栏入口在「插件操作记录」图标旁边，只有对方的 client 半边宣布就绪之后才出现；**开着网格显示时它不出现** —— 网格是本插件自己的图标布局，多一个入口只会添乱。

## 0.3.2 (2026-11-12)

> 这一版同时带上了此前起草为 0.4.0、但从未发布也从未打 tag 的内容（插件操作记录）。
> This release also carries what was drafted as 0.4.0 — never published, never tagged.

### Fixed / 修复

- **Grid display broke on DSH v0.2.2-rc.2** — that release moved the global-panel list into the sidebar's scroll viewport, so it now scrolls together with the workspace region. The plugin looked the list up by walking up from its footer button to the first ancestor with a **direct child** `<nav>`; in the new shape the list is not on that path at all (the scroll viewport is a sibling of the footer), so the lookup returned nothing and grid display, collapsing, the collapsed limit and the custom display order all silently did nothing — the settings page still showed the options, but nothing moved. The list is now found structurally in both shapes (a `<nav>` whose rows are labelled buttons), and the sidebar root is looked up separately, because the injected third-party entries (今日值得读 / 全局搜索 / 容器) still hang off the root rather than off the list. The new release also wraps every panel row in a cell of its own, so the collapsed limit now hides whole cells — the grid no longer keeps an empty cell per hidden row. / **DSH v0.2.2-rc.2 下网格显示失效** —— 该版本把全局面板列表挪进了侧栏的滚动视口，于是它和工作区一起滚动。本插件原先从底部开关向上回溯，找第一个含**直接子** `<nav>` 的祖先；新结构里列表根本不在这条路径上（滚动视口与底部开关是兄弟子树），查找落空，网格显示、折叠、收起限额与显示顺序**全部静默失效**——设置项还在，勾了没反应。现在两种形状都用结构判定找列表（装着带标签按钮行的 `<nav>`），侧栏根节点另找一次（绕槽插入的今日值得读 / 全局搜索 / 容器仍挂在根节点上）。该版本还把每个面板行包进了自己的格子里，收起限额因此按格子隐藏，网格里不再多出空格子。
- **DSH v0.2.2-rc.2's hover-only pin button no longer covers the grid icons** — that release gave every panel row an extra 「从左侧栏取消固定」 button that shows up on hover. In grid mode it lands on top of the icon, and the grid already lets the user arrange the icons themselves, so the grid hides it. List mode keeps it: unpinning a panel is DSH's own feature and this plugin has no replacement for it. / **DSH v0.2.2-rc.2 的「取消固定」按钮不再压在网格图标上** —— 该版本给每个面板行加了一个悬停出现的「从左侧栏取消固定」按钮；网格模式下它正好落在图标上，而网格本身已经能让用户自己排列图标，所以网格里把它藏掉。列表模式保留：取消固定是 DSH 自己的功能，本插件没有替代品。


### Added / 新增

- **Plugin activity log** — the sidebar footer gains an icon right of the 「收起 / 展开全局面板」 toggle; clicking it opens a window with two tabs: 「安装/删除」 (every record) and 「启用/禁用」 (the last month). The host half reads the profile manifest every few seconds, compares it with the state it recorded last time, and writes what was installed, removed, enabled or disabled — with the plugin name and the time — to `~/.dsh/plugins/dsh-toomuch-plugins/plugin-history.json`. It compares state rather than listening for change events because a plugin can be installed or removed from the settings panel, from the plugin market or from the `dsh` CLI, and only the first of those announces what it did. Upgrades are left out: a package that disappears and comes back with another version retracts the removal it started with. / **插件操作记录** —— 侧栏底部在「收起 / 展开全局面板」按钮右侧多一个图标，点开是一个带两个标签的窗口：「安装/删除」（全量）与「启用/禁用」（最近一个月）。Host 半边每隔几秒读一次 profile 清单，和上次记下的状态比一次，把安装、删除、启用、禁用的插件名与时间写入 `~/.dsh/plugins/dsh-toomuch-plugins/plugin-history.json`。之所以比状态而不是听变更事件：插件可以从设置页、插件市场或 `dsh` 命令行装/删，其中只有设置页那条路会广播自己的动作。升级不计入：换了版本又出现的包会把刚记下的那条删除撤掉。

### Fixed / 修复

- **The first run listed every installed plugin** — the plugins a profile already had were recorded as installs with the scan time, so the window opened on a list of 92 rows that were never operations. The current state is now taken as the baseline the comparison starts from, and nothing is listed until something actually changes. Baseline rows written by earlier versions are dropped when the log is read. / **首次运行会把已装的插件全列出来** —— profile 里已经装着的插件被记成一次安装，时间是扫描时刻，于是窗口一打开就是 92 条根本不是操作的记录。现在直接拿当前状态作为之后比对的基线，在真的发生变化之前不列任何东西；旧版本写下的 baseline 行在读取时丢掉。
- **An unreadable profile looked like an empty one** — if the profile manifest could not be read, the comparison saw no packages at all and recorded every installed plugin as removed. An unreadable profile is now an unknown state: nothing is written at all. / **读不到 profile 会被当成空 profile** —— 之前清单读不出来时，比对看到的是「一个包都没有」，于是把装着的插件全记成删除。现在读不到就是「不知道」，什么都不写。
- **Records were missed entirely** — the log was built from the plugin manager's `plugin-manager/operation` event, which only the settings page emits: installing or removing from the plugin market (which shells out to the CLI) or from `dsh plugin` produced no record at all, so a removed plugin never showed up. The log is now built by comparing the profile manifest with the last recorded state, which every path updates. / **记录会整条漏掉** —— 原来靠插件管理器的 `plugin-manager/operation` 事件，而这个事件只有设置页那条路会发：在插件市场（它 shell 出去调 CLI）或 `dsh plugin` 里装/删，一条都不会记，删掉的插件永远不出现。现在改成比对 profile 清单与上次记下的状态，所有路径都会更新清单。

### Changed / 变更

- **Activity rows are icons, and sorted by time** — the action column no longer spells 「安装 / 删除 / 启用 / 禁用」 as text (illegible at row height); each action is a 16px stroke icon, **install and enable in green** (the power symbol), **remove and disable in red** (the power symbol with a bar through it), with an `aria-label` for screen readers. The plugin name is 14px semibold and the time 13px, both larger than the body text. Both tabs are returned newest first, by timestamp. / **操作列为图标、按时间倒序** —— 操作列不再用文字写「安装 / 删除 / 启用 / 禁用」（行高下看不清），改为 16px 线条图标并按状态色着色：**安装、启用是绿色**（电源符号），**删除、禁用是红色**（电源符号加一道斜杠），并给屏幕阅读器留 `aria-label`；插件名 14px 半粗、时间 13px，都比正文大一号；两个标签页都按时间倒序返回。

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
