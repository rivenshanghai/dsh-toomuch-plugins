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
 * icons only with the label as a hover tooltip, and pick how many icons fit
 * per row (2–4). Those preferences live in localStorage too — same safe-
 * default rules as the collapse state. Details: docs/design.md.
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

    const ZH = {
      collapse: '收起全局面板',
      expand: '展开全局面板',
      tab: '侧栏面板显示',
      grid: '网格方式显示（只显示图标，文字放悬停提示）',
      columns: '每行图标数量',
      collapsedCount: '收起时显示插件数',
      collapsedRows: '收起时显示行数',
      collapsedHint: '0 = 全部收起',
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
    }

    const CSS = `
.dsh-spc-layer{flex:none;align-items:center;width:100%;height:42px;margin:8px 0 0;display:flex;position:relative;box-sizing:border-box;}
.dsh-spc-layer.dsh-spc-rail{width:36px;height:36px;margin:0;}
.dsh-spc-row{box-sizing:border-box;width:calc(100% + 4px);height:42px;color:var(--dsw-alias-label-primary);cursor:pointer;background:0 0;border:none;border-radius:12px;align-items:center;gap:8px;margin:0 -2px;padding:0 10px 0 8px;font-family:inherit;font-size:14px;text-align:left;display:inline-flex;overflow:hidden;}
.dsh-spc-row:hover{background:var(--dsw-alias-interactive-bg-hover);}
.dsh-spc-row:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px;}
.dsh-spc-row.dsh-spc-btnRail{width:36px;height:36px;border-radius:50%;justify-content:center;gap:0;margin:0;padding:0;}
.dsh-spc-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);}
.dsh-spc-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
nav.dsh-spc-grid{grid-template-columns:repeat(var(--dsh-spc-grid-cols,3),minmax(0,1fr));gap:4px;display:grid;}
nav.dsh-spc-grid :is(button,[role=button],[data-spc-adopted]){box-sizing:border-box;justify-content:center;gap:0;margin:0;padding:7px 4px;width:100%;}
nav.dsh-spc-grid :is(button,[role=button],[data-spc-adopted])>*:not(:first-child){display:none;}
nav.dsh-spc-grid>div{min-width:0;}
nav [data-spc-hidden]{display:none;}
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
`

    /**
     * Display settings: grid on/off plus icons per row (2–4). While the
     * panels are collapsed, the list keeps showing the first `collapsedCount`
     * entries (list mode) or the first `collapsedRows` rows (grid mode);
     * 0 collapses everything, the historical behaviour.
     */
    const DEFAULT_PREFS = { grid: false, columns: 3, collapsedCount: 0, collapsedRows: 0 }
    const COLLAPSED_COUNT_MAX = 5
    const COLLAPSED_ROWS_MAX = 3

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
        }
      } catch {
        return DEFAULT_PREFS
      }
    }

    function writePrefs(prefs) {
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
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

    function applyNav(rootEl, wide, collapsed, prefs) {
      if (rootEl === null) return
      const nav = findPanelNav(rootEl)
      if (nav === null) return
      // How many entries the collapsed list keeps: rows × columns in grid
      // mode, plain entries otherwise; 0 hides the whole list (the original
      // behaviour). Expanding always shows everything again.
      const limit = !collapsed
        ? Infinity
        : wide && prefs.grid
          ? prefs.collapsedRows * prefs.columns
          : prefs.collapsedCount
      nav.style.display = limit === 0 ? 'none' : ''
      let index = 0
      for (const row of nav.querySelectorAll('button,[role=button],[data-spc-adopted]')) {
        if (index++ < limit) row.removeAttribute('data-spc-hidden')
        else row.setAttribute('data-spc-hidden', '')
      }
    }

    /**
     * A few third-party bundles (今日值得读 / 全局搜索 / 容器 and friends)
     * skip the `sidebar.panellist` slot and insert their own entry element
     * directly beside the nav, following one shared convention: an attribute
     * named `data-dsh-*-entry`. Grid mode adopts those entries into the nav
     * so they join the grid, and puts them back where they were when the grid
     * turns off. Their re-place observers only re-insert an entry once it
     * leaves the sidebar root entirely — the nav is still inside the root, so
     * adoption never fights them.
     */
    const ADOPT_ATTRS = [
      'data-dsh-rss-entry',
      'data-dsh-global-search-entry',
      'data-dsh-docker-entry',
      'data-dsh-taskboard-entry',
      'data-dsh-ssh-entry',
      'data-dsh-tty-entry',
    ]
    const ADOPTED_FLAG = 'data-spc-adopted'
    /** Where each adopted entry sat before the grid claimed it. */
    const adoptedBefore = new WeakMap()

    function findAdoptable(rootEl) {
      return rootEl.querySelectorAll(ADOPT_ATTRS.map((a) => `:scope > [${a}]`).join(','))
    }

    function adoptEntries(rootEl, nav) {
      const entries = Array.from(findAdoptable(rootEl))
      // Walk backwards so inserting each at the nav head keeps source order.
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i]
        if (entry.parentElement === nav) continue
        adoptedBefore.set(entry, entry.nextElementSibling)
        entry.setAttribute(ADOPTED_FLAG, '')
        nav.insertBefore(entry, nav.firstChild)
      }
    }

    function releaseEntries(rootEl, nav) {
      for (const entry of Array.from(nav.querySelectorAll(`[${ADOPTED_FLAG}]`))) {
        const before = adoptedBefore.get(entry)
        entry.removeAttribute(ADOPTED_FLAG)
        adoptedBefore.delete(entry)
        rootEl.insertBefore(entry, before !== null && before.parentElement === rootEl ? before : nav)
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
      if (!(wide && prefs.grid)) {
        releaseEntries(sideRoot, nav)
        if (!nav.classList.contains(GRID_CLASS)) return
        nav.classList.remove(GRID_CLASS)
        nav.style.removeProperty(GRID_COLS_VAR)
        for (const el of nav.querySelectorAll('[data-spc-tip]')) {
          el.removeAttribute('title')
          el.removeAttribute('data-spc-tip')
        }
        return
      }
      adoptEntries(sideRoot, nav)
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
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'dsh-toomuch-plugins: dictionaries')
        const t = ctx.locale.bind(NS)

        /**
         * The display settings page, mounted as this plugin's tab in the
         * Plugins settings section. It only edits localStorage; the footer
         * toggle's effect pushes the result onto the live panel list.
         */
        function DisplaySettingsTab() {
          const [prefs, setPrefsState] = React.useState(readPrefs)
          React.useEffect(() => subscribePrefs(() => setPrefsState(readPrefs())), [])
          const update = (patch) => writePrefs({ ...readPrefs(), ...patch })
          // A labelled row of single-choice buttons for one pref. The
          // collapsed-limit picker switches with the display mode: plain
          // entries in list mode, rows (× columns) in grid mode.
          const pickRow = (prefKey, labelKey, options, hintKey) =>
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
                    String(n),
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
          )
        }

        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'sidebar-panel-collapse',
          order: ORDER,
          locale: NS,
        }, FooterToggle))
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
