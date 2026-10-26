# 设计说明 / Design notes

这个文档记录 `toomuch-plugins` 做什么、怎么做、依赖哪些约定。改代码前先看这里。

## 1. 目标

DSH Web 左侧栏从上到下是：品牌行 → 新会话 → **全局面板入口** → 工作区 → 设置。

「全局面板入口」这一列会随着装的插件越来越多：插件、插件市场、定时任务、MCP Studio、
上下文、技能管理器、系统监控……每多一个插件，这一列就多一行，大约每行 40px。

本插件有两个目标：

1. **在需要时把这列收起来，把空间还给工作区**（0.1 起）。
2. **给这列一个可配置的显示方式**（0.2 起）：网格模式 —— 只显示图标、文字放进悬停提示；
   每行图标数量 2–4 可调；收起时可保留前 N 个入口（列表模式按个数，网格模式按行数）。
   配置页在 设置 → 内置插件 里。

## 2. 范围

做：

- 折叠侧栏根节点下的**全局面板入口列表**（一个 `<nav>`）。
- 在侧栏底部放一个开关，随时展开 / 收起。
- 记住选择，刷新后保持。
- **网格显示模式**：宽栏下把入口列表排成图标网格，隐藏文字、以原生 `title` 显示
  悬停提示；每行图标数 2–4 可设。
- **收起时保留部分入口**：列表模式保留前 0–5 个，网格模式保留前 0–3 行
  （行数 × 列数即图标数）；0 = 全部收起，即 0.1 的原始行为。
- **配置页**：通过 `settings.plugins.tab` 槽注册到 设置 → 内置插件。

不做（有意为之）：

- **不碰品牌行、新会话、设置**。在 Linux / Windows 上，品牌行里的「收起侧栏」按钮是
  唯一的收起入口，把它一起藏掉等于少一个功能。
- **不隐藏任何面板本身**，只是不显示入口；面板内容从别处照常能打开。
- **不改动 Host 侧行为**，不注入任何 DSH 内部模块，**不读写 DSH 配置**
  （不用 `ctx.configForms` 那套 Host 设置传输）；自己的偏好仍只写 localStorage。

## 3. 依赖的 DOM 约定

插件不 import DSH 的内部包，纯粹靠下面几条约定工作（都来自
`@deepseek-ai/dsh-client-ui-sidebar`）：

| 约定 | 用途 |
| --- | --- |
| 侧栏根节点下有一个**直接子元素** `<nav>`，class 为 `panelList` | 全局面板入口列表，本插件要折叠的就是它 |
| 插槽 `sidebar.footer.action` | 侧栏底部那一行（「设置」旁边） |
| 插槽项的 `wide` 属性 | 窄栏（rail）模式下按钮收成圆形图标 |
| CSS 变量 `--dsw-alias-*` | 主题色 / 圆角 / 间距，跟随 DSH 明暗主题 |
| `<nav>` 下的标准入口是 `button`，图标 `span` 是第一个子元素，**文字 `span` 只在宽栏渲染**；注入式入口可能是 `div`（如全局搜索是 `div role=search`，文字是 `input`） | 网格模式把匹配口径写成 `button` / `role=button` / `[data-spc-adopted]` 三者并集，文字隐藏用 `>*:not(:first-child)` 盖住 `span` 与 `input`；rail 本来就是纯图标列 |
| 宽栏下 DSH 自己的 Tooltip 被禁用（`disabled: wide`），且文字根本没渲染 | 网格模式把 `aria-label` 镜像成原生 `title` 当悬停提示 |
| 插槽 `settings.plugins.tab` | 设置 → 内置插件 区里注册一页（真实先例：`settings-plugin-inventory` 的「插件列表」） |

**为什么向上回溯而不是直接 `document.querySelector('nav.panelList')`：**
class 名可能被构建工具 hash 或改名，而「直接子元素 `<nav>`」是结构关系，更稳定。
实现里从开关自己的根节点开始，逐级向上找「第一个含直接子 `<nav>` 的祖先」，直到
`document.body` 为止 —— 侧栏根节点一定是其中之一。

## 4. 状态与持久化

两份状态，都用 `localStorage`，都是「读不出来就用安全默认值」：

| key | 内容 | 默认 / 读取规则 |
| --- | --- | --- |
| `dsh.sidebar-panel-collapse` | 折叠状态 | 只有明确存了 `'expanded'` 才算展开，其余按收起 |
| `dsh.sidebar-panel-collapse.display` | 显示偏好 `{grid, columns, collapsedCount, collapsedRows}` | JSON 对象；`grid` 必须是 `true` 才开；`columns` 取整且必须在 2–4，否则回 3；`collapsedCount` 取整且必须在 0–5，否则回 0；`collapsedRows` 取整且必须在 0–3，否则回 0；整条读取 / 解析失败回默认对象 |

- 折叠默认 **收起**（首次安装即刻生效，这是这个插件存在的意义）。
- 显示偏好默认**关闭网格、每行 3 个、收起时保留 0 个（全部收起）**，即不改变原生外观与 0.1 行为。
- 写入失败（隐私模式等）不报错，只是这次选择不持久。

## 5. 数据流

折叠：

```
用户点开关
   └─> setCollapsed(next)
          ├─> React 重新渲染（按钮文案 / 图标变化）
          └─> useEffect 重新执行 applyNav(wide, collapsed, prefs)
                 ├─> 限额 = 收起时 ?（网格 ? collapsedRows×columns : collapsedCount）: ∞
                 ├─> nav.style.display = 限额为 0 ? 'none' : ''
                 └─> 逐个入口：前「限额」个去掉 data-spc-hidden，其余打上（CSS 隐藏）
          └─> writeStored(collapsed)  // localStorage
```

