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
    /** Position among the sidebar's foot actions. */
    const ORDER = 5

    const ZH = {
      collapse: '收起全局面板',
      expand: '展开全局面板',
    }
    const EN = {
      collapse: 'Collapse global panels',
      expand: 'Expand global panels',
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
`

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

    function applyNav(rootEl, collapsed) {
      if (rootEl === null) return
      const nav = findPanelNav(rootEl)
      if (nav === null) return
      nav.style.display = collapsed ? 'none' : ''
    }

    function FooterToggle(props) {
      const t = typeof props.t === 'function' ? props.t : () => ''
      const wide = props.wide !== false
      const [collapsed, setCollapsed] = React.useState(readStored)
      const rootRef = React.useRef(null)

      // Runs after every render: cheap, and it re-applies the choice if the
      // sidebar has meanwhile re-created the list element.
      React.useEffect(() => {
        applyNav(rootRef.current, collapsed)
      })

      const label = t(collapsed ? 'expand' : 'collapse')
      const toggle = () => {
        const next = !collapsed
        writeStored(next)
        setCollapsed(next)
        applyNav(rootRef.current, next)
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
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'sidebar-panel-collapse',
          order: ORDER,
          locale: NS,
        }, FooterToggle))
      },
    }
  },
})
