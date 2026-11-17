# Changelog / 变更日志

All notable changes to this project are documented here. / 本项目的所有重要变更都记录在此。

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## 0.4.0 (2026-11-13)

### Added / 新增

- **Workspace favorites** — a project row's context menu gains a 「我的最爱」 entry as its **first line** (`ctx.contextMenus`, order 50, ahead of 重命名 at 100). It is a switch: run it once and the project is starred, run it again and the star is gone; the menu icon is a filled star when the project is starred and an outline star otherwise. A starred project shows a small **yellow star** after its name in the sidebar, always visible (not hover-only). Stars are stored in the plugin's own file, `~/.dsh/plugins/dsh-toomuch-plugins/favorites.json`, keyed by the project's **absolute path** — so deleting a workspace and adding the same directory back keeps the star, and the stars follow the DSH home rather than the browser. Written atomically (tmp file + rename), so a crash mid-write leaves the previous list intact.

  **工作区收藏** —— 项目行的右键菜单多一条「我的最爱」，而且永远是**第一行**（走 `ctx.contextMenus`，order 50，排在「重命名」的 100 之前）。它是一个开关：点一次收藏，再点一次取消；已收藏时菜单图标是实心星，未收藏是空心星。被收藏的项目在侧栏项目名后面显示一颗**黄色小星**，常显而不是悬停才出现。收藏存在插件自己的文件 `~/.dsh/plugins/dsh-toomuch-plugins/favorites.json` 里，以项目的**绝对路径**为键 —— 所以删掉工作区再把同一个目录加回来，星还在；换浏览器也还在。写盘是原子写（临时文件 + 改名），写一半崩溃只会留下上一份完整清单。

- **Project filters in 「视图选项 → 筛选会话」** — the host's view-options menu gains three switches: 「仅显示我的最爱项目」、 「仅显示最近 {n} 天」、 「仅显示最新 {m} 个项目」，each with a check mark when on and none when off. They combine with **AND**: turn on two and only projects that pass both stay. 「最近 / 最新」 follow each project's **last session activity**, not its registration date, and a project that never had a session counts as the oldest. Filtered-out projects take their session rows with them (the flat view and search results are filtered the same way); sessions that belong to no project are left alone. In the nested workspace-tree view a child whose parent was filtered out is hidden too, so the tree never shows an orphan row. Clicking a switch does not close the menu — users usually turn on two in a row.

  **「视图选项 → 筛选会话」里的三个项目筛选** —— 宿主的视图选项菜单多三个开关：「仅显示我的最爱项目」「仅显示最近 {n} 天」「仅显示最新 {m} 个项目」，选中打勾、不选没有勾。三者按**「与」**组合：开两个就只剩同时满足的项目。「最近 / 最新」看的是项目**最后一个会话的活跃时间**，不是注册时间；从来没有过会话的项目算最旧。被筛掉的项目连同它底下的会话行一起隐藏（平铺视图与搜索结果同样生效），不属于任何项目的会话不受影响。嵌套的工作区树视图里，父项目被筛掉时子项目也跟着隐藏，不会留下没有父行的孤儿行。点开关**不会关掉菜单** —— 用户通常要连着勾两个。

- **The two numbers live at the top of the settings page** — the 「侧栏面板显示」 tab opens with two number fields: days for 「仅显示最近」 (1–99, default 7) and projects for 「仅显示最新」 (1–9, default 3), followed by a note explaining that recent / latest follow each project's last session activity. A divider separates them from the sidebar-display settings below. The three switches and both numbers persist in the existing display-preferences blob; out-of-range or corrupt values fall back to the defaults.

  **两个数放在设置页最上方** —— 「侧栏面板显示」页一打开就是两个数字输入：「仅显示最近」的天数（1–99，默认 7）与「仅显示最新」的项目数（1–9，默认 3），下面一行说明「最近 / 最新按项目最后一个会话的活跃时间算」，再一条分割线把侧栏显示的设置隔到下面。三个开关和这两个数都存在原有的显示偏好里；越界或读坏的值一律回默认。

