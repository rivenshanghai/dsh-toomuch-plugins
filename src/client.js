/**
 * Client half of the dsh-toomuch-plugins bundle (sidebar panel collapse).
 *
 * The shipped sidebar stacks every global panel entry ("全局面板": plugins,
 * market, schedules, MCP studio, context, skill manager, system monitor, …)
 * between the new-session button and the workspace region. With a longer list
 * that stack is ~280px tall and squeezes the workspace region out of sight.
 *
 * This bundle adds one `sidebar.footer.action` toggle: click it and the panel
 * list is hidden, click again and it is back. The collapsed state is stored in
 * localStorage, so it survives reloads. It only touches the list element the
 * sidebar already renders — no panel, workspace or host behaviour changes.
 *
 * It also ships a display settings page (Settings → Built-in plugins, via the
 * `settings.plugins.tab` slot): turn on grid display so the panel list shows
 * icons only with the label as a hover tooltip, pick how many icons fit per
 * row (2–4), pick one of three icon sizes (small / medium / large), and set a
 * custom plugin display order (up to 20 entries, added one by one from a
 * dropdown; duplicates are dropped on save). Panel clicks
 * are additionally reported to the host half over a hand-rolled Typert
 * remote, which appends them to `click-counts.json` for a future auto-sort.
 * Preferences live in localStorage too — same safe-default rules as the
 * collapse state. Details: docs/design.md.
 *
 * Right of the toggle sits a clock icon: the plugin activity log. It opens a
 * window (in the `shell.overlay` slot, so it floats over the app) with two
 * tabs — installs and removals (all of them) and enable/disable toggles (the
 * last month) — filled from the host half's `spcHistory.list`.
 *
 * 0.4.0 adds the workspace side: the project row's context menu gains a
 * 「我的最爱」 entry (a switch), a starred project shows a yellow star after
 * its name, and the host's 「视图选项 → 筛选会话」 menu gains three switches —
 * only my favorites, only the last n days, only the latest m projects — that
 * hide the project rows (and their session rows) that do not pass. The stars
 * live in the host half's own file, the switches and the n / m numbers in
 * localStorage.
 *
 * Styling uses only `--dsw-alias-*` theme tokens and the stylesheet rides
 * inside the component, so unmounting removes it.
 */