显示偏好：

```
设置页勾选 / 选列数
   └─> writePrefs()  // localStorage + 通知 prefsListeners
          ├─> 设置页自己 setState 重渲染
          └─> 底部开关组件 setState 重渲染
                 └─> useEffect 重新执行 applyGrid()
                        ├─> nav 加/去 class dsh-spc-grid，
                        │   style 设 --dsh-spc-grid-cols（2–4）
                        └─> 每个入口（button 或收养的 div）：把 aria-label 镜像成 title
                            （关网格时再移除）
```

`useEffect` 在每次渲染后都重新套用 `display` / 网格样式，因为 DSH 侧栏重渲染时可能
重建这个 `<nav>`，只设一次会被覆盖。网格 CSS 全部用**结构关系选择器**
（`:is(button,[role=button],[data-spc-adopted])` 这类），不依赖侧栏的 hash class 名；形状变了选择器自然
失配，列表退回普通样式 —— 与折叠同样的安全失效。
隐藏计数（`applyNav`）、网格单元样式、title 镜像三处用**同一口径**：按钮、
`role=button`、带 `[data-spc-adopted]` 收养标记的入口。漏掉任何一类都会出现
「多出来的入口永远不被隐藏」的错位（全局搜索这种 `div role=search` 就靠收养标记入列）。

### 收养注入式入口

一部分插件（今日值得读、全局搜索、容器等）不走标准的 `sidebar.panellist` 槽，而是
自建元素直接插到侧栏根节点（logoRow 之后、`<nav>` 之前），并用 `data-dsh-*-entry`
属性做族内排序。网格开启时 `adoptEntries()` 把这些入口挪进 `<nav>` 参与网格，关闭时
`releaseEntries()` 按收养前记下的相邻元素还原位置。它们自己的重放置观察器只在入口
**脱离侧栏根节点**时才重新插入 —— `<nav>` 仍在根节点内，所以收养不会触发回弹。
属性名单写在 `ADOPT_ATTRS`，新插件沿用同一约定即可自动纳入。

## 6. 代码结构

| 文件 | 角色 |
| --- | --- |
| `src/index.js` | Host 半边。不需要任何 Host 能力，所以 `apply()` 是空的 |
| `src/client.js` | Client 半边。全部逻辑在这里：`FooterToggle`（折叠 + 网格套用）、`DisplaySettingsTab`（设置页）、localStorage 读写与偏好广播 |
| `test/smoke.js` | 零依赖冒烟检查：`node test/smoke.js`。桩掉 `window.__ModuleLoader__` / react，断言两个槽注册的元数据 + 设置页读写偏好的默认值规则。不进 npm 包 |
| `cordis.patch.yml` | 往 profile 里插入一行插件加载记录（包名 `dsh-toomuch-plugins`，即仓库根） |
| `locale/{en,zh}.json` | 插件列表里显示的标题和描述 |

`package.json` 的 `exports` 把 Host 半边指向 `.`（`src/index.js`），Client 半边指向
`./client`（`src/client.js`）；DSH 通过这两个入口分别加载。

## 7. 兼容性风险

- 本插件依赖 DSH 内部 DOM 结构。DSH 改版后如果侧栏结构变了，最坏情况是**找不到目标
  `<nav>`，什么都不做** —— 不会报错、不会弄坏界面，属于安全失效。
- 不 import DSH 内部包，因此 DSH 升级不会让插件直接加载失败。
- 样式全部走 `--dsw-alias-*` 变量，不写死颜色；主题改动时不会失配。

## 8. 验证清单

改完代码后至少过一遍：

1. 装上插件后，侧栏底部「设置」上方出现开关。
2. 默认状态是收起的；点一下展开，再点一下收起。
3. 刷新页面后状态保持。
4. 展开成宽栏（≥ 展开宽度）时开关是一行文字；窄栏（56px rail）时是圆钮。
5. 收起状态下，工作区区域明显变高。
6. 没有全局面板时，开关点了不报错。
7. 浏览器控制台无报错。
8. 设置 → 内置插件 里出现「侧栏面板显示」页。
9. 勾上「网格方式显示」后，宽栏侧栏的入口列表立刻变成图标网格；悬停图标显示该面板名。
10. 选 2 / 4 后每行图标数量立刻变化；刷新页面后网格与列数都保持。
11. 取消勾选后列表恢复原生的文字 + 图标样式，悬停原生 `title` 不残留。
12. rail（窄栏）模式下网格不影响外观（rail 本来就是图标列），开关仍可点。
13. 列表模式选「收起时显示插件数 3」后收起：只剩前 3 个入口可见，其余隐藏；展开恢复全部。
14. 网格模式选「收起时显示行数 1」、每行 3 个后收起：只剩第一行 3 个图标（**不能**多出「单个图标」的一行，全局搜索入口必须参与计数）；改列数后收起限额跟随（行 × 列）。
15. 收起限额设回 0 后收起：整个列表隐藏（与 0.1 行为一致）。
16. 收起限额刷新页面后保持。
17. `node test/smoke.js` 通过。

## 9. 后续可能的扩展（都没做）

- 支持「折叠时仍显示某一个常用面板」（0.2.0 起已有收起保留 N 个/行；单个面板级的挑选还没做）。
- 支持把多个插件的侧栏行一起折叠（那更适合 `dsh-sidebar-quiet` 这类插件去做）。
- 记住每个窗口的展开状态而不是全局一个状态。
- 网格模式的悬停提示改用 DSH 的 Tooltip 原语（带主题样式），而不是原生 `title`；
  需要先确认原语是否渲染 wrapper 元素、会不会破掉网格布局。
