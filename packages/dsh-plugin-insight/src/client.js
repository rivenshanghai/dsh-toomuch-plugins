/**
 * Client half of the dsh-plugin-insight bundle (plugin usage & capability).
 *
 * Renders a full page in the main workspace area (`main` slot) — not a popup.
 * The sidebar button lives in the other bundle and opens this page by asking
 * the host layout to select it; see OPEN_EVENT below.
 *
 * The page reads the host's `pluginInsight.stats` over a hand-rolled Typert
 * remote (the dsh-cost-meter pattern), so it renders three separate rankings
 * and never merges them: explicit use, implicit hit, survival.
 */
window.__ModuleLoader__.load({
  // Must match the bundle's package name: the boot graph keys this module by it.
  id: 'dsh-plugin-insight',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Dictionary namespace owned by this plugin. */
    const NS = 'pluginInsight'
    /** Key of the page in the `main` slot; the sidebar button selects it. */
    const PAGE_KEY = 'plugin-insight-usage'
    /** Event the sidebar button fires to ask this page to open. */
    const OPEN_EVENT = 'dsh-plugin-insight:open-usage'
    /** Event this half fires once it is ready, so the button can appear. */
    const READY_EVENT = 'dsh-plugin-insight:ready'
    /** Global the sidebar button checks before it shows itself. */
    const READY_FLAG = '__dshPluginInsightReady'

    const ZH = {
      title: '插件使用率分析',
      subtitle: '显式、隐式、加载存活三类口径分开算，不合并排行。',
      loading: '正在读取…',
      unavailable: '读不到统计数据：宿主半边没有响应。',
      empty: '还没有采集到任何调用。',
      totals: '全局分母',
      activeSessions: '活跃会话',
      agentSteps: '代理步骤',
      boots: 'DSH 启动次数',
      plugins: '已加载插件',
      calls: '调用次数',
      explicit: '显式使用率',
      implicit: '隐式命中率',
      survival: '加载存活率',
      explicitHint: '用户输入的命令、手写的 /技能 手势、用户批准过的调用',
      implicitHint: '模型自己发起的调用',
      survivalHint: '被加载过的启动次数占比',
      colPlugin: '插件',
      colCalls: '调用',
      colError: '错误率',
      colP95: 'P95 耗时',
      colSessions: '跨会话',
      colActive: '30 天内',
      colInactive: '安装未激活',
      activeYes: '活跃',
      activeNo: '未活跃',
      builtin: '宿主自带',
      unknown: '未知',
      reload: '刷新',
      generatedAt: '统计时间',
    }
    const EN = {
      title: 'Plugin usage analysis',
      subtitle: 'Explicit use, implicit hits and survival are ranked separately.',
      loading: 'Loading…',
      unavailable: 'No statistics: the host half did not answer.',
      empty: 'No calls collected yet.',
      totals: 'Global denominators',
      activeSessions: 'Active sessions',
      agentSteps: 'Agent steps',
      boots: 'DSH boots',
      plugins: 'Loaded plugins',
      calls: 'Calls',
      explicit: 'Explicit use rate',
      implicit: 'Implicit hit rate',
      survival: 'Survival rate',
      explicitHint: 'User commands, /skill gestures and calls the user approved',
      implicitHint: 'Calls the model made on its own',
      survivalHint: 'Share of boots the plugin was loaded in',
      colPlugin: 'Plugin',
      colCalls: 'Calls',
      colError: 'Error rate',
      colP95: 'P95 latency',
      colSessions: 'Sessions',
      colActive: 'Active 30d',
      colInactive: 'Declared, never used',
      activeYes: 'Active',
      activeNo: 'Idle',
      builtin: 'Built-in',
      unknown: 'Unknown',
      reload: 'Refresh',
      generatedAt: 'Generated at',
    }

    /** Stylesheet of the usage page. */
    const CSS = `
.dsh-pi-page{box-sizing:border-box;height:100%;overflow:auto;padding:20px 24px 40px;color:var(--dsw-alias-label-primary);font-size:13px;}
.dsh-pi-head{display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;}
.dsh-pi-title{flex:1;min-width:0;}
.dsh-pi-title h1{margin:0 0 4px;font-size:17px;font-weight:600;}
.dsh-pi-title p{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;}
.dsh-pi-totals{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:18px;}
.dsh-pi-total{box-sizing:border-box;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);}
.dsh-pi-total b{display:block;font-size:18px;font-weight:600;}
.dsh-pi-total span{color:var(--dsw-alias-label-secondary);font-size:11px;}
.dsh-pi-legend{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;}
.dsh-pi-legend button{box-sizing:border-box;padding:5px 10px;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;}
.dsh-pi-legend button[aria-pressed="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}
.dsh-pi-table{width:100%;border-collapse:collapse;font-size:12px;}
.dsh-pi-table th,.dsh-pi-table td{padding:7px 10px;text-align:left;border-bottom:.5px solid var(--dsw-alias-border-l3);white-space:nowrap;}
.dsh-pi-table th{color:var(--dsw-alias-label-secondary);font-weight:500;}
.dsh-pi-table td.num{text-align:right;font-variant-numeric:tabular-nums;}
.dsh-pi-name{max-width:340px;overflow:hidden;text-overflow:ellipsis;}
.dsh-pi-badge{display:inline-block;padding:1px 6px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;}
.dsh-pi-flag{color:var(--dsw-alias-state-danger,var(--dsw-alias-label-secondary));font-size:11px;}
.dsh-pi-empty{padding:24px 0;color:var(--dsw-alias-label-secondary);text-align:center;}
`

    /**
     * Client → host calls, hand-rolled Typert style (the dsh-cost-meter
     * pattern): strict-codec contributions the client mounts on `ctx.remote`.
     */
    const USAGE_CONTRIBUTION = {
      package: 'dsh-plugin-insight',
      face: 'host',
      descriptors: [
        {
          id: 'dsh-plugin-insight#pluginInsight/stats',
          service: 'pluginInsight',
          namespace: 'pluginInsight',
          method: 'stats',
          invocation: { kind: 'direct' },
          parameters: [],
          result: { mode: 'strict', typeSymbol: 'dsh-plugin-insight#UsageStats', schema: { parse: (v) => v, create: () => ({ parse: (v) => v }) } },
        },
      ],
    }

    return {
      inject: ['slots', 'locale', 'remote'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'dsh-plugin-insight: dictionaries')
        const t = ctx.locale.bind(NS)

        // The host's layout service switches the workspace to this page.
        const openPage = () => {
          try {
            ctx.layout?.selectPanel?.(PAGE_KEY)
          } catch {
            // The page simply does not open; everything else still works.
          }
        }
        // Tell the world this half is up, so the sidebar button can appear.
        if (typeof window !== 'undefined') {
          try {
            window[READY_FLAG] = true
            window.dispatchEvent(new CustomEvent(READY_EVENT))
          } catch {
            // No window (node): nothing to announce.
          }
        }
        ctx.effect(() => {
          if (typeof window === 'undefined') return undefined
          const onOpen = () => openPage()
          window.addEventListener(OPEN_EVENT, onOpen)
          return () => window.removeEventListener(OPEN_EVENT, onOpen)
        }, 'dsh-plugin-insight: open page')

        let statsRpc = null
        ctx.effect(() => {
          if (ctx.remote === undefined || typeof ctx.remote.$mount !== 'function') return undefined
          let cancelled = false
          let dispose = null
          ctx.remote.$mount(USAGE_CONTRIBUTION)
            .then((d) => {
              if (cancelled) {
                d()
                return
              }
              dispose = d
              statsRpc = ctx.get('remote.pluginInsight')
            })
            .catch(() => {
              // Mount failed: the page shows "unavailable" and keeps the rest working.
            })
          return () => {
            cancelled = true
            statsRpc = null
            if (dispose !== null) {
              try {
                dispose()
              } catch {
                // Already gone.
              }
            }
          }
        }, 'dsh-plugin-insight: stats remote')

        /**
         * The usage page: three separate rankings over one table.
         */
        function UsagePage() {
          const [stats, setStats] = React.useState(null)
          const [failed, setFailed] = React.useState(false)
          const [metric, setMetric] = React.useState('explicit')

          const load = () => {
            if (statsRpc === null) {
              setFailed(true)
              return
            }
            Promise.resolve(statsRpc.stats())
              .then((result) => {
                const payload =
                  result !== null && typeof result === 'object' && 'ok' in result
                    ? result.ok === true
                      ? result.value
                      : null
                    : result
                setStats(payload ?? null)
                setFailed(payload === null || payload === undefined)
              })
              .catch(() => {
                setStats(null)
                setFailed(true)
              })
          }

          React.useEffect(() => {
            load()
            // The page may sit open for a while; refresh when it is shown again.
            if (typeof document === 'undefined') return undefined
            const onVisible = () => {
              if (document.visibilityState === 'visible') load()
            }
            document.addEventListener('visibilitychange', onVisible)
            return () => document.removeEventListener('visibilitychange', onVisible)
          }, [])

          if (failed) {
            return h('div', { className: 'dsh-pi-page' }, h('style', null, CSS), h('div', { className: 'dsh-pi-empty' }, t('unavailable')))
          }
          if (stats === null) {
            return h('div', { className: 'dsh-pi-page' }, h('style', null, CSS), h('div', { className: 'dsh-pi-empty' }, t('loading')))
          }

          const totals = stats.totals ?? {}
          const plugins = Array.isArray(stats.plugins) ? stats.plugins : []
          const metrics = [
            { key: 'explicit', label: t('explicit'), hint: t('explicitHint') },
            { key: 'implicit', label: t('implicit'), hint: t('implicitHint') },
            { key: 'survival', label: t('survival'), hint: t('survivalHint') },
          ]
          const active = metrics.find((m) => m.key === metric) ?? metrics[0]
          const rateOf = (plugin) => {
            if (metric === 'explicit') return plugin.explicitRate ?? 0
            if (metric === 'implicit') return plugin.implicitRate ?? 0
            return plugin.survivalRate ?? 0
          }
          const countOf = (plugin) => {
            if (metric === 'explicit') return plugin.explicit ?? 0
            if (metric === 'implicit') return plugin.implicit ?? 0
            return plugin.sessions ?? 0
          }
          // Each ranking sorts by its own metric: the three never merge.
          const ranked = [...plugins].sort((a, b) => rateOf(b) - rateOf(a) || countOf(b) - countOf(a))

          return h(
            'div',
            { className: 'dsh-pi-page' },
            h('style', null, CSS),
            h(
              'div',
              { className: 'dsh-pi-head' },
              h(
                'div',
                { className: 'dsh-pi-title' },
                h('h1', null, t('title')),
                h('p', null, t('subtitle')),
              ),
              h('button', { type: 'button', onClick: load }, t('reload')),
            ),
            h(
              'div',
              { className: 'dsh-pi-totals' },
              [
                ['activeSessions', totals.activeSessions ?? 0],
                ['agentSteps', totals.agentSteps ?? 0],
                ['boots', totals.boots ?? 0],
                ['plugins', totals.plugins ?? 0],
                ['calls', totals.calls ?? 0],
              ].map(([key, value]) =>
                h(
                  'div',
                  { className: 'dsh-pi-total', key },
                  h('b', null, String(value)),
                  h('span', null, t(key)),
                ),
              ),
            ),
            h(
              'div',
              { className: 'dsh-pi-legend', role: 'tablist' },
              metrics.map((m) =>
                h(
                  'button',
                  {
                    key: m.key,
                    type: 'button',
                    role: 'tab',
                    'aria-pressed': metric === m.key,
                    title: m.hint,
                    onClick: () => setMetric(m.key),
                  },
                  m.label,
                ),
              ),
            ),
            ranked.length === 0
              ? h('div', { className: 'dsh-pi-empty' }, t('empty'))
              : h(
                  'table',
                  { className: 'dsh-pi-table' },
                  h(
                    'thead',
                    null,
                    h(
                      'tr',
                      null,
                      h('th', null, t('colPlugin')),
                      h('th', { className: 'num' }, t('calls')),
                      h('th', { className: 'num' }, active.label),
                      h('th', { className: 'num' }, t('colError')),
                      h('th', { className: 'num' }, t('colP95')),
                      h('th', { className: 'num' }, t('colSessions')),
                      h('th', null, t('colActive')),
                      h('th', null, t('colInactive')),
                    ),
                  ),
                  h(
                    'tbody',
                    null,
                    ranked.map((plugin) =>
                      h(
                        'tr',
                        { key: plugin.pluginId },
                        h(
                          'td',
                          { className: 'dsh-pi-name', title: plugin.pluginId },
                          plugin.pluginId,
                        ),
                        h('td', { className: 'num' }, String(plugin.calls ?? 0)),
                        h('td', { className: 'num' }, `${(rateOf(plugin) * 100).toFixed(1)}%`),
                        h('td', { className: 'num' }, `${((plugin.errorRate ?? 0) * 100).toFixed(1)}%`),
                        h('td', { className: 'num' }, plugin.p95Ms === null || plugin.p95Ms === undefined ? '—' : `${plugin.p95Ms}ms`),
                        h('td', { className: 'num' }, String(plugin.sessions ?? 0)),
                        h(
                          'td',
                          null,
                          plugin.active30d === true
                            ? h('span', { className: 'dsh-pi-badge' }, t('activeYes'))
                            : h('span', { className: 'dsh-pi-badge' }, t('activeNo')),
                        ),
                        h(
                          'td',
                          null,
                          (plugin.declaredButInactive ?? []).length === 0
                            ? '—'
                            : h('span', { className: 'dsh-pi-flag' }, (plugin.declaredButInactive ?? []).join(', ')),
                        ),
                      ),
                    ),
                  ),
                ),
          )
        }

        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: PAGE_KEY,
          locale: NS,
        }, UsagePage))
      },
    }
  },
})