window.__ModuleLoader__.load({
  // Must match the bundle's package name: the boot graph keys this module by it.
  id: 'dsh-toomuch-plugins',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Dictionary namespace owned by this plugin. */
    const NS = 'sidebarPanelCollapse'
    /** Where the collapsed choice is remembered across reloads. */
    const STORAGE_KEY = 'dsh.sidebar-panel-collapse'
    /** Where the display settings (grid / icons per row) are remembered. */
    const PREFS_KEY = 'dsh.sidebar-panel-collapse.display'
    /** Position among the sidebar's foot actions. */
    const ORDER = 5
    /** Marker class and custom property grid mode sets on the panel-list nav. */
    const GRID_CLASS = 'dsh-spc-grid'
    const GRID_COLS_VAR = '--dsh-spc-grid-cols'
    /** Icon-size marker classes (default keeps the sidebar's own size). */
    const SIZE_SM_CLASS = 'dsh-spc-size-sm'
    const SIZE_LG_CLASS = 'dsh-spc-size-lg'
    /** Event the footer icon fires; the activity window listens for it. */
    const OPEN_EVENT = 'dsh-toomuch-plugins:open-activity'

    /** Ask the activity window to open. */
    function openHistory() {
      if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
      window.dispatchEvent(new CustomEvent(OPEN_EVENT))
    }

    /** Local time as `YYYY-MM-DD HH:mm`; anything unparsable is shown as is. */
    function formatTime(value) {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : ''
      const pad = (n) => String(n).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    /**
     * The action glyph for one history row: a 16px stroke icon per action,
     * drawn on the row's state colour. Text badges were hard to read at this
     * size, so the action is an icon with an `aria-label` for screen readers.
     */
    function actionIcon(action) {
      const stroke = {
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        style: { display: 'block' },
      }
      const paths = {
        // A package going in: an arrow down onto a line.
        install: ['M8 2.5v5.4', 'M5.2 5.1L8 7.9l2.8-2.8', 'M3.2 13.5h9.6'],
        // A package coming out: the same arrow, the other way.
        remove: ['M8 13.5V8.1', 'M5.2 10.9L8 8.1l2.8 2.8', 'M3.2 2.5h9.6'],
        // A switch: the power symbol, then the same with a bar through it.
        enable: ['M12.2 4.4a6 6 0 1 1-8.4 0', 'M8 1.4v6.6'],
        disable: ['M12.2 4.4a6 6 0 1 1-8.4 0', 'M8 1.4v6.6', 'M3.2 12.8l9.6-9.6'],
      }
      const list = paths[action]
      if (list === undefined) return null
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': 'true', ...stroke },
        list.map((d, i) => h('path', { key: i, d })),
      )
    }

    const ZH = {
      collapse: '收起全局面板',
      expand: '展开全局面板',
      tab: '侧栏面板显示',
      grid: '网格方式显示（只显示图标，文字放悬停提示）',
      columns: '每行图标数量',
      collapsedCount: '收起时显示插件数',
      collapsedRows: '收起时显示行数',
      collapsedHint: '0 = 全部收起',
      iconSize: '图标尺寸',
      sizeSm: '小',
      sizeMid: '中',
      sizeLg: '大',
      sizeHint: '中为默认',
      orderTitle: '插件显示顺序',
      orderPick: '选择要添加的插件…',
      orderHint: '最多 20 项；重复项保存时自动去掉',
      orderEmpty: '尚未设置，按默认顺序显示',
      orderUp: '上移',
      orderDown: '下移',
      orderRemove: '移除',
      history: '插件操作记录',
      historyTitle: '插件操作记录',
      tabInstallRemove: '安装/删除',
      tabEnableDisable: '启用/禁用',
      historyEmpty: '暂无记录',
      historyUnavailable: '记录不可用',
      close: '关闭',
      actionInstall: '安装',
      actionRemove: '删除',
      actionEnable: '启用',
      actionDisable: '禁用',
      favorite: '我的最爱',
      filterFavorites: '仅显示我的最爱项目',
      filterRecent: '仅显示最近 {n} 天',
      filterLatest: '仅显示最新 {m} 个项目',
      recentDays: '「仅显示最近」的天数',
      latestCount: '「仅显示最新」的项目数',
      filterHint: '最近 / 最新按项目最后一个会话的活跃时间算',
    }
    const EN = {
      collapse: 'Collapse global panels',
      expand: 'Expand global panels',
      tab: 'Sidebar panel display',
      grid: 'Grid display (icons only, labels as hover tooltips)',
      columns: 'Icons per row',
      collapsedCount: 'Entries shown while collapsed',
      collapsedRows: 'Rows shown while collapsed',
      collapsedHint: '0 = fully collapsed',
      iconSize: 'Icon size',
      sizeSm: 'Small',
      sizeMid: 'Medium',
      sizeLg: 'Large',
      sizeHint: 'Medium is the default',
      orderTitle: 'Plugin display order',
      orderPick: 'Pick a plugin to add…',
      orderHint: 'Up to 20 entries; duplicates are dropped on save',
      orderEmpty: 'Not set — shown in default order',
      orderUp: 'Move up',
      orderDown: 'Move down',
      orderRemove: 'Remove',
      history: 'Plugin activity',
      historyTitle: 'Plugin activity',
      tabInstallRemove: 'Install / remove',
      tabEnableDisable: 'Enable / disable',
      historyEmpty: 'No records yet',
      historyUnavailable: 'Records unavailable',
      close: 'Close',
      actionInstall: 'Install',
      actionRemove: 'Remove',
      actionEnable: 'Enable',
      actionDisable: 'Disable',
      favorite: 'My favorites',
      filterFavorites: 'Only my favorite projects',
      filterRecent: 'Only the last {n} days',
      filterLatest: 'Only the latest {m} projects',
      recentDays: 'Days counted as "recent"',
      latestCount: 'Projects kept by "latest"',
      filterHint: 'Recent / latest follow each project\'s last session activity',
    }

    const CSS = `
/* The layer claims a full line of the shared footer row: the collapse toggle
   and the activity icon share that line, and every other footer action keeps
   its own. Shrinking to content here lets a neighbour slide in beside us. */
.dsh-spc-layer{flex:none;align-items:center;width:100%;height:42px;margin:8px 0 0;display:flex;position:relative;box-sizing:border-box;}
.dsh-spc-layer.dsh-spc-rail{flex:none;width:36px;height:auto;margin:0;flex-direction:column;gap:4px;}
.dsh-spc-row{box-sizing:border-box;flex:1 1 auto;min-width:0;height:42px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:none;border-radius:12px;align-items:center;gap:8px;margin:0 -2px;padding:0 10px 0 8px;font-family:inherit;font-size:14px;text-align:left;display:inline-flex;overflow:hidden;}
.dsh-spc-row:hover{background:var(--dsw-alias-interactive-bg-hover);}
.dsh-spc-row:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px;}
.dsh-spc-row.dsh-spc-btnRail{flex:none;width:36px;height:36px;border-radius:50%;justify-content:center;gap:0;margin:0;padding:0;}
.dsh-spc-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);}
.dsh-spc-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
/* The plugin activity entry: an icon right of the collapse toggle. */
.dsh-spc-histBtn{flex:none;cursor:pointer;width:32px;height:32px;color:var(--dsw-alias-label-secondary);background:0 0;border:none;border-radius:10px;align-items:center;justify-content:center;display:inline-flex;margin:0 2px;}
.dsh-spc-histBtn:hover{background:var(--dsw-alias-interactive-bg-hover);}
.dsh-spc-histBtn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px;}
.dsh-spc-layer.dsh-spc-rail .dsh-spc-histBtn{width:36px;height:36px;border-radius:50%;margin:0;}
nav.dsh-spc-grid{grid-template-columns:repeat(var(--dsh-spc-grid-cols,3),minmax(0,1fr));gap:4px;display:grid;}
nav.dsh-spc-grid :is(button,[role=button],[data-spc-adopted]){box-sizing:border-box;justify-content:center;gap:0;margin:0;padding:7px 4px;width:100%;}
nav.dsh-spc-grid :is(button,[role=button],[data-spc-adopted])>*:not(:first-child){display:none;}
nav.dsh-spc-grid>div{min-width:0;}
/* DSH v0.2.2-rc.2 起，面板行右边多了一个「取消固定」按钮（悬停出现）。网格模式
   下本插件自己就能重排图标，那个按钮压在图标上只是噪音——网格里藏掉；列表模式
   留着（那是 DSH 自己的功能，本插件没有替代品）。DSH 的 Tooltip 不加包装元素，
   所以它在格子里就排在行按钮之后：「格子里的最后一个按钮」就是它。 */
nav.dsh-spc-grid>div>button:last-child:not(:first-child){display:none;}
nav [data-spc-hidden]{display:none;}
/* Icon size: the row glyphs take width/height as SVG attributes (or inline
   style in third-party entries), so override with !important; the sprite
   symbols carry a viewBox, so the drawing scales with the viewport. */
nav.dsh-spc-size-sm :is(button,[role=button],[data-spc-adopted]) svg{width:12px !important;height:12px !important;}
nav.dsh-spc-size-lg :is(button,[role=button],[data-spc-adopted]) svg{width:24px !important;height:24px !important;}
/* 工作区收藏：项目名后面的黄星。宿主没有给项目行留装饰槽位，只能在行里插。
   星号所在的名字列由脚本改成 row 布局（dsh-spc-starCol），名字自己占宽度、
   长了省略号，星号紧跟其后。 */
.dsh-spc-star{align-items:center;color:var(--dsw-alias-state-warn-primary,#e8a33d);display:inline-flex;flex:none;}
.dsh-spc-starCol > .dsh-spc-title{flex:0 1 auto;min-width:0;}
/* 注入到宿主「视图选项」菜单里的三个筛选开关。勾挂在菜单行末尾；没勾上时
   整个元素隐藏（display:none 由 [data-off] 决定）。 */
.dsh-spc-menuCheck{align-items:center;display:inline-flex;flex:none;margin-left:auto;}
.dsh-spc-menuCheck[data-off]{display:none;}
/* 设置页里「侧栏显示」与「项目筛选」之间的分割线。 */
.dsh-spc-sep{border-top:.5px solid var(--dsw-alias-border-l3);margin:2px 0;}
/* 被「仅显示…」筛掉的项目行与会话行。 */
[data-spc-fhide]{display:none !important;}
`

    /** Stylesheet of the plugin activity window (opened from the footer icon). */
    const HIST_CSS = `
.dsh-spc-modalMask{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-mask-1);}
.dsh-spc-modal{box-sizing:border-box;width:min(520px,100%);max-height:min(70vh,560px);display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);box-shadow:var(--dsw-shadow-lv2);color:var(--dsw-alias-label-primary);font-size:13px;}
.dsh-spc-modalHead{align-items:center;gap:8px;display:flex;padding:12px 14px;border-bottom:.5px solid var(--dsw-alias-border-l3);}
.dsh-spc-modalTitle{flex:1;min-width:0;font-size:14px;font-weight:600;}
.dsh-spc-modalClose{cursor:pointer;width:26px;height:26px;color:var(--dsw-alias-label-secondary);background:0 0;border:none;border-radius:8px;font:inherit;line-height:1;display:inline-flex;align-items:center;justify-content:center;}
.dsh-spc-modalClose:hover{background:var(--dsw-alias-interactive-bg-hover);}
.dsh-spc-modalClose:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px;}
.dsh-spc-tabs{gap:4px;display:flex;padding:8px 10px 0;}
.dsh-spc-tab{cursor:pointer;padding:6px 10px;color:var(--dsw-alias-label-secondary);background:0 0;border:none;border-bottom:2px solid transparent;border-radius:8px 8px 0 0;font:inherit;}
.dsh-spc-tab:hover{background:var(--dsw-alias-interactive-bg-hover);}
.dsh-spc-tab:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px;}
.dsh-spc-tab.dsh-spc-tabOn{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-state-business-primary);}
.dsh-spc-modalBody{min-height:0;overflow-y:auto;padding:8px 10px 12px;}
.dsh-spc-histRow{align-items:center;gap:10px;display:flex;min-height:36px;padding:5px 8px;border-radius:8px;}
.dsh-spc-histRow:nth-child(odd){background:var(--dsw-alias-bg-layer-2);}
.dsh-spc-histBadge{flex:none;width:28px;height:28px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;}
.dsh-spc-histBadge.dsh-spc-ainstall{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 16%,transparent);}
.dsh-spc-histBadge.dsh-spc-aremove{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 16%,transparent);}
.dsh-spc-histBadge.dsh-spc-aenable{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 16%,transparent);}
.dsh-spc-histBadge.dsh-spc-adisable{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 16%,transparent);}
.dsh-spc-histName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600;}
.dsh-spc-histTime{flex:none;color:var(--dsw-alias-label-secondary);font-size:13px;}
.dsh-spc-histEmpty{color:var(--dsw-alias-label-secondary);padding:18px 6px;text-align:center;}
`

    /** Stylesheet of the settings page (Settings → Built-in plugins tab). */
    const SET_CSS = `
.dsh-spc-set{flex-direction:column;gap:12px;display:flex;color:var(--dsw-alias-label-primary);font-size:14px;}
.dsh-spc-setToggle{align-items:center;gap:10px;cursor:pointer;display:inline-flex;}
.dsh-spc-setToggle input{accent-color:var(--dsw-alias-state-business-primary);flex:none;width:16px;height:16px;margin:0;}
.dsh-spc-setRow{align-items:center;gap:10px;display:flex;min-height:28px;}
.dsh-spc-setCaption{color:var(--dsw-alias-label-secondary);}
.dsh-spc-cols{gap:6px;display:flex;}
.dsh-spc-col{cursor:pointer;min-width:32px;height:28px;color:var(--dsw-alias-label-primary);background:0 0;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);padding:0 8px;font:inherit;display:inline-flex;align-items:center;justify-content:center;}
.dsh-spc-col:hover{background:var(--dsw-alias-interactive-bg-hover);}
.dsh-spc-col.dsh-spc-colOn{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-state-business-primary);}
.dsh-spc-col:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}
.dsh-spc-col:disabled{cursor:default;opacity:.45;}
/* The plugin-order picker. A native <select> popup is drawn by the browser
   (or by the OS), so it cannot follow the app theme: in dark mode its rows
   stayed unreadable, and an unreadable popup still swallowed the click and
   left the settings page unable to scroll. This dropdown is drawn by the page
   itself, so the theme tokens always apply and nothing grabs the input.
   The list expands in flow (not absolutely positioned) so a scrolling
   settings panel can never crop it. */
.dsh-spc-drop{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;}
.dsh-spc-dropBtn{cursor:pointer;width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;height:28px;padding:0 8px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);font:inherit;text-align:left;}
.dsh-spc-dropBtn:hover{background:var(--dsw-alias-interactive-bg-hover);}
.dsh-spc-dropBtn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}
.dsh-spc-dropBtn:disabled{cursor:default;opacity:.45;}
.dsh-spc-dropText{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.dsh-spc-dropArrow{flex:none;color:var(--dsw-alias-label-secondary);font-size:10px;}
.dsh-spc-dropList{display:none;margin:0;padding:4px;list-style:none;max-height:240px;overflow-y:auto;background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);}
.dsh-spc-dropOpen .dsh-spc-dropList{display:block;}
.dsh-spc-dropItem{margin:0;}
.dsh-spc-dropItemBtn{cursor:pointer;display:block;width:100%;padding:6px 8px;border:0;border-radius:6px;background:0 0;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;}
.dsh-spc-dropItemBtn:hover,.dsh-spc-dropItemBtn:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none;}
/* The open list makes the row taller, so the caption stays on the button's
   top line instead of floating in the middle of the list. */
.dsh-spc-setRowDrop{align-items:flex-start;}
.dsh-spc-setRowDrop .dsh-spc-setCaption{line-height:28px;}
/* 「仅显示最近」天数 / 「仅显示最新」项目数的输入框。 */
.dsh-spc-num{width:64px;height:28px;padding:0 6px;box-sizing:border-box;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);font:inherit;}
.dsh-spc-num:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}
`

    /**
     * Display settings: grid on/off plus icons per row (2–4). While the
     * panels are collapsed, the list keeps showing the first `collapsedCount`
     * entries (list mode) or the first `collapsedRows` rows (grid mode);
     * 0 collapses everything, the historical behaviour. `iconSize` scales
     * the row glyphs: sm/lg mark the nav, md leaves the sidebar's own size.
     *
     * The workspace filters (0.4.0) live in the same blob: three switches
     * plus the two numbers they read (`recentDays`, `latestCount`).
     */
    const DEFAULT_PREFS = {
      grid: false, columns: 3, collapsedCount: 0, collapsedRows: 0, order: [], iconSize: 'md',
      favoritesOnly: false, recentOnly: false, latestOnly: false, recentDays: 7, latestCount: 3,
    }
    const COLLAPSED_COUNT_MAX = 5
    const COLLAPSED_ROWS_MAX = 3
    /** Custom display order: at most 20 panel ids, duplicates dropped on save. */
    const ORDER_MAX = 20
    /** 「仅显示最近」的天数上限。 */
    const RECENT_DAYS_MAX = 99
    /** 「仅显示最新」的项目数上限。 */
    const LATEST_COUNT_MAX = 9

    /** Coerce anything to a clean order list: strings only, deduped, ≤ 20. */
    function sanitizeOrder(value) {
      if (!Array.isArray(value)) return []
      const seen = new Set()
      const out = []
      for (const id of value) {
        if (typeof id !== 'string' || id === '' || seen.has(id)) continue
        seen.add(id)
        out.push(id)
        if (out.length >= ORDER_MAX) break
      }
      return out
    }

    /**
     * 清洗工作区筛选偏好：脏值与越界值一律回默认值。最近天数 1–99（默认 7），
     * 最新项目数 1–9（默认 3），三个开关必须是严格的 `true` 才算打开。
     * @param {unknown} raw 读回来的偏好片段。
     * @returns {{favoritesOnly: boolean, recentOnly: boolean, latestOnly: boolean, recentDays: number, latestCount: number}} 干净的偏好。
     */
    function sanitizeFilterPrefs(raw) {
      const source = raw !== null && typeof raw === 'object' ? raw : {}
      const days = Math.trunc(Number(source.recentDays))
      const count = Math.trunc(Number(source.latestCount))
      return {
        favoritesOnly: source.favoritesOnly === true,
        recentOnly: source.recentOnly === true,
        latestOnly: source.latestOnly === true,
        recentDays: days >= 1 && days <= RECENT_DAYS_MAX ? days : DEFAULT_PREFS.recentDays,
        latestCount: count >= 1 && count <= LATEST_COUNT_MAX ? count : DEFAULT_PREFS.latestCount,
      }
    }

    /** 一天有多少毫秒。 */
    const DAY_MS = 24 * 60 * 60 * 1000

    /**
     * 收藏的项目路径。Host 半边是唯一权威，这里只是它的只读镜像 ——
     * 右键菜单、星号与筛选都读这一份，改的时候先问 Host。
     */
    let favoritePaths = []
    const favoriteListeners = new Set()

    /** 读当前收藏路径（只读）。 */
    function getFavorites() {
      return favoritePaths
    }

    /** 收藏变了：重画星号与筛选，菜单也重新解析。 */
    function setFavorites(paths) {
      favoritePaths = Array.isArray(paths) ? paths.filter((p) => typeof p === 'string' && p !== '') : []
      for (const listener of favoriteListeners) listener()
    }

    /** 收藏的响应式来源，供右键菜单 `observe` 使用。 */
    const favoritesSource = {
      getSnapshot: () => favoritePaths,
      subscribe: (listener) => {
        favoriteListeners.add(listener)
        return () => favoriteListeners.delete(listener)
      },
    }

    /**
     * 每个工作区的最后活跃时间（毫秒；没有会话记 0）。
     * 「最近 / 最新」看的是**项目下最后一个会话的活跃时间**，不是工作区注册时间 ——
     * 注册时间跟用户还在不在用这个项目没有关系。
     * @param {readonly {workspaceId: string, sessionIds?: readonly string[]}[]} items 工作区列表。
     * @param {Readonly<Record<string, {updatedAt?: number}>>} sessions 会话摘要表。
     * @returns {Map<string, number>} 工作区 id -> 最后活跃时间。
     */
    function lastActivityByWorkspace(items, sessions) {
      const out = new Map()
      for (const item of items) {
        let latest = 0
        for (const id of item.sessionIds ?? []) {
          const at = sessions?.[id]?.updatedAt
          if (typeof at === 'number' && at > latest) latest = at
        }
        out.set(item.workspaceId, latest)
      }
      return out
    }

    /**
     * 工作区在**工作区树**里的最近祖先（父是路径前缀目录）。
     * @param {{workspaceId: string, path: string}} item 当前工作区。
     * @param {readonly {workspaceId: string, path: string}[]} items 全部工作区。
     * @returns {{workspaceId: string, path: string}|undefined} 最近的祖先工作区。
     */
    function ancestorWorkspace(item, items) {
      let best
      for (const other of items) {
        if (other.workspaceId === item.workspaceId) continue
        if (typeof other.path !== 'string' || typeof item.path !== 'string') continue
        if (!item.path.startsWith(other.path)) continue
        // 必须是目录边界：父路径后面跟的是分隔符，而不是同名的另一段。
        const rest = item.path.slice(other.path.length)
        if (!rest.startsWith('/') && !rest.startsWith('\\')) continue
        if (best === undefined || other.path.length > best.path.length) best = other
      }
      return best
    }

    /**
     * 当前筛选下**可见**的工作区 id。三个开关按「与」组合：同时打开时只剩
     * 同时满足全部条件的项目。父项目被筛掉时子项目一起隐藏 —— 工作区树要保持
     * 完整，不能留下没有父行的孤儿行。
     * @param {readonly {workspaceId: string, path: string, sessionIds?: readonly string[]}[]} items 工作区列表。
     * @param {Readonly<Record<string, {updatedAt?: number}>>} sessions 会话摘要表。
     * @param {Iterable<string>} favorites 收藏的项目路径。
     * @param {object} prefs 筛选偏好（会被清洗）。
     * @param {number} now 当前时间（毫秒）。
     * @returns {Set<string>} 可见的工作区 id。
     */
    function visibleWorkspaceIds(items, sessions, favorites, prefs, now) {
      const filter = sanitizeFilterPrefs(prefs)
      const lastAt = lastActivityByWorkspace(items, sessions)
      // 「仅显示最新 m 个」：按最后会话时间取前 m 个，时间并列时按路径稳定排序。
      const ranked = [...items].sort((a, b) => {
        const diff = (lastAt.get(b.workspaceId) ?? 0) - (lastAt.get(a.workspaceId) ?? 0)
        if (diff !== 0) return diff
        return String(a.path ?? '').localeCompare(String(b.path ?? ''))
      })
      const latest = new Set(ranked.slice(0, filter.latestCount).map((item) => item.workspaceId))
      const cutoff = now - filter.recentDays * DAY_MS
      const favoriteSet = favorites instanceof Set ? favorites : new Set(favorites ?? [])
      const visible = new Set()
      for (const item of items) {
        const last = lastAt.get(item.workspaceId) ?? 0
        if (filter.favoritesOnly && !favoriteSet.has(item.path)) continue
        if (filter.recentOnly && (last === 0 || last < cutoff)) continue
        if (filter.latestOnly && !latest.has(item.workspaceId)) continue
        visible.add(item.workspaceId)
      }
      // 祖先被筛掉 → 自己跟着隐藏。
      for (const item of items) {
        if (!visible.has(item.workspaceId)) continue
        for (let parent = ancestorWorkspace(item, items); parent !== undefined; parent = ancestorWorkspace(parent, items)) {
          if (visible.has(parent.workspaceId)) continue
          visible.delete(item.workspaceId)
          break
        }
      }
      return visible
    }

    /**
     * 名字列的判定规则（纯逻辑，冒烟检查直接断言）。
     *
     * 宿主项目行的直接子元素依次是：两个 `span.slot`（图标）、名字列
     * （`span.projectText`，自己不含文字、里面有一个装名字的 span）、动作区
     * （`span.rowActions`，含按钮）。
     *
     * 判据是「自身没有直接文本节点」：名字列的文字全在它里面的 span 里，
     * `textContent` 会连孙子的文字一起算上，所以要看**直接**文本节点。动作区
     * 是 span 但没有 span 后代（装的是 button），图标槽也是（装的是 svg）。
     * @param {readonly {tag: string, hasSpanChild: boolean, ownText: string}[]} candidates 行的直接子元素。
     * @returns {object|null} 名字列那个候选，没有则 null。
     */
    function pickTextColumn(candidates) {
      for (const candidate of candidates) {
        if (candidate.tag !== 'SPAN') continue
        if (!candidate.hasSpanChild) continue
        if (candidate.ownText !== '') continue
        return candidate
      }
      return null
    }

    /**
     * 一个元素**直接**拥有的文字（不含后代的文字）。
     * @param {Element} element 待读的元素。
     * @returns {string} 直接文本节点的文字，trim 后。
     */
    function directTextOf(element) {
      let out = ''
      for (const node of element.childNodes) {
        if (node.nodeType === 3) out += node.textContent ?? ''
      }
      return out.trim()
    }

    /** Cross-component sync: the settings page writes, the toggle re-applies. */
    const prefsListeners = new Set()

    function subscribePrefs(listener) {
      prefsListeners.add(listener)
      return () => prefsListeners.delete(listener)
    }

    /** Collapsed unless the user explicitly left the list open. */
    function readStored() {
      try {
        return window.localStorage.getItem(STORAGE_KEY) !== 'expanded'
      } catch {
        return true
      }
    }

    function writeStored(collapsed) {
      try {
        window.localStorage.setItem(STORAGE_KEY, collapsed ? 'collapsed' : 'expanded')
      } catch {
        // Storage unavailable (private mode): the choice just does not persist.
      }
    }

    /** Missing, corrupt or out-of-range values fall back to the safe defaults. */
    function readPrefs() {
      try {
        const raw = window.localStorage.getItem(PREFS_KEY)
        if (raw === null) return DEFAULT_PREFS
        const parsed = JSON.parse(raw)
        const columns = Math.trunc(Number(parsed.columns))
        const collapsedCount = Math.trunc(Number(parsed.collapsedCount))
        const collapsedRows = Math.trunc(Number(parsed.collapsedRows))
        return {
          grid: parsed.grid === true,
          columns: columns >= 2 && columns <= 4 ? columns : DEFAULT_PREFS.columns,
          collapsedCount:
            collapsedCount >= 0 && collapsedCount <= COLLAPSED_COUNT_MAX
              ? collapsedCount
              : DEFAULT_PREFS.collapsedCount,
          collapsedRows:
            collapsedRows >= 0 && collapsedRows <= COLLAPSED_ROWS_MAX
              ? collapsedRows
              : DEFAULT_PREFS.collapsedRows,
          order: sanitizeOrder(parsed.order),
          iconSize: parsed.iconSize === 'sm' || parsed.iconSize === 'lg' ? parsed.iconSize : 'md',
          ...sanitizeFilterPrefs(parsed),
        }
      } catch {
        return DEFAULT_PREFS
      }
    }

    function writePrefs(prefs) {
      try {
        // Duplicates are dropped here: every save writes a clean list.
        window.localStorage.setItem(PREFS_KEY, JSON.stringify({ ...prefs, order: sanitizeOrder(prefs.order) }))
      } catch {
        // Storage unavailable (private mode): the choice just does not persist.
      }
      for (const listener of prefsListeners) listener()
    }

    /**
     * 全局面板入口列表的判定：那个 `<nav>` 里装着面板行 —— 每个面板行都是带
     * aria-label 的按钮（DSH 的 PanelRow 恒有 aria-label）。侧栏里另一个
     * `<nav>`（设置页的分类导航）按钮上没有 aria-label，不会被误认。
     * @param {Element|null} nav 待判定的 `<nav>`。
     * @returns {boolean} 是否是全局面板入口列表。
     */
    function isPanelNav(nav) {
      if (nav === null || nav === undefined || typeof nav.querySelector !== 'function') return false
      return nav.querySelector('button[aria-label],[role=button][aria-label]') !== null
    }

    /**
     * 某个子树里第一个全局面板入口列表 `<nav>`（按文档顺序）。
     * @param {Element|null} scope 子树根。
     * @returns {Element|null} 面板列表 `<nav>`，没有则 null。
     */
    function panelNavIn(scope) {
      if (scope === null || scope === undefined || typeof scope.querySelectorAll !== 'function') return null
      for (const nav of scope.querySelectorAll('nav')) {
        if (isPanelNav(nav)) return nav
      }
      return null
    }

    /**
     * 找到「全局面板入口列表」那个 `<nav>`。
     *
     * DSH v0.2.2-rc.2 把 `<nav>` 从侧栏根节点的直接子元素挪进了滚动视口
     * （root > scrollRegion > scrollArea > nav），旧版是 root > nav。旧写法
     * 「向上找第一个含直接子 `<nav>` 的祖先」在新结构里够不着 —— 滚动视口不
     * 是开关的祖先 —— 网格与折叠就整体失效（安全失效：什么都不做）。
     *
     * 两版都认：祖先链上先看「直接子 `<nav>`」（旧结构，最强的结构信号），
     * 同一层再看「子树里装着面板行 `<nav>`」的第一个祖先（新结构）。
     * @param {Element} from 起点（开关自己的根节点）。
     * @returns {Element|null} 面板列表 `<nav>`，找不到则 null。
     */
    function findPanelNav(from) {
      for (let el = from; el !== null && el !== document.body; el = el.parentElement) {
        const direct = typeof el.querySelector === 'function' ? el.querySelector(':scope > nav') : null
        if (direct !== null && direct !== undefined && isPanelNav(direct)) return direct
        const nested = panelNavIn(el)
        if (nested !== null) return nested
      }
      return null
    }

    /**
     * 侧栏根节点：开关往上第一个「子树里装着面板列表 `<nav>`」的祖先。
     * 旧版它就是 `<nav>` 的父节点；v0.2.2-rc.2 起 `<nav>` 进了滚动视口，根
     * 节点要另找 —— 绕槽插入的 data-dsh-*-entry 条目仍挂在根节点上，收养要
     * 往那里放回。
     * @param {Element} from 起点（开关自己的根节点）。
     * @returns {Element|null} 侧栏根节点，找不到则 null。
     */
    function findSidebarRoot(from) {
      for (let el = from; el !== null && el !== document.body; el = el.parentElement) {
        if (panelNavIn(el) !== null) return el
      }
      return null
    }

    /**
     * Live list of the selectable panels ({id, label}): every slot panel plus
     * the DOM-inserted entries that follow the `data-dsh-*-entry` convention
     * (今日值得读 / 全局搜索 / 容器 … bypass `sidebar.panellist` entirely, so
     * enumerating the slot alone hides them from the dropdown). Rebuilt on
     * every call so panels registered late (dsh-context gates its sidebar
     * entry behind a setting) and entries mounting later still show up.
     */
    let sidebarRoot = null
    let panelNav = null
    let listEntries = () => []
    function refreshListEntries(ctx) {
      listEntries = () => {
        let out = []
        try {
          out = ctx.slots.entriesOfSlot('sidebar.panellist').map((entry) => {
            const id = entry.options && entry.options.id
            if (typeof id !== 'string' || id === '') return null
            const raw = entry.options.label
            const label = typeof raw === 'function' ? raw() : raw
            return { id, label: typeof label === 'string' && label !== '' ? label : id }
          }).filter((entry) => entry !== null)
        } catch {
          out = []
        }
        const seen = new Set(out.map((entry) => entry.id))
        for (const dom of domEntries()) {
          if (!seen.has(dom.id)) {
            seen.add(dom.id)
            out.push(dom)
          }
        }
        return out
      }
    }

    /**
     * Entry id parsed from a `data-dsh-*-entry` attribute. CSS has no
     * attribute-name wildcard, so the names are walked in JS — same rule as
     * the sidebar convention, and it covers future convention followers
     * without a hardcoded list.
     */
    function domEntryId(el) {
      if (el === null || el === undefined || typeof el.attributes !== 'object' || el.attributes === null) return null
      for (const attr of el.attributes) {
        const name = attr !== null && typeof attr === 'object' && typeof attr.name === 'string' ? attr.name : ''
        if (!name.startsWith('data-dsh-') || !name.endsWith('-entry')) continue
        const id = name.slice('data-dsh-'.length).replace(/-entry$/, '')
        if (id !== '') return id
      }
      return null
    }

    /** Convention-follower entries: sidebar-root children plus any adopted into the nav. */
    function domEntries() {
      const out = []
      const seen = new Set()
      const collect = (children) => {
        if (!children) return
        for (const child of children) {
          const id = domEntryId(child)
          if (id === null || seen.has(id)) continue
          seen.add(id)
          const label =
            (typeof child.getAttribute === 'function' && (child.getAttribute('aria-label') || child.getAttribute('title'))) || id
          out.push({ id, label })
        }
      }
      collect(sidebarRoot === null ? null : sidebarRoot.children)
      collect(panelNav === null ? null : panelNav.children)
      return out
    }

    /** Row → panel id: data-dsh-*-entry ancestors first, then aria-label. */
    function entryIdOfRow(target) {
      if (target === null || typeof target !== 'object') return null
      // Clicks land inside the entry (icon, input …), so walk up first.
      // Scoped to the sidebar's own entries so an unrelated page region that
      // happens to carry a data-dsh-*-entry attr never counts as a panel.
      let el = target
      while (el !== null && typeof el === 'object') {
        const id = domEntryId(el)
        if (id !== null) {
          return listEntries().some((item) => item.id === id) ? id : null
        }
        el = el.parentElement
      }
      if (typeof target.closest !== 'function') return null
      const row = target.closest('button,[role=button]')
      if (row === null || row.closest('nav') === null) return null
      const label = row.getAttribute('aria-label')
      if (label === null) return null
      const entry = listEntries().find((item) => item.label === label)
      return entry === undefined ? null : entry.id
    }

    /**
     * Custom display order without touching React: the panel list is a flex
     * (or grid) container, so each direct child just gets a CSS `order` value.
     * Listed panels take their position, everything else sorts after them in
     * natural DOM order. An empty list clears the overrides entirely.
     */
    function applyOrder(nav, prefs) {
      const order = sanitizeOrder(prefs.order)
      if (order.length === 0) {
        for (const child of nav.children) child.style.removeProperty('order')
        return
      }
      const entries = listEntries()
      for (const child of nav.children) {
        // Adopted entries carry their own data attr (strongest identity);
        // plain panel rows resolve through their aria-label.
        let id = domEntryId(child)
        if (id === null) {
          const row = child.matches('button,[role=button]')
            ? child
            : typeof child.querySelector === 'function'
              ? child.querySelector('button,[role=button]')
              : null
          const label = row === null ? null : row.getAttribute('aria-label')
          const entry = label === null ? null : entries.find((item) => item.label === label)
          id = entry === null || entry === undefined ? null : entry.id
        }
        const index = id === null ? -1 : order.indexOf(id)
        child.style.setProperty('order', String(index === -1 ? order.length + 1 : index + 1))
      }
    }

    /**
     * 单元格里那一行入口的元素：格子本身就是入口（旧版，nav 的直接子元素
     * 就是按钮），否则是格子里第一个按钮 / role=button（v0.2.2-rc.2 起 DSH
     * 把每个面板行包进了单元格里）。
     * @param {Element} cell `<nav>` 的一个直接子元素。
     * @returns {Element|null} 这一行入口的元素，找不到则 null。
     */
    function rowOf(cell) {
      if (cell === null || cell === undefined) return null
      if (typeof cell.matches === 'function' && cell.matches('button,[role=button],[data-spc-adopted]')) return cell
      if (typeof cell.querySelector === 'function') return cell.querySelector('button,[role=button],[data-spc-adopted]')
      return null
    }

    /** 单元格上的 CSS order 数值（没设置时按 0）。 */
    function orderOf(cell) {
      if (cell === null || cell === undefined || typeof cell.style !== 'object' || cell.style === null) return 0
      const value = Number(cell.style.order)
      return Number.isFinite(value) ? value : 0
    }

    function applyNav(rootEl, wide, collapsed, prefs) {
      if (rootEl === null) return
      const nav = findPanelNav(rootEl)
      if (nav === null) return
      // Remember the sidebar root so DOM-entry discovery (dropdown, ordering)
      // has a scope even before the settings page renders. Since v0.2.2-rc.2
      // the nav sits inside the scroll viewport, so its parent is no longer the
      // root — the root is looked up separately.
      sidebarRoot = findSidebarRoot(rootEl) ?? nav.parentElement ?? null
      panelNav = nav
      // Icon size: only sm/lg need a marker; md means "leave the sidebar's
      // own icon size alone". Re-applied on every render like the rest.
      nav.classList.toggle(SIZE_SM_CLASS, prefs.iconSize === 'sm')
      nav.classList.toggle(SIZE_LG_CLASS, prefs.iconSize === 'lg')
      applyOrder(nav, prefs)
      // How many entries the collapsed list keeps: rows × columns in grid
      // mode, plain entries otherwise; 0 hides the whole list (the original
      // behaviour). Expanding always shows everything again.
      const limit = !collapsed
        ? Infinity
        : wide && prefs.grid
          ? prefs.collapsedRows * prefs.columns
          : prefs.collapsedCount
      nav.style.display = limit === 0 ? 'none' : ''
      // One entry per direct child of the nav: in the old sidebar that child
      // is the row button itself, since v0.2.2-rc.2 DSH wraps every panel row
      // in a cell — and the cell is what has to disappear, otherwise the grid
      // keeps an empty cell per hidden row.
      const cells = Array.from(nav.children)
      // Hide by visual order (custom display order first), not DOM order.
      const ranked = cells
        .map((cell, domIndex) => ({ cell, domIndex, rank: orderOf(cell) }))
        .sort((a, b) => a.rank - b.rank || a.domIndex - b.domIndex)
      for (const [index, { cell }] of ranked.entries()) {
        if (index < limit) cell.removeAttribute('data-spc-hidden')
        else cell.setAttribute('data-spc-hidden', '')
      }
    }

    /**
     * A few third-party bundles (今日值得读 / 全局搜索 / 容器 and friends)
     * skip the `sidebar.panellist` slot and insert their own entry element
     * directly beside the nav, following one shared convention: an attribute
     * named `data-dsh-*-entry`. Grid mode adopts those entries into the nav
     * so they join the grid. List mode with a custom display order adopts
     * only the entries the user actually listed — outside the nav they live
     * in a different box and CSS `order` cannot reach them, so adoption is
     * what makes their order real. Adoption is undone when neither applies.
     * Their re-place observers only re-insert an entry once it leaves the
     * sidebar root entirely — the nav is still inside the root, so adoption
     * never fights them.
     */
    const ADOPTED_FLAG = 'data-spc-adopted'
    /** Where each adopted entry sat before the grid claimed it. */
    const adoptedBefore = new WeakMap()

    function findAdoptable(rootEl) {
      const out = []
      if (!rootEl || !rootEl.children) return out
      for (const child of rootEl.children) if (domEntryId(child) !== null) out.push(child)
      return out
    }

    function adoptEntries(rootEl, nav, only) {
      const entries = findAdoptable(rootEl)
      // Walk backwards so inserting each at the nav head keeps source order.
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i]
        if (only !== undefined && only !== null && !only.includes(domEntryId(entry))) continue
        if (entry.parentElement === nav) continue
        adoptedBefore.set(entry, entry.nextElementSibling)
        entry.setAttribute(ADOPTED_FLAG, '')
        nav.insertBefore(entry, nav.firstChild)
      }
    }

    function releaseEntry(rootEl, nav, entry) {
      const before = adoptedBefore.get(entry)
      entry.removeAttribute(ADOPTED_FLAG)
      adoptedBefore.delete(entry)
      // Put the entry back where it sat: before the sibling recorded at
      // adoption time when that sibling is still in the root, otherwise in
      // front of the nav (the old sidebar had the nav as a root child). Since
      // v0.2.2-rc.2 the nav lives in the scroll viewport and is no longer a
      // root child, so the entry falls back to the end of the root.
      const ref = before != null && before.parentElement === rootEl
        ? before
        : nav.parentElement === rootEl
          ? nav
          : null
      rootEl.insertBefore(entry, ref)
    }

    function releaseEntries(rootEl, nav) {
      for (const entry of Array.from(nav.querySelectorAll(`[${ADOPTED_FLAG}]`))) {
        releaseEntry(rootEl, nav, entry)
      }
    }

    /**
     * Grid display for the panel list: `display: grid` with N columns on the
     * nav, the text label hidden, and the label mirrored into the native
     * `title` so hovering still names the row (the sidebar's own tooltip is
     * disabled in wide mode, and the label only exists in wide mode anyway).
     * The rail already shows an icon-only column, so the grid only applies to
     * the wide sidebar. Selectors match structural relationships (button and
     * span inside the nav), never the sidebar's hashed class names — if the
     * shape changes, the rules simply stop matching and the list stays normal.
     */
    function applyGrid(rootEl, wide, prefs) {
      if (rootEl === null) return
      const nav = findPanelNav(rootEl)
      if (nav === null) return
      // `rootEl` here is the footer toggle itself; the injected entries are
      // direct children of the sidebar root. Since v0.2.2-rc.2 the nav sits
      // inside the scroll viewport, so the root is not the nav's parent any
      // more — look it up.
      const sideRoot = findSidebarRoot(rootEl) ?? nav.parentElement
      const order = sanitizeOrder(prefs.order)
      const gridOn = wide && prefs.grid
      if (gridOn) {
        // The grid owns the whole nav: adopt every convention follower.
        adoptEntries(sideRoot, nav)
      } else if (order.length > 0) {
        // List mode: only the entries the user listed join the nav (unlisted
        // ones keep their default spot outside it), so CSS order can reach
        // them without dragging unrelated entries out of position.
        for (const entry of Array.from(nav.querySelectorAll(`[${ADOPTED_FLAG}]`))) {
          if (!order.includes(domEntryId(entry))) releaseEntry(sideRoot, nav, entry)
        }
        adoptEntries(sideRoot, nav, order)
      } else {
        releaseEntries(sideRoot, nav)
      }
      if (!gridOn) {
        if (!nav.classList.contains(GRID_CLASS)) return
        nav.classList.remove(GRID_CLASS)
        nav.style.removeProperty(GRID_COLS_VAR)
        for (const el of nav.querySelectorAll('[data-spc-tip]')) {
          el.removeAttribute('title')
          el.removeAttribute('data-spc-tip')
        }
        return
      }
      nav.classList.add(GRID_CLASS)
      nav.style.setProperty(GRID_COLS_VAR, String(prefs.columns))
      // Rows carry their label as aria-label (the sidebar always sets one).
      // An entry that already ships its own title keeps it untouched, so the
      // cleanup pass below only removes titles this plugin itself added.
      // Since v0.2.2-rc.2 the row button sits inside a cell of the nav, so
      // the title goes onto the row inside the cell, not onto the cell.
      for (const cell of nav.children) {
        const row = rowOf(cell)
        if (row === null) continue
        if (row.hasAttribute('data-spc-tip') || row.hasAttribute('title')) continue
        const label = row.getAttribute('aria-label')
        if (label === null) continue
        row.setAttribute('title', label)
        row.setAttribute('data-spc-tip', '')
      }
    }

    function FooterToggle(props) {
      const t = typeof props.t === 'function' ? props.t : () => ''
      const wide = props.wide !== false
      const [collapsed, setCollapsed] = React.useState(readStored)
      const [prefs, setPrefs] = React.useState(readPrefs)
      const rootRef = React.useRef(null)

      // Preferences written on the settings page re-render this toggle.
      React.useEffect(() => subscribePrefs(() => setPrefs(readPrefs())), [])

      // Runs after every render: cheap, and it re-applies the choice if the
      // sidebar has meanwhile re-created the list element. Grid first so the
      // collapsed-limit counts rows in their final (adopted) order.
      React.useEffect(() => {
        applyGrid(rootRef.current, wide, prefs)
        applyNav(rootRef.current, wide, collapsed, prefs)
      })

      const label = t(collapsed ? 'expand' : 'collapse')
      const toggle = () => {
        const next = !collapsed
        writeStored(next)
        setCollapsed(next)
        applyNav(rootRef.current, wide, next, prefs)
      }

      return h(
        'div',
        { className: 'dsh-spc-layer' + (wide ? '' : ' dsh-spc-rail'), ref: rootRef },
        h('style', null, CSS),
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-spc-row' + (wide ? '' : ' dsh-spc-btnRail'),
            title: label,
            'aria-label': label,
            'aria-expanded': !collapsed,
            onClick: toggle,
          },
          h(
            'span',
            { className: 'dsh-spc-icon', 'aria-hidden': 'true' },
            h(
              'svg',
              {
                viewBox: '0 0 16 16',
                width: 16,
                height: 16,
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: 1.6,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
                style: { display: 'block' },
              },
              h('path', { d: collapsed ? 'M4 10L8 6L12 10' : 'M4 6L8 10L12 6' }),
            ),
          ),
          wide ? h('span', { className: 'dsh-spc-label' }, label) : null,
        ),
        // The plugin activity entry: an icon right of the collapse toggle.
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-spc-histBtn',
            title: t('history'),
            'aria-label': t('history'),
            onClick: openHistory,
          },
          h(
            'span',
            { className: 'dsh-spc-icon', 'aria-hidden': 'true' },
            h(
              'svg',
              {
                viewBox: '0 0 16 16',
                width: 16,
                height: 16,
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: 1.5,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
                style: { display: 'block' },
              },
              h('path', { d: 'M2.6 8a5.4 5.4 0 1 0 1.6-3.9' }),
              h('path', { d: 'M2.4 3.2V6h2.8' }),
              h('path', { d: 'M8 5.1V8l2.1 1.7' }),
            ),
          ),
        ),
      )
    }

    /**
     * Client → host calls, hand-rolled Typert style (the dsh-cost-meter
     * pattern): strict-codec contributions the client mounts on `ctx.remote`,
     * answered by the host half's `spcClicks.recordClick` (panel clicks),
     * `spcHistory.list` (the plugin activity log) and `spcFavorites.list` /
     * `spcFavorites.toggle` (the starred workspace projects). The host side
     * uses the gateway's src-descriptor fallback, so no generated zod manifest
     * is needed anywhere.
     */
    const JSON_CODEC = (typeSymbol) => ({
      mode: 'strict',
      typeSymbol,
      schema: { parse: (v) => v },
      create: () => ({ parse: (v) => v }),
    })
    const CLICK_CONTRIBUTION = {
      package: 'dsh-toomuch-plugins',
      face: 'host',
      descriptors: [
        {
          id: 'dsh-toomuch-plugins#spcClicks/recordClick',
          service: 'spcClicks',
          namespace: 'spcClicks',
          method: 'recordClick',
          invocation: { kind: 'direct' },
          parameters: [
            {
              name: 'id',
              wire: 'id',
              source: 'json',
              codec: { mode: 'strict', typeSymbol: 'dsh-toomuch-plugins#PanelId', schema: { parse: (v) => v }, create: () => ({ parse: (v) => v }) },
            },
          ],
          result: { mode: 'strict', typeSymbol: 'dsh-toomuch-plugins#ClickCount', schema: { parse: (v) => v }, create: () => ({ parse: (v) => v }) },
        },
        {
          id: 'dsh-toomuch-plugins#spcHistory/list',
          service: 'spcHistory',
          namespace: 'spcHistory',
          method: 'list',
          invocation: { kind: 'direct' },
          parameters: [],
          result: { mode: 'strict', typeSymbol: 'dsh-toomuch-plugins#ActivityLog', schema: { parse: (v) => v }, create: () => ({ parse: (v) => v }) },
        },
        {
          id: 'dsh-toomuch-plugins#spcFavorites/list',
          service: 'spcFavorites',
          namespace: 'spcFavorites',
          method: 'list',
          invocation: { kind: 'direct' },
          parameters: [],
          result: JSON_CODEC('dsh-toomuch-plugins#Favorites'),
        },
        {
          id: 'dsh-toomuch-plugins#spcFavorites/toggle',
          service: 'spcFavorites',
          namespace: 'spcFavorites',
          method: 'toggle',
          invocation: { kind: 'direct' },
          parameters: [
            { name: 'path', wire: 'path', source: 'json', codec: JSON_CODEC('dsh-toomuch-plugins#ProjectPath') },
          ],
          result: JSON_CODEC('dsh-toomuch-plugins#Favorites'),
        },
      ],
    }

    /* ------------------------------------------------------------------ *
     * 工作区收藏与筛选的 DOM 层（0.4.0）
     *
     * 宿主没给这两处留扩展点，只能做增量：
     *  - 项目行（`[data-row-key="workspace:<id>"]`）里没有装饰位 —— 星号插进行内；
     *  - 「视图选项 → 筛选会话」是宿主写死的 items 数组 —— 三个开关克隆宿主自己的
     *    菜单行插进去，配色、行高、悬停态都跟着宿主走。
     * 两处都靠结构关系定位（data 属性 / role），不认哈希 class 名。宿主改掉结构时
     * 选择器失配：星号与开关不出现，其余功能照旧 —— 与插件其余部分一样的安全失效。
     * ------------------------------------------------------------------ */

    /** 项目行；`workspace:` 后面是工作区 id。 */
    const PROJECT_ROW = '[data-row-key^="workspace:"]'
    /** 会话行；`session:` 后面是会话 id。 */
    const SESSION_ROW = '[data-row-key^="session:"]'
    /** 被筛掉的行打这个标记（CSS 隐藏，可整批撤销）。 */
    const FILTER_HIDDEN = 'data-spc-fhide'
    /** 我们自己插的星号。 */
    const STAR_ATTR = 'data-spc-star'
    /** 菜单面板的稳定钩子（primitives 的 Menu 恒带）。 */
    const MENU_SURFACE = '[data-menu-material]'
    /** 我们插进视图选项菜单的那三行。 */
    const FILTER_ROW = 'data-spc-filter'
    /** 装饰重算的合并窗口：宿主重渲染与流式输出会连着触发很多次。 */
    const DECORATE_DELAY_MS = 80

    /** 菜单里的三个开关：kind -> 偏好键。 */
    const FILTER_SWITCHES = [
      { kind: 'favorites', key: 'favoritesOnly', label: (t) => t('filterFavorites') },
      { kind: 'recent', key: 'recentOnly', label: (t) => t('filterRecent', { n: readPrefs().recentDays }) },
      { kind: 'latest', key: 'latestOnly', label: (t) => t('filterLatest', { m: readPrefs().latestCount }) },
    ]

    /**
     * 星号节点：一颗 12px 的星，颜色取主题的 warning 色（暗色主题下仍是黄的）。
     * @returns {Element} 星号 `<span>`。
     */
    function starNode() {
      const span = document.createElement('span')
      span.className = 'dsh-spc-star'
      span.setAttribute(STAR_ATTR, '')
      span.setAttribute('aria-hidden', 'true')
      span.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">'
        + '<path d="M8 1.7l1.9 3.85 4.25.62-3.07 3 .72 4.23L8 11.4l-3.8 2 .72-4.23-3.07-3 4.25-.62z"/></svg>'
      return span
    }

    /** 右键菜单里的星号图标：实心 = 已收藏，空心 = 未收藏。 */
    function starGlyph(filled) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 16,
          height: 16,
          'aria-hidden': 'true',
          fill: filled ? 'currentColor' : 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinejoin: 'round',
          style: { display: 'block', color: 'var(--dsw-alias-state-warn-primary, currentColor)' },
        },
        h('path', { d: 'M8 1.9l1.83 3.71 4.1.6-2.97 2.89.7 4.08L8 11.25l-3.66 1.93.7-4.08-2.97-2.89 4.1-.6z' }),
      )
    }

    /**
     * 建立工作区收藏 / 筛选的 DOM 层：项目行上的星号、被筛掉的行、视图选项菜单里的
     * 三个开关。所有触发器都只是「安排一次重算」，真正的计算合并在一个时间窗里跑。
     * @param {object} ctx 客户端插件上下文。
     * @param {(key: string, params?: object) => string} t 本插件的翻译函数。
     * @returns {{refresh: () => void, dispose: () => void}} 手动重算与清理。
     */
    function createWorkspaceDecorations(ctx, t) {
      let timer = null
      let observer = null

      /** 工作区快照里的项目行；读不到就当没有项目。 */
      function workspaceItems() {
        try {
          const items = ctx.get('workspaces')?.list?.getSnapshot?.()?.items
          return Array.isArray(items) ? items : []
        } catch {
          return []
        }
      }

      /** 会话摘要表；读不到就当没有会话。 */
      function sessionSummaries() {
        try {
          const byId = ctx.get('sessions')?.list?.getSnapshot?.()?.byId
          return byId !== null && typeof byId === 'object' ? byId : {}
        } catch {
          return {}
        }
      }

      /**
       * 星号：插在项目名**后面**，紧挨着名字。
       *
       * 宿主的项目行是 `<div class=projectRow><span class=slot/>×2
       * <span class=projectText><span class=title>名字</span></span>
       * <span class=rowActions/></div>`：
       *  - `.projectText` 是 `flex:1` 的**列**容器，`.title` 在它里面；
       *  - `.title` 自己带 `overflow:hidden; text-overflow:ellipsis` —— 名字长了
       *    会被裁掉，所以星号不能插在 `.title` 里面（跟着一起被裁）。
       *  - 行尾（`.rowActions` 之前）同样不对：`.projectText` 的 `flex:1` 会把
       *    星号挤到整行最右边，紧挨悬停才出现的动作区，看起来像没有星号。
       *
       * 正确做法：把 `.projectText` 变成横向 flex（`row`），星号作为 `.title`
       * 的后继兄弟插进去 —— 名字占自己的宽度（长了省略号），星号紧跟其后。
       * 类名是构建期 hash，认不出来，所以按结构找：`.projectText` 是行内第一个
       * 「含子 span 的 span」，`.title` 是它唯一的子 span。
       * @param {Element} row 项目行。
       * @param {boolean} wanted 是否要显示星号。
       */
      function paintStar(row, wanted) {
        const existing = row.querySelector(`[${STAR_ATTR}]`)
        if (!wanted) {
          if (existing !== null) existing.remove()
          return
        }
        if (existing !== null) return
        const text = textColumnOf(row)
        if (text === null) return
        // 横向化：名字与星号并排。`align-items` 让星号与文字齐平。
        text.style.flexDirection = 'row'
        text.style.alignItems = 'center'
        text.style.gap = '4px'
        text.classList.add('dsh-spc-starCol')
        const title = text.querySelector('span')
        if (title !== null) {
          title.classList.add('dsh-spc-title')
          // 紧跟名字，而不是排在整列末尾：列里若还有别的元素，排在末尾会离名字很远。
          title.after(starNode())
          return
        }
        text.appendChild(starNode())
      }

      /**
       * 项目行里装着项目名的那一列（宿主的 `.projectText`）。
       *
       * 认法（不靠 hash 类名）：项目行的直接子元素里，`span.slot` 有两个（图标），
       * 接着是那个「自己还含一个 span」的 span —— 它就是名字列；它里面那个 span
       * 是 `.title`。会话行没有这个形状，所以不会误认。
       * @param {Element} row 项目行。
       * @returns {Element|null} 名字列，找不到则 null。
       */
      function textColumnOf(row) {
        const candidates = []
        for (const child of row.children) {
          candidates.push({
            tag: child.tagName,
            hasSpanChild: child.querySelector('span') !== null,
            // 只看直接文本节点：`textContent` 会把孙子的文字也算进来。
            ownText: directTextOf(child),
            element: child,
          })
        }
        const picked = pickTextColumn(candidates)
        return picked === null ? null : picked.element
      }

      /** 显隐：加 / 去一个标记属性，样式由插件自己的样式表提供。 */
      function setHidden(row, hidden) {
        if (hidden) row.setAttribute(FILTER_HIDDEN, '')
        else row.removeAttribute(FILTER_HIDDEN)
      }

      /**
       * 克隆宿主的一行菜单项，改成我们的筛选开关。克隆来的行自带宿主的行高、内边距、
       * 图标与悬停态，主题切换也跟着走。
       * @param {Element} wrap 模板行的外层元素。
       * @param {{kind: string, key: string, label: (t: Function) => string}} filter 开关定义。
       * @returns {Element|null} 新的一行；模板结构对不上则 null。
       */
      function cloneFilterRow(wrap, filter) {
        const clone = wrap.cloneNode(true)
        clone.setAttribute(FILTER_ROW, filter.kind)
        const btn = clone.matches('button') ? clone : clone.querySelector('button')
        if (btn === null) return null
        // 模板的选中态与无障碍状态都要清掉：勾由我们自己画。
        btn.removeAttribute('aria-current')
        btn.removeAttribute('aria-disabled')
        btn.removeAttribute('aria-describedby')
        // 模板行末的勾（宿主给已选中项画的）不能留：那是它自己那项的状态。
        for (const svg of btn.querySelectorAll('svg')) {
          if (svg.getAttribute('class') === null || svg.getAttribute('class').includes('check')) svg.remove()
        }
        // 模板的图标也不留：那是它那一项的图标（比如归档的箱子），与开关无关。
        // 去掉后这一行没有图标位，文字靠左，与宿主无图标的条目一致。
        for (const icon of btn.querySelectorAll('span')) {
          if (icon.querySelector('svg') !== null) icon.remove()
        }
        const children = [...btn.children]
        // 标签是「有文字的那个 span」；图标 span 里是 svg，没有文字。
        const labelSpan = children.find((el) => (el.textContent ?? '').trim() !== '' && el.querySelector('svg') === null)
        if (labelSpan === undefined) return null
        labelSpan.textContent = filter.label(t)
        labelSpan.setAttribute('data-spc-menu-label', '')
        // 勾自己画一个：宿主只给「已选中」的行画勾，我们这三行是独立开关。
        const check = document.createElement('span')
        check.className = 'dsh-spc-menuCheck'
        check.setAttribute('aria-hidden', 'true')
        check.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" '
          + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>'
        btn.appendChild(check)
        btn.setAttribute('aria-pressed', String(readPrefs()[filter.key] === true))
        // 只切自己的开关，不关菜单：用户常常要连着勾两个。
        btn.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          const prefs = readPrefs()
          writePrefs({ ...prefs, [filter.key]: prefs[filter.key] !== true })
        })
        return clone
      }

      /**
       * 往「视图选项」菜单里插三个开关。
       *
       * 认法：宿主给 `type: 'label'` 的分组标题渲染成 `role="presentation"` 的行，
       * 只有视图选项菜单有（分组 / 排序 / 筛选三个标题），会话右键菜单一个都没有。
       * @param {Element} surface 菜单面板。
       */
      function injectFilters(surface) {
        // 已经注入过：只同步勾的状态。宿主每次打开菜单都重建这一片 DOM，
        // 克隆出来的行是新节点，勾的显隐得重新按偏好写一遍。
        if (surface.querySelector(`[${FILTER_ROW}]`) !== null) {
          syncFilterRows()
          return
        }
        if (surface.querySelectorAll('[role="presentation"]').length < 2) return
        const items = [...surface.querySelectorAll('button[role="menuitem"]')]
        const template = items[items.length - 1]
        const wrap = template === undefined ? null : template.parentElement
        // 插到宿主条目所在的那一层容器里，而不是面板根上：条目外面若还有一层包裹，
        // 插到根上就会落在包裹外面、撑不满一行。
        const host = wrap === null ? null : wrap.parentElement
        if (host === null || !surface.contains(host)) return
        for (const filter of FILTER_SWITCHES) {
          const row = cloneFilterRow(wrap, filter)
          if (row !== null) host.appendChild(row)
        }
        syncFilterRows()
      }

      /** 菜单开着时，把三行的勾与文案同步到当前偏好。 */
      function syncFilterRows() {
        const prefs = readPrefs()
        for (const filter of FILTER_SWITCHES) {
          for (const row of document.querySelectorAll(`[${FILTER_ROW}="${filter.kind}"]`)) {
            const btn = row.matches('button') ? row : row.querySelector('button')
            if (btn === null) continue
            const check = btn.querySelector('.dsh-spc-menuCheck')
            if (check !== null) {
              if (prefs[filter.key] === true) check.removeAttribute('data-off')
              else check.setAttribute('data-off', '')
            }
            btn.setAttribute('aria-pressed', String(prefs[filter.key] === true))
            const labelSpan = btn.querySelector('[data-spc-menu-label]')
            if (labelSpan !== null) labelSpan.textContent = filter.label(t)
          }
        }
      }

      /** 一次完整的重算：星号、被筛掉的行、菜单开关。 */
      function apply() {
        if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function' || document.body == null) return
        const prefs = readPrefs()
        const items = workspaceItems()
        const favorites = new Set(getFavorites())
        const filtered = prefs.favoritesOnly === true || prefs.recentOnly === true || prefs.latestOnly === true
        const visible = filtered ? visibleWorkspaceIds(items, sessionSummaries(), favorites, prefs, Date.now()) : null
        const pathOf = new Map(items.map((item) => [item.workspaceId, item.path]))
        // 被筛掉的项目底下的会话也要跟着藏。不属于任何项目的会话不受项目筛选影响。
        const hiddenSessions = new Set()
        if (visible !== null) {
          for (const item of items) {
            if (visible.has(item.workspaceId)) continue
            for (const id of item.sessionIds ?? []) hiddenSessions.add(id)
          }
        }
        for (const row of document.querySelectorAll(PROJECT_ROW)) {
          const key = row.getAttribute('data-row-key') ?? ''
          const workspaceId = key.slice('workspace:'.length)
          // 「未分组」桶不是项目：没有可收藏的路径，也就不参与筛选。
          if (workspaceId === '') {
            row.removeAttribute(FILTER_HIDDEN)
            continue
          }
          paintStar(row, favorites.has(pathOf.get(workspaceId)))
          setHidden(row, visible !== null && !visible.has(workspaceId))
        }
        for (const row of document.querySelectorAll(SESSION_ROW)) {
          const key = row.getAttribute('data-row-key') ?? ''
          setHidden(row, hiddenSessions.has(key.slice('session:'.length)))
        }
        for (const surface of document.querySelectorAll(MENU_SURFACE)) injectFilters(surface)
      }

      /** 合并短时间内的多次触发。 */
      function schedule() {
        if (timer !== null || typeof setTimeout !== 'function') return
        timer = setTimeout(() => {
          timer = null
          apply()
        }, DECORATE_DELAY_MS)
      }

      /**
       * 一个节点是否可能影响装饰（是它自己，或被它包着）。
       * @param {Node|null} node 待判定的节点。
       * @returns {boolean} 是否需要重算。
       */
      function relevant(node) {
        if (node === null || typeof node !== 'object' || node.nodeType !== 1) return false
        const selector = `${PROJECT_ROW},${SESSION_ROW},${MENU_SURFACE},[${FILTER_HIDDEN}]`
        if (typeof node.matches === 'function' && node.matches(selector)) return true
        return typeof node.querySelector === 'function' && node.querySelector(selector) !== null
      }

      /**
       * 一个节点是否是「我们插进去的星号」。React 重建项目行时会把它连同整段
       * children 一起删掉 —— 它不认这颗星。看到它被移除就要重画一次补回来。
       * @param {Node|null} node 待判定的节点。
       * @returns {boolean} 是否是星号（或含星号的子树）。
       */
      function isStar(node) {
        if (node === null || typeof node !== 'object' || node.nodeType !== 1) return false
        if (typeof node.matches === 'function' && node.matches(`[${STAR_ATTR}]`)) return true
        return typeof node.querySelector === 'function' && node.querySelector(`[${STAR_ATTR}]`) !== null
      }

      const unsubscribers = [subscribePrefs(schedule), favoritesSource.subscribe(schedule)]
      for (const name of ['workspaces', 'sessions']) {
        try {
          const source = ctx.get(name)?.list
          if (source !== undefined && typeof source.subscribe === 'function') unsubscribers.push(source.subscribe(schedule))
        } catch {
          // 没有这个服务：筛选就没有数据可算，其余功能照旧。
        }
      }
      if (typeof MutationObserver === 'function' && typeof document !== 'undefined' && document.body != null) {
        observer = new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes) {
              if (relevant(node)) {
                schedule()
                return
              }
            }
            // 宿主重建项目行时会把我们插进去的星号一起删掉：它不在 React 的
            // children 计划里。看到星号消失就重画一次补回来。
            for (const node of record.removedNodes) {
              if (isStar(node)) {
                schedule()
                return
              }
            }
          }
        })
        observer.observe(document.body, { childList: true, subtree: true })
      }
      schedule()

      return {
        refresh: schedule,
        dispose() {
          if (timer !== null && typeof clearTimeout === 'function') clearTimeout(timer)
          timer = null
          if (observer !== null) observer.disconnect()
          observer = null
          for (const off of unsubscribers) {
            try {
              off()
            } catch {
              // 已经摘掉了。
            }
          }
        },
      }
    }

    return {
      inject: ['slots', 'locale', 'remote', 'contextMenus', 'workspaces', 'sessions'],
      /**
       * 纯计算部分（不碰 DOM）给冒烟检查一个入口：收藏筛选的判定有分支、有边界，
       * 值得单独断言，而不是只能靠手动点侧栏。
       */
      filter: { sanitizeFilterPrefs, lastActivityByWorkspace, ancestorWorkspace, visibleWorkspaceIds },
      /**
       * 星号定位的纯逻辑部分：名字列的判定。DOM 部分在浏览器里，这里给冒烟检查
       * 一个可断言的入口 —— 位置判错过一次，值得钉住。
       */
      star: { pickTextColumn },
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'dsh-toomuch-plugins: dictionaries')
        const t = ctx.locale.bind(NS)
        refreshListEntries(ctx)

        // Report panel clicks to the host half and read the plugin activity
        // log from it (best effort: if the remote is unavailable the sidebar
        // just keeps working without counts and without the activity window).
        let clickRpc = null
        let historyRpc = null
        let favoritesRpc = null
        ctx.effect(() => {
          if (ctx.remote === undefined || typeof ctx.remote.$mount !== 'function') return undefined
          let cancelled = false
          let dispose = null
          ctx.remote.$mount(CLICK_CONTRIBUTION)
            .then((d) => {
              if (cancelled) {
                d()
                return
              }
              dispose = d
              clickRpc = ctx.get('remote.spcClicks')
              historyRpc = ctx.get('remote.spcHistory')
              favoritesRpc = ctx.get('remote.spcFavorites')
              // 收藏的权威在 Host 半边：挂上远程后先读一次。
              if (favoritesRpc !== null && favoritesRpc !== undefined) loadFavorites()
            })
            .catch(() => {
              // Mount failed: counts stay off, nothing else to clean up.
            })
          return () => {
            cancelled = true
            clickRpc = null
            historyRpc = null
            favoritesRpc = null
            if (dispose !== null) {
              try {
                dispose()
              } catch {
                // Already gone.
              }
            }
          }
        }, 'dsh-toomuch-plugins: click remote')

        /** 远程返回的 `{ ok, value }` 信封拆出 payload；不是信封就原样返回。 */
        function payloadOf(result) {
          return result !== null && typeof result === 'object' && 'ok' in result
            ? result.ok === true
              ? result.value
              : null
            : result
        }

        /**
         * 从 Host 半边读一次收藏列表。读不到就保持空 —— 星号与筛选是尽力而为的
         * 装饰，Host 半边的远程不可用时侧栏其余部分照常工作。
         */
        function loadFavorites() {
          if (favoritesRpc === null || favoritesRpc === undefined) return
          Promise.resolve(favoritesRpc.list())
            .then((result) => {
              const payload = payloadOf(result)
              if (payload !== null && Array.isArray(payload.paths)) setFavorites(payload.paths)
            })
            .catch(() => {
              // 读失败：收藏保持当前镜像，不影响其他功能。
            })
        }

        /**
         * 切换一个项目的收藏。Host 是权威，成功后用 Host 返回的完整列表覆盖本地镜像；
         * 远程不可用时只翻本地镜像 —— 这次点击会随刷新消失，但界面不会假装没反应。
         * @param {string} path 项目绝对路径。
         */
        async function toggleFavorite(path) {
          if (typeof path !== 'string' || path === '') return
          if (favoritesRpc === null || favoritesRpc === undefined) {
            const next = new Set(getFavorites())
            if (next.has(path)) next.delete(path)
            else next.add(path)
            setFavorites([...next])
            return
          }
          try {
            const payload = payloadOf(await favoritesRpc.toggle(path))
            if (payload !== null && Array.isArray(payload.paths)) setFavorites(payload.paths)
          } catch {
            // 写入失败：收藏状态保持原样。
          }
        }

        ctx.effect(() => {
          if (typeof document === 'undefined') return undefined
          const onClick = (event) => {
            if (clickRpc === null) return
            const id = entryIdOfRow(event.target)
            if (id === null) return
            // Fire and forget; the host clamps and persists the count.
            Promise.resolve(clickRpc.recordClick(id)).catch(() => {})
          }
          document.addEventListener('click', onClick)
          return () => document.removeEventListener('click', onClick)
        }, 'dsh-toomuch-plugins: click count')

        // ---- 我的最爱：项目右键菜单的第一行 --------------------------------
        // order 50 排在宿主「重命名」（100）前面，所以它永远是第一行。
        // observe 挂上收藏来源：菜单开着时星标改了，菜单会自己重解析。
        ctx.effect(() => {
          if (ctx.contextMenus === undefined || typeof ctx.contextMenus.register !== 'function') return undefined
          const off = ctx.contextMenus.register({
            id: 'workspace.favorite',
            target: 'workspace',
            order: 50,
            observe: () => [favoritesSource],
            resolve: ({ path }) => {
              const starred = typeof path === 'string' && getFavorites().includes(path)
              return [
                {
                  id: 'favorite',
                  label: t('favorite'),
                  icon: { key: starred ? 'workspace.favoriteOn' : 'workspace.favoriteOff' },
                  run: () => toggleFavorite(path),
                },
              ]
            },
          })
          return typeof off === 'function' ? off : undefined
        }, 'dsh-toomuch-plugins: favorite menu')

        // 菜单图标按 key 从 keyed 槽里取，所以先注册两枚星（实心 / 空心）。
        if (ctx.slots !== undefined && typeof ctx.slots.inject === 'function') {
          ctx.slots.inject('contextMenu.icon', function* () {
            yield ctx.slots.register({ name: 'contextMenu.icon', key: 'workspace.favoriteOn' }, () => starGlyph(true))
            yield ctx.slots.register({ name: 'contextMenu.icon', key: 'workspace.favoriteOff' }, () => starGlyph(false))
          })
        }

        // 星号、筛选、菜单开关三件事都靠这一份 DOM 层：它自己订阅偏好、收藏与
        // 工作区 / 会话快照，宿主重渲染时靠 MutationObserver 重算。
        const decorations = createWorkspaceDecorations(ctx, t)
        ctx.effect(() => {
          decorations.refresh()
          return () => decorations.dispose()
        }, 'dsh-toomuch-plugins: workspace decorations')

        /**
         * The plugin activity window. The footer icon fires OPEN_EVENT; the
         * window lives in the shell overlay so it is not clipped by the
         * sidebar. Two tabs: every install / removal, and the enable /
         * disable records of the last month (the host applies that window).
         */
        function ActivityWindow() {
          const [open, setOpen] = React.useState(false)
          const [tab, setTab] = React.useState('installRemove')
          const [log, setLog] = React.useState(null)
          const [failed, setFailed] = React.useState(false)

          const load = () => {
            if (historyRpc === null) {
              setLog(null)
              setFailed(true)
              return
            }
            Promise.resolve(historyRpc.list())
              .then((result) => {
                // A remote call answers with `{ ok, value }`; the payload is
                // the value of a successful one.
                const payload =
                  result !== null && typeof result === 'object' && 'ok' in result
                    ? result.ok === true
                      ? result.value
                      : null
                    : result
                setLog(payload ?? null)
                setFailed(payload === null || payload === undefined)
              })
              .catch(() => {
                setLog(null)
                setFailed(true)
              })
          }

          React.useEffect(() => {
            if (typeof window === 'undefined') return undefined
            const onOpen = () => {
              setOpen(true)
              load()
            }
            window.addEventListener(OPEN_EVENT, onOpen)
            return () => window.removeEventListener(OPEN_EVENT, onOpen)
          }, [])

          React.useEffect(() => {
            if (!open || typeof document === 'undefined') return undefined
            const onKey = (event) => {
              if (event.key === 'Escape') setOpen(false)
            }
            document.addEventListener('keydown', onKey)
            return () => document.removeEventListener('keydown', onKey)
          }, [open])

          if (!open) return null

          const events = log === null
            ? []
            : tab === 'installRemove'
              ? (log.installRemove ?? [])
              : (log.enableDisable ?? [])
          const rows = events.map((event, index) => {
            const action = typeof event.action === 'string' ? event.action : ''
            const label = 'action' + action.charAt(0).toUpperCase() + action.slice(1)
            return h(
              'div',
              { className: 'dsh-spc-histRow', key: `${event.time}-${action}-${event.name}-${index}` },
              h(
                'span',
                { className: 'dsh-spc-histBadge dsh-spc-a' + action, 'aria-label': t(label) },
                actionIcon(action),
              ),
              h('span', { className: 'dsh-spc-histName', title: event.name }, event.name),
              h('span', { className: 'dsh-spc-histTime' }, formatTime(event.time)),
            )
          })

          return h(
            'div',
            { className: 'dsh-spc-modalMask', onClick: () => setOpen(false) },
            h(
              'div',
              {
                className: 'dsh-spc-modal',
                role: 'dialog',
                'aria-modal': 'true',
                'aria-label': t('historyTitle'),
                onClick: (event) => event.stopPropagation(),
              },
              h('style', null, HIST_CSS),
              h(
                'div',
                { className: 'dsh-spc-modalHead' },
                h('span', { className: 'dsh-spc-modalTitle' }, t('historyTitle')),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dsh-spc-modalClose',
                    'aria-label': t('close'),
                    onClick: () => setOpen(false),
                  },
                  '✕',
                ),
              ),
              h(
                'div',
                { className: 'dsh-spc-tabs', role: 'tablist' },
                h(
                  'button',
                  {
                    type: 'button',
                    role: 'tab',
                    'aria-selected': tab === 'installRemove',
                    className: 'dsh-spc-tab' + (tab === 'installRemove' ? ' dsh-spc-tabOn' : ''),
                    onClick: () => setTab('installRemove'),
                  },
                  t('tabInstallRemove'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    role: 'tab',
                    'aria-selected': tab === 'enableDisable',
                    className: 'dsh-spc-tab' + (tab === 'enableDisable' ? ' dsh-spc-tabOn' : ''),
                    onClick: () => setTab('enableDisable'),
                  },
                  t('tabEnableDisable'),
                ),
              ),
              h(
                'div',
                { className: 'dsh-spc-modalBody' },
                ...(failed
                  ? [h('div', { className: 'dsh-spc-histEmpty' }, t('historyUnavailable'))]
                  : rows.length === 0
                    ? [h('div', { className: 'dsh-spc-histEmpty' }, t('historyEmpty'))]
                    : rows),
              ),
            ),
          )
        }

        /**
         * The display settings page, mounted as this plugin's tab in the
         * Plugins settings section. It only edits localStorage; the footer
         * toggle's effect pushes the result onto the live panel list.
         */
        function DisplaySettingsTab() {
          const [prefs, setPrefsState] = React.useState(readPrefs)
          React.useEffect(() => subscribePrefs(() => setPrefsState(readPrefs())), [])
          // The plugin-order dropdown is drawn by the page (a native <select>
          // popup is painted by the browser and cannot follow the theme), so
          // it needs its own open state plus a click-outside to close it.
          const [dropOpen, setDropOpen] = React.useState(false)
          React.useEffect(() => {
            if (!dropOpen || typeof document === 'undefined') return undefined
            const onDown = (event) => {
              const target = event.target
              if (target && typeof target.closest === 'function' && target.closest('.dsh-spc-drop') !== null) return
              setDropOpen(false)
            }
            document.addEventListener('click', onDown)
            return () => document.removeEventListener('click', onDown)
          }, [dropOpen])
          // Panels registered after this tab first rendered (dsh-context
          // registers its sidebar entry behind a settings gate) re-render the
          // dropdown as soon as the slot changes.
          const [, setEntryTick] = React.useState(0)
          React.useEffect(() => {
            if (ctx.slots === undefined || typeof ctx.slots.subscribe !== 'function') return undefined
            const off = ctx.slots.subscribe('sidebar.panellist', () => setEntryTick((n) => n + 1))
            return typeof off === 'function' ? off : undefined
          }, [])
          const update = (patch) => writePrefs({ ...readPrefs(), ...patch })
          // A labelled row of single-choice buttons for one pref. The
          // collapsed-limit picker switches with the display mode: plain
          // entries in list mode, rows (× columns) in grid mode.
          const pickRow = (prefKey, labelKey, options, hintKey, labelOf) =>
            h(
              'div',
              { className: 'dsh-spc-setRow' },
              h('span', { className: 'dsh-spc-setCaption' }, t(labelKey)),
              h(
                'div',
                { className: 'dsh-spc-cols' },
                options.map((n) =>
                  h(
                    'button',
                    {
                      key: n,
                      type: 'button',
                      className: 'dsh-spc-col' + (prefs[prefKey] === n ? ' dsh-spc-colOn' : ''),
                      'aria-pressed': prefs[prefKey] === n,
                      onClick: () => update({ [prefKey]: n }),
                    },
                    labelOf === undefined ? String(n) : labelOf(n),
                  ),
                ),
              ),
              hintKey === undefined ? null : h('span', { className: 'dsh-spc-setCaption' }, t(hintKey)),
            )
          // 一个带上下限的数字项（「仅显示最近」的天数、「仅显示最新」的项目数）。
          // 输入越界立刻夹回范围内，空值 / 非数字不动 —— 用户清空重打时不该跳回默认。
          const numberRow = (prefKey, labelKey) =>
            h(
              'div',
              { className: 'dsh-spc-setRow' },
              h('span', { className: 'dsh-spc-setCaption' }, t(labelKey)),
              h('input', {
                type: 'number',
                className: 'dsh-spc-num',
                min: 1,
                max: prefKey === 'recentDays' ? RECENT_DAYS_MAX : LATEST_COUNT_MAX,
                step: 1,
                value: String(prefs[prefKey]),
                onChange: (event) => {
                  const next = Math.trunc(Number(event.target.value))
                  if (!Number.isFinite(next)) return
                  const max = prefKey === 'recentDays' ? RECENT_DAYS_MAX : LATEST_COUNT_MAX
                  update({ [prefKey]: Math.min(max, Math.max(1, next)) })
                },
              }),
              h('span', { className: 'dsh-spc-setCaption' }, `1–${prefKey === 'recentDays' ? RECENT_DAYS_MAX : LATEST_COUNT_MAX}`),
            )
          return h(
            'div',
            { className: 'dsh-spc-set' },
            h('style', null, SET_CSS),
            h(
              'label',
              { className: 'dsh-spc-setToggle' },
              h('input', {
                type: 'checkbox',
                checked: prefs.grid,
                onChange: (event) => update({ grid: event.target.checked }),
              }),
              h('span', null, t('grid')),
            ),
            prefs.grid
              ? pickRow('columns', 'columns', [2, 3, 4])
              : pickRow('collapsedCount', 'collapsedCount', [0, 1, 2, 3, 4, 5], 'collapsedHint'),
            prefs.grid
              ? pickRow('collapsedRows', 'collapsedRows', [0, 1, 2, 3], 'collapsedHint')
              : null,
            // ---- Icon size ------------------------------------------------
            // Small / medium (the sidebar's own size, the default) / large.
            // The buttons show localized captions, everything else the shared
            // single-choice row already does.
            pickRow('iconSize', 'iconSize', ['sm', 'md', 'lg'], 'sizeHint', (n) =>
              t(n === 'sm' ? 'sizeSm' : n === 'md' ? 'sizeMid' : 'sizeLg'),
            ),
            // ---- Plugin display order ------------------------------------
            // Pick panels one by one from the dropdown; the list order *is*
            // the display order. Adding an already-listed panel is allowed —
            // writePrefs dedupes on save — and the list caps at 20.
            (() => {
              const entries = listEntries()
              const order = prefs.order
              const labelOf = (id) => {
                const hit = entries.find((entry) => entry.id === id)
                return hit === undefined ? id : hit.label
              }
              const full = order.length >= ORDER_MAX
              const add = (value) => {
                if (full) return
                update({ order: [...order, value] })
              }
              const move = (index, delta) => {
                const next = [...order]
                const other = index + delta
                if (other < 0 || other >= next.length) return
                ;[next[index], next[other]] = [next[other], next[index]]
                update({ order: next })
              }
              const remove = (index) => update({ order: order.filter((_, i) => i !== index) })
              return [
                h(
                  'div',
                  { className: 'dsh-spc-setRow dsh-spc-setRowDrop', key: 'order' },
                  h('span', { className: 'dsh-spc-setCaption' }, t('orderTitle')),
                  h(
                    'div',
                    {
                      className: 'dsh-spc-drop' + (dropOpen ? ' dsh-spc-dropOpen' : ''),
                      onKeyDown: (event) => {
                        if (event.key === 'Escape') setDropOpen(false)
                      },
                    },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'dsh-spc-dropBtn',
                        'aria-haspopup': 'true',
                        'aria-expanded': dropOpen,
                        disabled: full || entries.length === 0,
                        onClick: () => setDropOpen((v) => !v),
                      },
                      h('span', { className: 'dsh-spc-dropText' }, t('orderPick')),
                      h('span', { className: 'dsh-spc-dropArrow' }, '▾'),
                    ),
                    h(
                      'ul',
                      { className: 'dsh-spc-dropList' },
                      entries.map((entry) =>
                        h(
                          'li',
                          { key: entry.id, className: 'dsh-spc-dropItem' },
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'dsh-spc-dropItemBtn',
                              onClick: () => {
                                add(entry.id)
                                setDropOpen(false)
                              },
                            },
                            entry.label,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                h(
                  'div',
                  { className: 'dsh-spc-setRow', key: 'order-hint' },
                  h('span', { className: 'dsh-spc-setCaption' }, t('orderHint')),
                ),
                order.length === 0
                  ? h(
                      'div',
                      { className: 'dsh-spc-setRow', key: 'order-empty' },
                      h('span', { className: 'dsh-spc-setCaption' }, t('orderEmpty')),
                    )
                  : order.map((id, index) =>
                      h(
                        'div',
                        { className: 'dsh-spc-setRow', key: `order-${id}` },
                        h('span', { className: 'dsh-spc-setCaption' }, `${index + 1}. ${labelOf(id)}`),
                        h(
                          'div',
                          { className: 'dsh-spc-cols' },
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'dsh-spc-col',
                              'aria-label': t('orderUp'),
                              disabled: index === 0,
                              onClick: () => move(index, -1),
                            },
                            '▲',
                          ),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'dsh-spc-col',
                              'aria-label': t('orderDown'),
                              disabled: index === order.length - 1,
                              onClick: () => move(index, 1),
                            },
                            '▼',
                          ),
                          h(
                            'button',
                            {
                              type: 'button',
                              className: 'dsh-spc-col',
                              'aria-label': t('orderRemove'),
                              onClick: () => remove(index),
                            },
                            '✕',
                          ),
                        ),
                      ),
                    ),
              ]
            })(),
            // ---- 项目筛选（0.4.0）------------------------------------------
            // 三个开关本身在侧栏「视图选项 → 筛选会话」里；这里只放它们读的两个数。
            h('div', { className: 'dsh-spc-sep' }),
            numberRow('recentDays', 'recentDays'),
            numberRow('latestCount', 'latestCount'),
            h(
              'div',
              { className: 'dsh-spc-setRow' },
              h('span', { className: 'dsh-spc-setCaption' }, t('filterHint')),
            ),
          )
        }

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'sidebar-panel-collapse',
          order: ORDER,
          locale: NS,
        }, FooterToggle))
        // The plugin activity window lives in the shell overlay, so it is
        // drawn over the whole app and never clipped by the sidebar.
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'plugin-activity-window',
          order: 60,
          locale: NS,
        }, ActivityWindow))
        // Settings → Built-in plugins, where feature plugins own their pages
        // (the read-only inventory registers its own tab the same way).
        ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
          name: 'settings.plugins.tab',
          id: 'sidebar-display',
          order: 100,
          label: () => t('tab'),
          locale: NS,
        }, DisplaySettingsTab))
      },
    }
  },
})
