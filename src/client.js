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
    /** Event the dsh-plugin-insight bundle fires to ask for its usage page. */
    const USAGE_OPEN_EVENT = 'dsh-plugin-insight:open-usage'
    /** Event dsh-plugin-insight fires once its client half is up. */
    const USAGE_READY_EVENT = 'dsh-plugin-insight:ready'
    /** Global dsh-plugin-insight sets when its client half is up. */
    const USAGE_READY_FLAG = '__dshPluginInsightReady'

    /** Ask the activity window to open. */
    function openHistory() {
      if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
      window.dispatchEvent(new CustomEvent(OPEN_EVENT))
    }

    /**
     * Ask the plugin usage page to open. The page lives in the
     * dsh-plugin-insight bundle; this bundle only asks.
     */
    function openUsage() {
      if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
      window.dispatchEvent(new CustomEvent(USAGE_OPEN_EVENT))
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
      usage: '插件使用率分析',
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
      usage: 'Plugin usage analysis',
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
nav [data-spc-hidden]{display:none;}
/* Icon size: the row glyphs take width/height as SVG attributes (or inline
   style in third-party entries), so override with !important; the sprite
   symbols carry a viewBox, so the drawing scales with the viewport. */
nav.dsh-spc-size-sm :is(button,[role=button],[data-spc-adopted]) svg{width:12px !important;height:12px !important;}
nav.dsh-spc-size-lg :is(button,[role=button],[data-spc-adopted]) svg{width:24px !important;height:24px !important;}
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
.dsh-spc-histBadge.dsh-spc-aInstall{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 16%,transparent);}
.dsh-spc-histBadge.dsh-spc-aRemove{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 16%,transparent);}
.dsh-spc-histBadge.dsh-spc-aEnable{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 16%,transparent);}
.dsh-spc-histBadge.dsh-spc-aDisable{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 16%,transparent);}
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
`

    /**
     * Display settings: grid on/off plus icons per row (2–4). While the
     * panels are collapsed, the list keeps showing the first `collapsedCount`
     * entries (list mode) or the first `collapsedRows` rows (grid mode);
     * 0 collapses everything, the historical behaviour. `iconSize` scales
     * the row glyphs: sm/lg mark the nav, md leaves the sidebar's own size.
     */
    const DEFAULT_PREFS = { grid: false, columns: 3, collapsedCount: 0, collapsedRows: 0, order: [], iconSize: 'md' }
    const COLLAPSED_COUNT_MAX = 5
    const COLLAPSED_ROWS_MAX = 3
    /** Custom display order: at most 20 panel ids, duplicates dropped on save. */
    const ORDER_MAX = 20

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
     * The global panel list is the `<nav>` the sidebar renders as a direct child
     * of its root; walk up from this footer button until that child appears.
     * Returns null when the sidebar is not the shape we expect, in which case the
     * toggle stays harmless and does nothing.
     */
    function findPanelNav(from) {
      for (let el = from; el !== null && el !== document.body; el = el.parentElement) {
        const nav = el.querySelector(':scope > nav')
        if (nav !== null) return nav
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

    /** Visual rank of a row: order value of its direct child of the nav. */
    function rowRank(nav, row) {
      let el = row
      while (el.parentElement !== null && el.parentElement !== nav) el = el.parentElement
      if (el.parentElement !== nav) return 0
      const value = Number(el.style.order)
      return Number.isFinite(value) ? value : 0
    }

    function applyNav(rootEl, wide, collapsed, prefs) {
      if (rootEl === null) return
      const nav = findPanelNav(rootEl)
      if (nav === null) return
      // Remember the sidebar root so DOM-entry discovery (dropdown, ordering)
      // has a scope even before the settings page renders.
      sidebarRoot = nav.parentElement ?? null
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
      // Hide by visual order (custom display order first), not DOM order.
      const rows = Array.from(nav.querySelectorAll('button,[role=button],[data-spc-adopted]'))
        .map((row, domIndex) => ({ row, domIndex, rank: rowRank(nav, row) }))
        .sort((a, b) => a.rank - b.rank || a.domIndex - b.domIndex)
      for (const [index, { row }] of rows.entries()) {
        if (index < limit) row.removeAttribute('data-spc-hidden')
        else row.setAttribute('data-spc-hidden', '')
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
      rootEl.insertBefore(entry, before != null && before.parentElement === rootEl ? before : nav)
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
      // direct children of the sidebar root, which is the nav's parent.
      const sideRoot = nav.parentElement
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
      for (const row of nav.querySelectorAll('button,[role=button],[data-spc-adopted]')) {
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
      // The plugin usage page lives in another bundle; the button only shows
      // up once that bundle announces itself.
      const [usageReady, setUsageReady] = React.useState(false)
      const rootRef = React.useRef(null)

      React.useEffect(() => {
        if (typeof window === 'undefined') return undefined
        const ready = () => setUsageReady(true)
        // The other bundle may already be up when this one loads.
        if (window[USAGE_READY_FLAG] === true) ready()
        window.addEventListener(USAGE_READY_EVENT, ready)
        return () => window.removeEventListener(USAGE_READY_EVENT, ready)
      }, [])

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
        // The plugin usage page: a full workspace page, not a popup. It lives in
        // the dsh-plugin-insight bundle, so the button only shows up once that
        // bundle's client half is up — a dead button is worse than no button.
        usageReady
          ? h(
              'button',
              {
                type: 'button',
                className: 'dsh-spc-histBtn',
                title: t('usage'),
                'aria-label': t('usage'),
                onClick: openUsage,
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
                  h('path', { d: 'M2.4 13.2h11.2' }),
                  h('path', { d: 'M4.4 13.2V8.6' }),
                  h('path', { d: 'M7.6 13.2V4.4' }),
                  h('path', { d: 'M10.8 13.2V6.8' }),
                ),
              ),
            )
          : null,
      )
    }

    /**
     * Client → host calls, hand-rolled Typert style (the dsh-cost-meter
     * pattern): strict-codec contributions the client mounts on `ctx.remote`,
     * answered by the host half's `spcClicks.recordClick` (panel clicks) and
     * `spcHistory.list` (the plugin activity log). The host side uses the
     * gateway's src-descriptor fallback, so no generated zod manifest is
     * needed anywhere.
     */
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
      ],
    }

    return {
      inject: ['slots', 'locale', 'remote'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'dsh-toomuch-plugins: dictionaries')
        const t = ctx.locale.bind(NS)
        refreshListEntries(ctx)

        // Report panel clicks to the host half and read the plugin activity
        // log from it (best effort: if the remote is unavailable the sidebar
        // just keeps working without counts and without the activity window).
        let clickRpc = null
        let historyRpc = null
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
            })
            .catch(() => {
              // Mount failed: counts stay off, nothing else to clean up.
            })
          return () => {
            cancelled = true
            clickRpc = null
            historyRpc = null
            if (dispose !== null) {
              try {
                dispose()
              } catch {
                // Already gone.
              }
            }
          }
        }, 'dsh-toomuch-plugins: click remote')

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