### Fixed / 修复

- **Nothing in the workspace area was matched: no star, and the filtered projects
  stayed in the list** — the plugin was written against a DSH build whose project
  rows carry `data-row-key="workspace:<id>"` and a `.projectText > .title` label,
  but the DSH actually running here (v0.2.2-rc.3's rewritten workspace browser)
  emits `data-row-key="ws-<id>"` and a `.bw-row-label`. The selectors matched
  nothing, so no star was drawn and no project row was hidden — while the session
  rows (whose key prefix did not change) were filtered correctly, which made it
  look like "the other projects are still listed but their sessions cannot be
  opened". Rows are now matched by **id** instead of by key prefix (the row key
  ends with the workspace / session id, whatever the prefix is), and the label is
  found by shape — the first element with text of its own and no child elements —
  rather than by comparing against the row's whole text, which the host changes
  when it asynchronously appends a session-count badge.
- **A filtered-out project's ancestor is now kept** — a project that does not pass
  the filter is hidden outright, and a project that *does* pass keeps its parent
  directory visible, so a qualifying child is never an orphan row in the tree.
  The parent is only a container: its own sessions stay hidden unless it qualifies
  too.
- **The star did not appear next to the project name** — the first implementation
  inserted it at the end of the project row, where the host's `flex: 1` text column
  pushed it to the far right of the row, right next to the hover-only action strip:
  it read as "no star at all". It is now inserted immediately after the project
  name (the text column is switched to a row layout, so the name keeps its own
  width and its ellipsis still works), and the name column is recognised
  structurally rather than by the host's hashed class name. The host renders the
  project row with React, which deletes the injected star when it rebuilds the
  row, so the watcher now notices removals as well and puts the star back.
  `node test/star-layout.mjs` checks the placement, the ellipsis and the recovery
  in a real browser.

  **工作区那边一个都没匹配上：既没有星号，被筛掉的项目也还在列表里** ——
  插件是照着一个项目行写成 `data-row-key="workspace:<id>"`、标签是
  `.projectText > .title` 的 DSH 构建写的，但**本机实际跑的**那个版本（v0.2.2-rc.3
  重写过的工作区浏览器）给出的是 `data-row-key="ws-<id>"` 和 `.bw-row-label`。
  选择器一个都匹配不上 —— 于是星号插不进去、项目行也藏不住，而会话行（key 前缀
  没变）却筛对了，表现为「别的项目还在列表里、但会话打不开」。现在改成**按 id
  匹配**（行 key 的尾部就是 id，前缀是什么都行），标签也改成按形状找（行里第一个
  「文字非空、自己没有子元素」的元素），不再拿整行文字比对 —— 宿主会异步补一个
  会话数徽标，整行文字会变。
  **被筛掉的项目，它的祖先要留着** —— 不符合条件的项目整行隐藏；符合条件的项目，
  它的父目录那一行也显示，这样合格的子项目在树里不会成为没有父行的孤儿。父节点
  只是容器：它自己的会话仍然不显示。
  **星号没有出现在项目名旁边** —— 第一版把星号插在项目行末尾，宿主那一列是
  `flex: 1`，星号被挤到整行最右、紧挨悬停才出现的动作区，看着像根本没画出来。
  现在星号插在项目名**后面**（名字列改成横向布局，名字自己占宽度、省略号照旧），
  名字列也改成按结构认，不靠宿主的 hash 类名。宿主用 React 渲染项目行，重建这行
  时会把它不认的星号一起删掉，所以监听器现在也看「被移除」，星号消失就补回来。
  `node test/star-layout.mjs` 在真实浏览器里检查位置、省略号与补回。

- **The three filter switches could not be toggled** — they were cloned from the
  host's own menu rows, and the stylesheet asked for `.dsh-spc-menuItem
  .dsh-spc-menuCheck` — a class that was never added to anything, so the rule
  never applied: the check mark could not be hidden and the three switches looked
  permanently on. The selector now names the class that actually exists. Two
  related fixes came with it: the host redraws the menu surface on every open, so
  the cloned rows are brand-new nodes and the check state has to be written again
  each time (it was skipped once the rows existed), and the cloned icon — the
  host's archive box, which means nothing for a switch — is dropped.
  `node test/filter-menu.mjs` checks the whole toggle in a real browser.

  **三个筛选开关点不动** —— 它们是克隆宿主的菜单行插进去的，而样式表写的是
  `.dsh-spc-menuItem .dsh-spc-menuCheck` —— `dsh-spc-menuItem` 从未被添加到任何
  元素上，规则因此从不生效：勾没法被隐藏，三个开关看起来永远是开着的。现在选择器
  改用真正存在的类名。同时修了两处相关问题：宿主每次打开菜单都重画这一片 DOM，
  克隆出来的行是**全新节点**，勾的状态每次都要重写一遍（原先只要行在就不管了）；
  克隆来的图标（宿主的归档箱子，对开关没有意义）也去掉了。
  `node test/filter-menu.mjs` 在真实浏览器里检查整个切换过程。

### Changed / 变更

- **The view-options switches and the star are DOM surgery** — DSH gives the project row no decoration seat and hardcodes the view-options menu items, so both are done incrementally on the rendered DOM: the star is inserted into the row, and the three switches are **cloned from the host's own menu rows** (so height, padding, icons and hover follow the host, including theme switches). Both are located structurally (`data-row-key`, `role="presentation"`, `data-menu-material`), never by hashed class name. If a DSH release changes either shape, the selectors stop matching and the star / switches simply do not appear — nothing else breaks, the same safe failure this plugin already uses for the panel list.

  **视图选项的开关与星号是对 DOM 的增量改动** —— DSH 没给项目行留装饰位、视图选项菜单项也是写死的，所以两处都在渲染后的 DOM 上做增量：星号插进行内，三个开关**克隆宿主自己的菜单行**（行高、内边距、图标、悬停态都跟着宿主，主题切换也一致）。两处都靠结构关系定位（`data-row-key`、`role="presentation"`、`data-menu-material`），不认哈希 class 名。DSH 改掉这两种结构时选择器失配，星号与开关只是不出现，别的都照旧 —— 与本插件对面板列表的失效策略一致。

## 0.3.3 (2026-11-13)

> 这一版同时带上了此前起草为 0.4.0、但从未发布也从未打 tag 的内容（插件操作记录）。
> This release also carries what was drafted as 0.4.0 — never published, never tagged.

### Added / 新增

- **Plugin activity log** — the sidebar footer gains an icon right of the 「收起 / 展开全局面板」 toggle; clicking it opens a window with two tabs: 「安装/删除」 (every record) and 「启用/禁用」 (the last month), written to `~/.dsh/plugins/dsh-toomuch-plugins/plugin-history.json`. Records are built by comparing the profile manifest with the state the log recorded last time, not by listening for change events: plugins are installed and removed from the settings panel, from the plugin market and from the `dsh` CLI, and only the first of those announces what it did. **First run lists nothing** — the plugins a profile already has were installed before this log existed, so the current state becomes the baseline and only what happens afterwards is a record; a profile that cannot be read is an unknown state, not an empty one, and writes nothing. **Upgrades are left out**: DSH upgrades by removing the package and installing it again, so a package that reappears with another version retracts the removal it started with. Each row shows the action as a 16px stroke icon rather than text, coloured by state — **install and enable are green** (the power symbol), **remove and disable are red** (the power symbol with a bar through it) — and the plugin name and the time are set larger than the body text. Both tabs are returned newest first. / **插件操作记录** —— 侧栏底部在「收起 / 展开全局面板」按钮右侧多一个图标，点开是一个带两个标签的窗口：「安装/删除」（全量）与「启用/禁用」（最近一个月），写入 `~/.dsh/plugins/dsh-toomuch-plugins/plugin-history.json`。记录靠**比对 profile 清单**得出，不靠监听变更事件：插件可能在设置页、插件市场或 `dsh` 命令行里被装/删，其中只有设置页那条路会广播自己的动作。**首次运行不罗列插件**：profile 里已经装着的插件是这份日志存在之前就装上的，当前状态直接成为之后比对的基线，只有之后的装/删/启停才是记录；读不到 profile 是「不知道」而不是「空」，什么都不写。**升级不计入**：DSH 的升级就是「先删后装同一个包」，所以换了版本又出现的包会把刚记下的那条删除撤掉。操作列不写文字，改为 16px 线条图标并按状态色着色：**安装、启用是绿色**（电源符号），**删除、禁用是红色**（电源符号加一道斜杠）；插件名 14px 半粗、时间 13px，都比正文大一号；两个标签页都按时间倒序返回。

### Fixed / 修复

- **Grid display broke on DSH v0.2.2-rc.2** — that release moved the global-panel list into the sidebar's scroll viewport, so it now scrolls together with the workspace region. The plugin looked the list up by walking up from its footer button to the first ancestor with a **direct child** `<nav>`; in the new shape the list is not on that path at all (the scroll viewport is a sibling of the footer), so the lookup returned nothing and grid display, collapsing, the collapsed limit and the custom display order all silently did nothing — the settings page still showed the options, but nothing moved. The list is now found structurally in both shapes (a `<nav>` whose rows are labelled buttons), and the sidebar root is looked up separately, because the injected third-party entries (今日值得读 / 全局搜索 / 容器) still hang off the root rather than off the list. The new release also wraps every panel row in a cell of its own, so the collapsed limit now hides whole cells — the grid no longer keeps an empty cell per hidden row. / **DSH v0.2.2-rc.2 下网格显示失效** —— 该版本把全局面板列表挪进了侧栏的滚动视口，于是它和工作区一起滚动。本插件原先从底部开关向上回溯，找第一个含**直接子** `<nav>` 的祖先；新结构里列表根本不在这条路径上（滚动视口与底部开关是兄弟子树），查找落空，网格显示、折叠、收起限额与显示顺序**全部静默失效**——设置项还在，勾了没反应。现在两种形状都用结构判定找列表（装着带标签按钮行的 `<nav>`），侧栏根节点另找一次（绕槽插入的今日值得读 / 全局搜索 / 容器仍挂在根节点上）。该版本还把每个面板行包进了自己的格子里，收起限额因此按格子隐藏，网格里不再多出空格子。
- **DSH v0.2.2-rc.2's hover-only pin button no longer covers the grid icons** — that release gave every panel row an extra 「从左侧栏取消固定」 button that shows up on hover. In grid mode it lands on top of the icon, and the grid already lets the user arrange the icons themselves, so the grid hides it. List mode keeps it: unpinning a panel is DSH's own feature and this plugin has no replacement for it. / **DSH v0.2.2-rc.2 的「取消固定」按钮不再压在网格图标上** —— 该版本给每个面板行加了一个悬停出现的「从左侧栏取消固定」按钮；网格模式下它正好落在图标上，而网格本身已经能让用户自己排列图标，所以网格里把它藏掉。列表模式保留：取消固定是 DSH 自己的功能，本插件没有替代品。

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

[Unreleased]: https://github.com/rivenshanghai/dsh-toomuch-plugins/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/rivenshanghai/dsh-toomuch-plugins/releases/tag/v0.4.0
[0.3.3]: https://github.com/rivenshanghai/dsh-toomuch-plugins/releases/tag/v0.3.3
[0.3.1]: https://github.com/rivenshanghai/dsh-toomuch-plugins/releases/tag/v0.3.1
[0.3.0]: https://github.com/rivenshanghai/dsh-toomuch-plugins/releases/tag/v0.3.0
[0.2.0]: https://github.com/rivenshanghai/dsh-toomuch-plugins/releases/tag/v0.2.0
[0.1.1]: https://github.com/rivenshanghai/dsh-toomuch-plugins/releases/tag/v0.1.1
[0.1.0]: https://github.com/rivenshanghai/dsh-toomuch-plugins/releases/tag/v0.1.0
