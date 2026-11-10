// Minimal wiring check for src/client.js — run with: node test/smoke.js
// Zero deps: stubs window.__ModuleLoader__ and react, then asserts the plugin
// registers both slots with the expected metadata and that the settings tab
// reads/writes its localStorage preferences through the safe-default rules.
import assert from 'node:assert'

// --- browser stub ---------------------------------------------------------
const store = new Map()
// The window stub keeps a general event registry: the activity window listens
// for its open event, the usage button fires the other bundle's open event.
const openHandlers = []
const usageReadyHandlers = []
const usageOpenHandlers = []
const dispatchedEvents = []
global.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  addEventListener: (type, fn) => {
    if (type === 'dsh-toomuch-plugins:open-activity') openHandlers.push(fn)
    else if (type === 'dsh-plugin-insight:ready') usageReadyHandlers.push(fn)
    else if (type === 'dsh-plugin-insight:open-usage') usageOpenHandlers.push(fn)
  },
  removeEventListener: (type, fn) => {
    const list =
      type === 'dsh-toomuch-plugins:open-activity'
        ? openHandlers
        : type === 'dsh-plugin-insight:ready'
          ? usageReadyHandlers
          : type === 'dsh-plugin-insight:open-usage'
            ? usageOpenHandlers
            : null
    if (list === null) return
    const at = list.indexOf(fn)
    if (at >= 0) list.splice(at, 1)
  },
  dispatchEvent: (event) => {
    dispatchedEvents.push(event.type)
    const list =
      event.type === 'dsh-plugin-insight:ready'
        ? usageReadyHandlers
        : event.type === 'dsh-plugin-insight:open-usage'
          ? usageOpenHandlers
          : []
    for (const fn of list.slice()) fn(event)
    return true
  },
}
let loaded = null
window.__ModuleLoader__ = { load: (mod) => { loaded = mod } }

// --- react stub -----------------------------------------------------------
// createElement builds a plain tree; hooks are inert so components can be
// invoked as plain functions during render assertions. Effects are captured
// (not run) so the footer's apply effect can be driven explicitly against a
// fake sidebar root.
const effects = []
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: (fn) => { if (typeof fn === 'function') effects.push(fn) },
  useRef: (init) => ({ current: init }),
}

// --- load the module ------------------------------------------------------
// Dynamic import so the stubs above exist before src/client.js evaluates.
await import('../src/client.js')
assert.ok(loaded && typeof loaded.factory === 'function', 'module loaded')
const mod = loaded.factory((name) => {
  assert.strictEqual(name, 'react', 'unexpected require: ' + name)
  return React
})
assert.deepStrictEqual(mod.inject, ['slots', 'locale', 'remote'], 'inject faces')

// --- fake ctx -------------------------------------------------------------
// document stub so the plugin can register its click listener.
let clickHandler = null
global.document = {
  addEventListener: (type, fn) => { if (type === 'click') clickHandler = fn },
  removeEventListener: (type, fn) => { if (type === 'click' && clickHandler === fn) clickHandler = null },
}
const dicts = {}
const registrations = []
const injected = []
const contributions = []
const recorded = []
const fakeRpc = { recordClick: async (id) => { recorded.push(id); return { ok: true, value: recorded.length } } }
const ctx = {
  effect: (fn) => fn(),
  locale: {
    register: (ns, dict) => { dicts[ns] = dict },
    bind: (ns) => (key) => `${ns}.${key}`,
  },
  slots: {
    inject: (slot, get) => { injected.push(slot); get() },
    register: (entry, component) => {
      registrations.push({ entry, component })
      return entry
    },
    entriesOfSlot: () => [
      { options: { id: 'plugins', label: '插件' } },
      { options: { id: 'market', label: '市场' } },
      { options: { id: 'schedules', label: () => '日程' } },
    ],
  },
  remote: {
    $mount: async (contribution) => {
      contributions.push(contribution)
      return () => {}
    },
  },
  get: (name) => (name === 'remote.spcClicks' ? fakeRpc : undefined),
}
mod.apply(ctx)

// Dictionaries: both locales carry every key the components look up.
const KEYS = [
  'collapse', 'expand', 'tab', 'grid', 'columns', 'collapsedCount', 'collapsedRows', 'collapsedHint',
  'iconSize', 'sizeSm', 'sizeMid', 'sizeLg', 'sizeHint',
  'orderTitle', 'orderPick', 'orderHint', 'orderEmpty', 'orderUp', 'orderDown', 'orderRemove',
  'history', 'historyTitle', 'tabInstallRemove', 'tabEnableDisable', 'historyEmpty', 'historyUnavailable',
  'close', 'actionInstall', 'actionRemove', 'actionEnable', 'actionDisable',
  'usage',
]
assert.deepStrictEqual(Object.keys(dicts.sidebarPanelCollapse.zh).sort(), [...KEYS].sort(), 'zh keys')
assert.deepStrictEqual(Object.keys(dicts.sidebarPanelCollapse.en).sort(), [...KEYS].sort(), 'en keys')

// Both slots register exactly once, with the expected metadata.
assert.deepStrictEqual(
  injected.sort(),
  ['settings.plugins.tab', 'shell.overlay', 'sidebar.footer.action'],
  'slots injected',
)
const footer = registrations.find((r) => r.entry.name === 'sidebar.footer.action')
assert.deepStrictEqual(
  { id: footer.entry.id, order: footer.entry.order, locale: footer.entry.locale },
  { id: 'sidebar-panel-collapse', order: 5, locale: 'sidebarPanelCollapse' },
  'footer registration',
)
const tab = registrations.find((r) => r.entry.name === 'settings.plugins.tab')
assert.deepStrictEqual(
  { id: tab.entry.id, order: tab.entry.order, locale: tab.entry.locale },
  { id: 'sidebar-display', order: 100, locale: 'sidebarPanelCollapse' },
  'tab registration',
)
assert.strictEqual(typeof tab.entry.label, 'function', 'tab label is a function')
assert.ok(tab.entry.label().includes('tab'), 'tab label resolves through t()')

// The activity window is registered in the shell overlay.
const overlay = registrations.find((r) => r.entry.name === 'shell.overlay')
assert.deepStrictEqual(
  { id: overlay.entry.id, order: overlay.entry.order, locale: overlay.entry.locale },
  { id: 'plugin-activity-window', order: 60, locale: 'sidebarPanelCollapse' },
  'overlay registration',
)

// --- component renders ----------------------------------------------------
const t = (key) => `t:${key}`
const footerTree = footer.component({ t, wide: true })
assert.strictEqual(footerTree.props.className, 'dsh-spc-layer', 'footer wrapper')
const footerBtn = footerTree.children.find((c) => c.type === 'button')
assert.strictEqual(footerBtn.props['aria-label'], 't:expand', 'collapsed -> button offers "expand"')
assert.strictEqual(footerBtn.props['aria-expanded'], false, 'collapsed by default')

// The activity entry sits right of the toggle, as an icon.
const footerButtons = footerTree.children.filter((c) => c !== null && c !== undefined && c.type === 'button')
assert.strictEqual(footerButtons.length, 2, 'toggle plus activity icon')
const histBtn = footerButtons[1]
assert.strictEqual(histBtn.props.className, 'dsh-spc-histBtn', 'activity icon button')
assert.strictEqual(histBtn.props['aria-label'], 't:history', 'activity icon is labelled')

// The usage page lives in the dsh-plugin-insight bundle, so its button only
// shows up once that bundle's client half announces itself. Until then the
// footer keeps its two buttons — a dead button is worse than no button.
const footerSlots = []
let footerHook = 0
const renderFooter = () => { footerHook = 0; return footer.component({ t, wide: true }) }
const realFooterUseState = React.useState
React.useState = (init) => {
  const i = footerHook++
  if (footerSlots[i] === undefined) footerSlots[i] = typeof init === 'function' ? init() : init
  return [footerSlots[i], (v) => { footerSlots[i] = typeof v === 'function' ? v(footerSlots[i]) : v }]
}
effects.length = 0
renderFooter()
const footerEffects = effects.slice()
for (const effect of footerEffects) effect()
const beforeReady = renderFooter().children.filter((c) => c !== null && c !== undefined && c.type === 'button')
assert.strictEqual(beforeReady.length, 2, 'no usage button before the other bundle is up')

window.dispatchEvent(new CustomEvent('dsh-plugin-insight:ready'))
const afterReady = renderFooter().children.filter((c) => c !== null && c !== undefined && c.type === 'button')
assert.strictEqual(afterReady.length, 3, 'usage button appears once its bundle is up')
const usageBtn = afterReady[2]
assert.strictEqual(usageBtn.props.className, 'dsh-spc-histBtn', 'usage button sits next to the activity icon')
assert.strictEqual(usageBtn.props['aria-label'], 't:usage', 'usage button is labelled')
assert.strictEqual(usageBtn.children[0].children[0].type, 'svg', 'usage button is an icon, not text')
// Clicking it asks the other bundle to open its page — it does not open a
// popup itself.
usageBtn.props.onClick()
assert.ok(
  dispatchedEvents.includes('dsh-plugin-insight:open-usage'),
  'clicking asks the usage page to open',
)
React.useState = realFooterUseState

// The layer must claim a whole line of the shared footer row. Shrinking it to
// content slides a neighbouring footer action in beside the toggle, and a row
// wider than the layer pushes this icon out of view.
const footerCss = footerTree.children.find((c) => c.type === 'style').children[0]
const footerRule = (selector) => {
  const match = new RegExp(selector.replace(/[.[\]]/g, '\\$&') + '\\{([^}]*)\\}').exec(footerCss)
  assert.ok(match, 'style rule ' + selector)
  return match[1]
}
const layerRule = footerRule('.dsh-spc-layer')
assert.ok(layerRule.includes('flex:none'), 'the layer does not shrink')
assert.ok(layerRule.includes('width:100%'), 'the layer claims a full footer line')
assert.ok(
  !footerCss.includes('calc(100% + 4px)'),
  'no row overhangs the layer and pushes the icon out',
)
assert.ok(
  footerRule('.dsh-spc-row').includes('flex:1 1 auto'),
  'the toggle yields room to the icon',
)
assert.ok(
  footerRule('.dsh-spc-histBtn').includes('flex:none'),
  'the icon keeps its size next to the toggle',
)

// --- the activity window --------------------------------------------------
// Driven through its real open handler and remote call. The fake remote
// answers the way DSH's transport does — an `{ ok, value }` envelope — so
// this pins that the payload is unwrapped before the rows are rendered.
const historyCalls = []
const fakeHistory = {
  list: async () => {
    historyCalls.push('list')
    return {
      ok: true,
      value: {
        installRemove: [{ action: 'install', name: 'dsh-x', time: '2026-11-01T00:00:00.000Z' }],
        enableDisable: [],
      },
    }
  },
}
ctx.get = (name) => (name === 'remote.spcHistory' ? fakeHistory : name === 'remote.spcClicks' ? fakeRpc : undefined)
// The mount settles on a microtask; give it a tick before driving the window.
await new Promise((resolve) => setTimeout(resolve, 0))

// A state store that survives re-renders (hooks are indexed by call order,
// so the store is persistent and the counter resets each render).
const slots = []
let hookIndex = 0
const render = () => { hookIndex = 0; return overlay.component({}) }
const realUseState = React.useState
React.useState = (init) => {
  const i = hookIndex++
  if (slots[i] === undefined) slots[i] = typeof init === 'function' ? init() : init
  return [slots[i], (v) => { slots[i] = typeof v === 'function' ? v(slots[i]) : v }]
}
effects.length = 0
assert.strictEqual(render(), null, 'closed by default')
const firstEffects = effects.slice()
for (const effect of firstEffects) effect()
assert.strictEqual(openHandlers.length, 1, 'the window listens for the open event')

openHandlers[0]()
await new Promise((resolve) => setTimeout(resolve, 0))
const windowTree = render()
assert.deepStrictEqual(historyCalls, ['list'], 'the history is fetched on open')
assert.strictEqual(windowTree.props.className, 'dsh-spc-modalMask', 'activity window mask')
const modal = windowTree.children.find((c) => c.props && c.props.className === 'dsh-spc-modal')
assert.ok(modal, 'activity window dialog')
const tabs = modal.children.find((c) => c.props && c.props.className === 'dsh-spc-tabs')
assert.strictEqual(tabs.children.length, 2, 'two tabs')
assert.ok(tabs.children[0].children[0].includes('tabInstallRemove'), 'first tab is install/remove')
assert.ok(tabs.children[1].children[0].includes('tabEnableDisable'), 'second tab is enable/disable')
const body = modal.children.find((c) => c.props && c.props.className === 'dsh-spc-modalBody')
const row = body.children[0]
assert.strictEqual(row.props.className, 'dsh-spc-histRow', 'one row per record')
assert.ok(row.children.some((c) => c.children && c.children[0] === 'dsh-x'), 'the plugin name is shown')
// The action is an icon, not text: the badge carries an svg and an aria-label.
const badge = row.children.find((c) => c.props && String(c.props.className).includes('dsh-spc-histBadge'))
assert.ok(badge, 'the action badge is present')
assert.ok(badge.props['aria-label'].includes('actionInstall'), 'the badge is labelled for screen readers')
assert.strictEqual(badge.children[0].type, 'svg', 'the badge is an icon, not text')
// The stub nests the path array one level deep.
assert.strictEqual(badge.children[0].children[0].length, 3, 'the install icon has three strokes')
// A real timestamp is shown (the fake remote returns one).
const time = row.children.find((c) => c.props && c.props.className === 'dsh-spc-histTime')
assert.ok(time.children[0].includes('2026-11-01'), 'the row shows a time')
React.useState = realUseState

// The four action icons are drawn, not spelled out, and the name and the time
// are large enough to read.
const histStyle = modal.children.find((c) => c.type === 'style')
assert.ok(histStyle, 'the activity window mounts its stylesheet')
const histCss = histStyle.children[0]
assert.ok(typeof histCss === 'string', 'the stylesheet is text')
assert.ok(histCss.includes('.dsh-spc-histName'), 'the stylesheet has the row rules')
const histRule = (selector) => {
  const match = new RegExp(selector.replace(/[.[\]]/g, '\\$&') + '\\{([^}]*)\\}').exec(histCss)
  assert.ok(match, 'style rule ' + selector)
  return match[1]
}
assert.ok(histRule('.dsh-spc-histName').includes('font-size:14px'), 'the plugin name is large')
assert.ok(histRule('.dsh-spc-histTime').includes('font-size:13px'), 'the time is large')
// Install and enable are green; remove and disable are red.
const badgeColour = (action) => {
  // The class is `dsh-spc-a` plus the capitalised action.
  const rule = histRule('.dsh-spc-histBadge.dsh-spc-a' + action.charAt(0).toUpperCase() + action.slice(1))
  return /error-primary/.test(rule) ? 'red' : /success-primary/.test(rule) ? 'green' : 'other'
}
assert.strictEqual(badgeColour('install'), 'green', 'install is green')
assert.strictEqual(badgeColour('enable'), 'green', 'enable is green')
assert.strictEqual(badgeColour('remove'), 'red', 'remove is red')
assert.strictEqual(badgeColour('disable'), 'red', 'disable is red')

// Flatten a rendered tree into a node list (the react stub returns plain
// {type, props, children} nodes).
function flatten(node, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out
  if (Array.isArray(node)) { for (const c of node) flatten(c, out); return out }
  if (node.type === undefined) return out
  out.push(node)
  for (const c of node.children || []) flatten(c, out)
  return out
}

const renderTab = () => flatten(tab.component())
const prefsKey = 'dsh.sidebar-panel-collapse.display'
// Safe class access: the react stub may hand back props=null (e.g. style).
const hasCls = (n, token) =>
  Boolean(n.props && typeof n.props.className === 'string') &&
  n.props.className.split(' ').includes(token)

// Buttons of the picker row whose caption ends with the given locale key
// (the settings tab uses ctx-bound t(), e.g. "sidebarPanelCollapse.columns").
const pickButtons = (nodes, key) => {
  const row = nodes.find(
    (n) => hasCls(n, 'dsh-spc-setRow') &&
      n.children.some(
        (c) => c && c.type === 'span' && String(c.children[0]).endsWith('.' + key),
      ),
  )
  if (row === undefined) return null
  // The stub nests array children one level deep; flatten to plain buttons.
  return flatten(row).filter((n) => hasCls(n, 'dsh-spc-col'))
}

// Defaults: grid off, list-mode collapsed-count picker (0-5, nothing shown).
let nodes = renderTab()
assert.strictEqual(nodes.find((n) => n.type === 'input').props.checked, false, 'grid off by default')
const countBtns = pickButtons(nodes, 'collapsedCount')
assert.deepStrictEqual(countBtns.map((n) => n.children[0]), ['0', '1', '2', '3', '4', '5'], 'collapsed-count options 0-5')
assert.deepStrictEqual(
  countBtns.map((n) => n.props['aria-pressed']),
  [true, false, false, false, false, false],
  'collapsedCount=0 pressed',
)
assert.strictEqual(pickButtons(nodes, 'columns'), null, 'no column picker in list mode')
assert.strictEqual(pickButtons(nodes, 'collapsedRows'), null, 'no row picker in list mode')

// Enabling grid through the checkbox's onChange writes prefs and re-renders:
// column picker (2/3/4, current 3) plus the collapsed-row picker (0-3).
const checkbox = nodes.find((n) => n.type === 'input')
checkbox.props.onChange({ target: { checked: true } })
assert.deepStrictEqual(
  JSON.parse(store.get(prefsKey)),
  { grid: true, columns: 3, collapsedCount: 0, collapsedRows: 0, order: [], iconSize: 'md' },
  'writePrefs',
)
nodes = renderTab()
assert.strictEqual(nodes.find((n) => n.type === 'input').props.checked, true, 'grid on after write')
const cols = pickButtons(nodes, 'columns')
assert.deepStrictEqual(cols.map((n) => n.children[0]), ['2', '3', '4'], 'column options 2-4')
assert.deepStrictEqual(cols.map((n) => n.props['aria-pressed']), [false, true, false], 'columns=3 pressed')
const rowPick = pickButtons(nodes, 'collapsedRows')
assert.deepStrictEqual(rowPick.map((n) => n.children[0]), ['0', '1', '2', '3'], 'collapsed-row options 0-3')
assert.deepStrictEqual(rowPick.map((n) => n.props['aria-pressed']), [true, false, false, false], 'collapsedRows=0 pressed')

// Picking values persist; out-of-range values fall back to the defaults.
cols.find((n) => n.children[0] === '4').props.onClick()
assert.deepStrictEqual(
  JSON.parse(store.get(prefsKey)),
  { grid: true, columns: 4, collapsedCount: 0, collapsedRows: 0, order: [], iconSize: 'md' },
  'columns=4 persisted',
)
pickButtons(renderTab(), 'collapsedRows').find((n) => n.children[0] === '2').props.onClick()
assert.deepStrictEqual(
  JSON.parse(store.get(prefsKey)),
  { grid: true, columns: 4, collapsedCount: 0, collapsedRows: 2, order: [], iconSize: 'md' },
  'collapsedRows=2 persisted',
)
store.set(prefsKey, '{"grid":true,"columns":9,"collapsedRows":9}')
nodes = renderTab()
assert.strictEqual(
  pickButtons(nodes, 'columns').find((n) => hasCls(n, 'dsh-spc-colOn')).children[0],
  '3',
  'out-of-range columns -> default',
)
assert.strictEqual(
  pickButtons(nodes, 'collapsedRows').find((n) => hasCls(n, 'dsh-spc-colOn')).children[0],
  '0',
  'out-of-range collapsedRows -> default',
)

// Corrupt JSON falls back to safe defaults instead of throwing.
store.set(prefsKey, 'not json')
nodes = renderTab()
assert.strictEqual(nodes.find((n) => n.type === 'input').props.checked, false, 'corrupt -> grid off')
assert.strictEqual(pickButtons(nodes, 'columns'), null, 'corrupt -> no column picker')
assert.strictEqual(
  pickButtons(nodes, 'collapsedCount').find((n) => hasCls(n, 'dsh-spc-colOn')).children[0],
  '0',
  'corrupt -> collapsedCount default',
)

// --- icon size ------------------------------------------------------------
// Three choices with localized captions; medium (the sidebar's own size) is
// the default, unknown stored values fall back to it.
nodes = renderTab()
const sizeBtns = pickButtons(nodes, 'iconSize')
assert.deepStrictEqual(
  sizeBtns.map((n) => n.children[0]),
  ['sidebarPanelCollapse.sizeSm', 'sidebarPanelCollapse.sizeMid', 'sidebarPanelCollapse.sizeLg'],
  'icon-size options labelled through t()',
)
assert.deepStrictEqual(
  sizeBtns.map((n) => n.props['aria-pressed']),
  [false, true, false],
  'medium pressed by default',
)
sizeBtns[2].props.onClick()
assert.strictEqual(JSON.parse(store.get(prefsKey)).iconSize, 'lg', 'iconSize=lg persisted')
store.set(prefsKey, '{"iconSize":"xl"}')
nodes = renderTab()
assert.strictEqual(
  pickButtons(nodes, 'iconSize').find((n) => hasCls(n, 'dsh-spc-colOn')).children[0],
  'sidebarPanelCollapse.sizeMid',
  'unknown iconSize -> medium',
)

// --- plugin display order -------------------------------------------------
// The order section: a dropdown of all slot panels plus the ordered list.
const orderRowNodes = (nodes) =>
  nodes.filter(
    (n) => hasCls(n, 'dsh-spc-setRow') &&
      n.children.some((c) => c && c.type === 'span' && /^\d+\. /.test(String(c.children[0]))),
  )
const captionHas = (nodes, key) =>
  nodes.some(
    (n) => hasCls(n, 'dsh-spc-setRow') &&
      n.children.some((c) => c && c.type === 'span' && String(c.children[0]).endsWith('.' + key)),
  )

nodes = renderTab()
// The picker is drawn by the page, not by the browser: a native <select>
// popup cannot follow the theme (unreadable rows in dark mode) and its
// invisible popup swallowed the click and the wheel, which left the settings
// page looking frozen. So the dropdown is a button + a list of buttons.
const dropBtn = nodes.find((n) => hasCls(n, 'dsh-spc-dropBtn'))
assert.ok(dropBtn, 'order dropdown rendered')
assert.strictEqual(dropBtn.props.disabled, false, 'dropdown enabled under the cap')
assert.strictEqual(dropBtn.props['aria-expanded'], false, 'dropdown starts closed')
assert.strictEqual(nodes.find((n) => n.type === 'select'), undefined, 'no native select left')
const dropItems = (list) => list.filter((n) => hasCls(n, 'dsh-spc-dropItemBtn'))
assert.deepStrictEqual(
  dropItems(nodes).map((n) => n.children[0]),
  ['插件', '市场', '日程'],
  'dropdown lists every panel',
)
assert.ok(captionHas(nodes, 'orderEmpty'), 'empty order shows the default-order hint')

// Adding: the picked panel is appended; picking it again is deduped on save.
const pickPanel = (list, label) => {
  const item = dropItems(list).find((n) => n.children[0] === label)
  assert.ok(item, 'dropdown item "' + label + '"')
  item.props.onClick()
}
pickPanel(nodes, '市场')
assert.deepStrictEqual(JSON.parse(store.get(prefsKey)).order, ['market'], 'first add stored')
nodes = renderTab()
pickPanel(nodes, '市场')
assert.deepStrictEqual(JSON.parse(store.get(prefsKey)).order, ['market'], 'duplicate add dropped on save')
nodes = renderTab()
pickPanel(nodes, '插件')
assert.deepStrictEqual(JSON.parse(store.get(prefsKey)).order, ['market', 'plugins'], 'second add stored')

// Ordered rows render in list order with up/down/remove controls.
nodes = renderTab()
let rows = orderRowNodes(nodes)
assert.deepStrictEqual(rows.map((r) => r.children.find((c) => c.type === 'span').children[0]), ['1. 市场', '2. 插件'], 'rows in list order')
const rowBtns = (row) => flatten(row).filter((n) => hasCls(n, 'dsh-spc-col'))
assert.deepStrictEqual(rows.map((r) => rowBtns(r).map((b) => b.props['aria-label'])), [
  ['sidebarPanelCollapse.orderUp', 'sidebarPanelCollapse.orderDown', 'sidebarPanelCollapse.orderRemove'],
  ['sidebarPanelCollapse.orderUp', 'sidebarPanelCollapse.orderDown', 'sidebarPanelCollapse.orderRemove'],
], 'row controls present')
assert.strictEqual(rowBtns(rows[0])[0].props.disabled, true, 'first row cannot move up')
assert.strictEqual(rowBtns(rows[1])[1].props.disabled, true, 'last row cannot move down')
rowBtns(rows[1])[0].props.onClick() // move "插件" up
assert.deepStrictEqual(JSON.parse(store.get(prefsKey)).order, ['plugins', 'market'], 'move up stored')
nodes = renderTab()
rowBtns(orderRowNodes(nodes)[0])[2].props.onClick() // remove "插件"
assert.deepStrictEqual(JSON.parse(store.get(prefsKey)).order, ['market'], 'remove stored')

// Cap: 20 entries disables the dropdown; duplicates still do not grow it.
store.set(prefsKey, JSON.stringify({
  grid: false, columns: 3, collapsedCount: 0, collapsedRows: 0,
  order: [...Array.from({ length: 19 }, (_, i) => `p${i}`), 'market', 'market'],
}))
nodes = renderTab()
assert.strictEqual(orderRowNodes(nodes).length, 20, 'stored list sanitizes to 20 unique entries')
assert.strictEqual(nodes.find((n) => hasCls(n, 'dsh-spc-dropBtn')).props.disabled, true, 'dropdown disabled at the cap')

// Corrupt / wrongly-typed order values fall back to the empty list.
store.set(prefsKey, '{"grid":false,"columns":3,"collapsedCount":0,"collapsedRows":0,"order":"plugins"}')
nodes = renderTab()
assert.strictEqual(orderRowNodes(nodes).length, 0, 'non-array order -> default')
assert.ok(captionHas(nodes, 'orderEmpty'), 'non-array order -> default hint')

// --- applying the order to the live list (DOM behaviour) -----------------
// FooterToggle's effect drives applyNav → applyOrder: listed panels take a
// CSS `order` value inside the flex nav, and the collapsed limit keeps the
// first entries *visually*, not in DOM order.
const mkStyle = () => ({
  display: '', order: '',
  setProperty(key, value) { if (key === 'order') this.order = value },
  removeProperty(key) { if (key === 'order') this.order = '' },
})
const mkClassList = () => {
  const set = new Set()
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
    toggle: (c, on) => { if (on) set.add(c); else set.delete(c) },
  }
}
const makeNav = (labels) => {
  const detach = (el) => {
    const list = el.parentElement && Array.isArray(el.parentElement.children) ? el.parentElement.children : null
    if (list === null) return
    const at = list.indexOf(el)
    if (at >= 0) list.splice(at, 1)
  }
  const insert = (parent, el, ref) => {
    detach(el)
    const at = ref === null || ref === undefined ? -1 : parent.children.indexOf(ref)
    if (at >= 0) parent.children.splice(at, 0, el)
    else parent.children.push(el)
    el.parentElement = parent
  }
  const root = { children: [], insertBefore: (el, ref) => insert(root, el, ref) }
  const nav = {
    style: mkStyle(), classList: mkClassList(), children: [], parentElement: root,
    get firstChild() { return nav.children.length > 0 ? nav.children[0] : null },
    insertBefore: (el, ref) => insert(nav, el, ref),
    querySelectorAll: (sel) => {
      if (sel.startsWith('[') && sel.includes('data-spc-adopted')) {
        return nav.children.filter((c) => c.hasAttribute('data-spc-adopted'))
      }
      if (sel.includes('[data-spc-tip]')) return []
      return nav.children // 'button,[role=button],[data-spc-adopted]' and friends
    },
  }
  nav.children = labels.map((label) => {
    const row = {
      style: mkStyle(), hidden: false, parentElement: nav,
      getAttribute: (name) => (name === 'aria-label' ? label : null),
      setAttribute: (name) => { if (name === 'data-spc-hidden') row.hidden = true },
      removeAttribute: (name) => { if (name === 'data-spc-hidden') row.hidden = false },
      hasAttribute: () => false,
      matches: () => true,
      querySelector: () => null,
    }
    return row
  })
  return nav
}
// A convention follower: a sidebar-root child with a `data-dsh-*-entry` attr
// (今日值得读 / 全局搜索 / 容器 …), with attribute-name reflection for domEntryId.
const mkEntry = (attr, label) => {
  const flags = new Map([[attr, '']])
  const refresh = () => { entry.attributes = [...flags.keys()].map((name) => ({ name })) }
  const entry = {
    style: mkStyle(), parentElement: null, hidden: false, attributes: [{ name: attr }],
    get nextElementSibling() {
      const siblings = entry.parentElement === null ? [] : entry.parentElement.children
      const at = siblings.indexOf(entry)
      return at >= 0 && at + 1 < siblings.length ? siblings[at + 1] : null
    },
    getAttribute: (name) => (name === 'aria-label' ? label : flags.has(name) ? flags.get(name) : null),
    setAttribute: (name, value) => {
      if (name === 'data-spc-hidden') { entry.hidden = true; return }
      flags.set(name, value === undefined ? '' : value)
      refresh()
    },
    removeAttribute: (name) => {
      if (name === 'data-spc-hidden') { entry.hidden = false; return }
      flags.delete(name)
      refresh()
    },
    hasAttribute: (name) => (name === 'data-spc-hidden' ? entry.hidden : flags.has(name)),
    matches: () => false,
    querySelector: () => null,
  }
  return entry
}
const runFooterEffect = (nav, storedOrder, collapsedCount, iconSize, grid = false) => {
  store.set('dsh.sidebar-panel-collapse', 'expanded') // start expanded so one click collapses
  store.set(prefsKey, JSON.stringify({
    grid, columns: 3, collapsedCount, collapsedRows: 0, order: storedOrder,
    iconSize: iconSize ?? 'md',
  }))
  effects.length = 0 // only what this render captures
  const tree = footer.component({ t, wide: true })
  const root = { parentElement: null, querySelector: (sel) => (sel === ':scope > nav' ? nav : null) }
  tree.props.ref.current = root
  for (const effect of effects) {
    const cleanup = effect()
    if (typeof cleanup === 'function') cleanup()
  }
  tree.children.find((c) => c.type === 'button').props.onClick()
}
const domNav = makeNav(['插件', '市场', '日程', '容器'])
runFooterEffect(domNav, ['market', 'plugins'], 2)
assert.deepStrictEqual(
  domNav.children.map((row) => row.style.order),
  ['2', '1', '3', '3'],
  'CSS order: listed panels sorted, the rest after them',
)
assert.deepStrictEqual(
  domNav.children.map((row) => row.hidden),
  [false, false, true, true],
  'collapsed limit keeps the first two rows *visually*',
)
// Empty order list clears the overrides and falls back to DOM order.
const domNav2 = makeNav(['插件', '市场', '日程', '容器'])
runFooterEffect(domNav2, [], 2)
assert.deepStrictEqual(domNav2.children.map((row) => row.style.order), ['', '', '', ''], 'empty order clears overrides')
assert.deepStrictEqual(
  domNav2.children.map((row) => row.hidden),
  [false, false, true, true],
  'without a custom order the limit uses DOM order',
)

// The icon-size choice marks the nav (default md leaves it unmarked).
const domNav3 = makeNav(['插件', '市场'])
runFooterEffect(domNav3, [], 2, 'lg')
assert.ok(domNav3.classList.contains('dsh-spc-size-lg'), 'large -> lg marker class')
assert.ok(!domNav3.classList.contains('dsh-spc-size-sm'), 'large -> no sm class')
runFooterEffect(domNav3, [], 2, 'sm')
assert.ok(domNav3.classList.contains('dsh-spc-size-sm'), 'small -> sm marker class')
assert.ok(!domNav3.classList.contains('dsh-spc-size-lg'), 'small -> no lg class')
runFooterEffect(domNav3, [], 2, 'md')
assert.ok(
  !domNav3.classList.contains('dsh-spc-size-sm') && !domNav3.classList.contains('dsh-spc-size-lg'),
  'medium -> both markers removed (sidebar default size)',
)

// --- convention entries (今日值得读 / 全局搜索 / 容器 …) ------------------
// These insert beside the nav instead of through sidebar.panellist, so they
// only reach the dropdown (and the order) through the data-dsh-*-entry
// convention. A custom order adopts the listed ones into the nav — where CSS
// order can reach them — and dropping the order puts them back.
const domNav4 = makeNav(['插件', '市场'])
const fakeRoot = domNav4.parentElement
const rssEntry = mkEntry('data-dsh-rss-entry', '今日值得读')
fakeRoot.children.push(rssEntry)
rssEntry.parentElement = fakeRoot

runFooterEffect(domNav4, ['rss', 'plugins'], 2)
assert.strictEqual(domNav4.children[0], rssEntry, 'listed DOM entry adopted into the nav')
assert.deepStrictEqual(
  domNav4.children.map((row) => row.style.order),
  ['1', '2', '3'],
  'data-attr identity orders the adopted entry first',
)
assert.deepStrictEqual(
  domNav4.children.map((row) => row.hidden),
  [false, false, true],
  'collapsed limit sees the adopted row in visual order',
)
nodes = renderTab()
assert.deepStrictEqual(
  dropItems(nodes).map((n) => n.children[0]),
  ['插件', '市场', '日程', '今日值得读'],
  'dropdown includes the DOM-inserted entry',
)
// The dropdown is drawn by the page, so the theme reaches the list itself —
// a native <select> popup is painted by the browser and stays unreadable.
const setCss = nodes.find((n) => n.type === 'style').children[0]
const cssRule = (selector) => {
  const match = new RegExp(selector.replace(/[.[\]]/g, '\\$&') + '\\{([^}]*)\\}').exec(setCss)
  assert.ok(match, 'style rule ' + selector)
  return match[1]
}
const btnRule = cssRule('.dsh-spc-dropBtn')
assert.ok(
  btnRule.includes('background:var(--dsw-alias-bg-layer-3)') &&
    btnRule.includes('color:var(--dsw-alias-label-primary)'),
  'the trigger paints the theme surface and text colour',
)
assert.ok(
  cssRule('.dsh-spc-dropList').includes('background:var(--dsw-alias-bg-layer-3)'),
  'the list paints the theme surface',
)
assert.ok(
  cssRule('.dsh-spc-dropItemBtn').includes('color:var(--dsw-alias-label-primary)'),
  'the items carry the theme text colour',
)
assert.ok(
  !/\.dsh-spc-select/.test(setCss),
  'no native-select styling left',
)
runFooterEffect(domNav4, [], 2, 'md', true) // grid mode adopts everything
assert.ok(domNav4.children.includes(rssEntry), 'grid adopts unlisted entries too')
runFooterEffect(domNav4, [], 2) // back to a plain list with no custom order
assert.ok(!domNav4.children.includes(rssEntry), 'empty order releases the entry')
assert.ok(fakeRoot.children.includes(rssEntry), 'released back to the sidebar root')

// --- click counting -------------------------------------------------------
// The remote contribution mounts (async) and panel clicks get reported.
await new Promise((resolve) => setTimeout(resolve, 0))
assert.strictEqual(contributions.length, 1, 'exactly one contribution mounted')
const contribution = contributions[0]
assert.strictEqual(contribution.package, 'dsh-toomuch-plugins', 'contribution package')
assert.strictEqual(contribution.face, 'host', 'contribution face')
const [descriptor] = contribution.descriptors
assert.strictEqual(descriptor.service, 'spcClicks', 'descriptor service')
assert.strictEqual(descriptor.namespace, 'spcClicks', 'descriptor namespace')
assert.strictEqual(descriptor.method, 'recordClick', 'descriptor method')
assert.deepStrictEqual(descriptor.invocation, { kind: 'direct' }, 'descriptor invocation')
assert.strictEqual(descriptor.parameters[0].source, 'json', 'parameter source')
assert.strictEqual(descriptor.parameters[0].codec.mode, 'strict', 'parameter strict codec')
assert.strictEqual(descriptor.result.mode, 'strict', 'result strict codec')
const historyDescriptor = contribution.descriptors[1]
assert.strictEqual(historyDescriptor.service, 'spcHistory', 'history descriptor service')
assert.strictEqual(historyDescriptor.namespace, 'spcHistory', 'history descriptor namespace')
assert.strictEqual(historyDescriptor.method, 'list', 'history descriptor method')
assert.deepStrictEqual(historyDescriptor.parameters, [], 'history descriptor takes no parameters')
assert.strictEqual(historyDescriptor.result.mode, 'strict', 'history result strict codec')
assert.ok(clickHandler, 'document click listener registered')

// A sidebar panel row (nav button, aria-label == panel label) is reported.
clickHandler({
  target: {
    closest: (sel) =>
      sel.startsWith('[')
        ? null
        : { closest: (s) => (s === 'nav' ? {} : null), getAttribute: (n) => (n === 'aria-label' ? '插件' : null) },
  },
})
await Promise.resolve()
assert.deepStrictEqual(recorded, ['plugins'], 'panel click reported by label -> id')

// Convention entries: the id comes from a data-dsh-*-entry attribute found by
// walking up from the click target (icons / inputs sit below the entry), and
// only counts when the entry is part of the sidebar (the last applied root).
const dockerEntry = mkEntry('data-dsh-docker-entry', '容器')
fakeRoot.children.push(dockerEntry)
dockerEntry.parentElement = fakeRoot
clickHandler({ target: { parentElement: { attributes: [{ name: 'data-dsh-docker-entry' }] } } })
await Promise.resolve()
assert.deepStrictEqual(recorded, ['plugins', 'docker'], 'click inside an entry reports its id')
clickHandler({ target: { attributes: [{ name: 'data-dsh-rss-entry' }] } })
await Promise.resolve()
assert.deepStrictEqual(recorded, ['plugins', 'docker', 'rss'], 'entry itself reports its id')

// Anything else (no entry ancestor, no panel label, not in the sidebar) is ignored.
clickHandler({ target: { parentElement: null } })
await Promise.resolve()
clickHandler({
  target: { parentElement: { attributes: [{ name: 'data-dsh-outside-entry' }], parentElement: null } },
})
await Promise.resolve()
assert.strictEqual(recorded.length, 3, 'non-panel / out-of-scope clicks ignored')

// --- host half ------------------------------------------------------------
// The Typert service counts clicks into <DSH_HOME>/plugins/.../click-counts.json.
const fs = await import('node:fs')
const os = await import('node:os')
const path = await import('node:path')
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spc-smoke-'))
process.env.DSH_HOME = tmpHome
const host = await import('../src/index.js')
const provided = {}
host.apply({ provide: (name, value) => { provided[name] = value }, on: () => {}, get: () => undefined })
const svc = provided.spcClicks
assert.ok(svc, 'host provides spcClicks')
assert.deepStrictEqual(
  { service: svc.typertRemote.service === svc, serviceKey: svc.typertRemote.serviceKey, namespace: svc.typertRemote.namespace },
  { service: true, serviceKey: 'spcClicks', namespace: 'spcClicks' },
  'typertRemote binding',
)
const marker = Object.getPrototypeOf(svc)['@deepseek-ai/dsh-typert-protocol/remote-methods']
assert.strictEqual(marker.version, 1, 'remote-method marker version')
assert.deepStrictEqual(marker.methods.map((m) => ({ method: m.method, invocation: m.invocation })), [
  { method: 'recordClick', invocation: { kind: 'direct' } },
], 'remote-method marker methods')
assert.strictEqual(typeof svc.recordClick, 'function', 'recordClick exposed')
assert.strictEqual(await svc.recordClick('plugins'), 1, 'first click counts')
assert.strictEqual(await svc.recordClick('plugins'), 2, 'second click accumulates')
assert.strictEqual(await svc.recordClick(''), 0, 'empty id rejected')
assert.strictEqual(await svc.recordClick(42), 0, 'non-string id rejected')
const countsFile = path.join(tmpHome, 'plugins', 'dsh-toomuch-plugins', 'click-counts.json')
assert.deepStrictEqual(JSON.parse(fs.readFileSync(countsFile, 'utf8')), { plugins: 2 }, 'counts persisted')
// A corrupt file is replaced, not fatal.
fs.writeFileSync(countsFile, 'not json')
assert.strictEqual(await svc.recordClick('market'), 1, 'recovers after corrupt file')
assert.deepStrictEqual(JSON.parse(fs.readFileSync(countsFile, 'utf8')), { market: 1 }, 'rewritten after corrupt file')

// --- host half: the plugin activity log -----------------------------------
// Nothing is recorded by listening for change events: a plugin can be added or
// removed from the settings panel, from the plugin market or from the CLI, and
// only some of those paths announce it. The profile manifest is the one thing
// they all update, so the log is reconciled against it.
const { createRecorder, historyFile: historyPath, SYNC_INTERVAL_MS } = await import('../src/history.js')
const profileDir = path.join(tmpHome, 'profile')
fs.mkdirSync(profileDir, { recursive: true })
const manifest = (deps, bundles = []) =>
  fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({ dependencies: deps, dsh: { profile: { bundles } } }))
manifest({ 'dsh-old': '1.0.0' })
const disposers = []
const hostCtx = {
  provide: (name, value) => { provided[name] = value },
  effect: (callback) => { const dispose = callback(); disposers.push(dispose); return dispose },
  get: (name) => (name === 'profileContext' ? { dir: profileDir } : undefined),
}
host.apply(hostCtx)
const historySvc = provided.spcHistory
assert.ok(historySvc, 'host provides spcHistory')
assert.deepStrictEqual(
  { service: historySvc.typertRemote.service === historySvc, serviceKey: historySvc.typertRemote.serviceKey },
  { service: true, serviceKey: 'spcHistory' },
  'history typertRemote binding',
)
const historyMarker = Object.getPrototypeOf(historySvc)['@deepseek-ai/dsh-typert-protocol/remote-methods']
assert.deepStrictEqual(historyMarker.methods.map((m) => m.method), ['list'], 'history remote method')
assert.strictEqual(disposers.length, 1, 'the host half polls the profile')
assert.ok(SYNC_INTERVAL_MS > 0, 'the poll interval is a real interval')
// The tests drive the comparison themselves; a live timer would race them.
for (const dispose of disposers) if (typeof dispose === 'function') dispose()

const UPGRADE_WINDOW = 60_000
let nowMs = Date.parse('2026-11-01T00:00:00.000Z')
const recorder = createRecorder(hostCtx, { removeGraceMs: UPGRADE_WINDOW, now: () => nowMs })
// Change the profile the way any writer does, then move the clock on.
const profile = (deps, bundles = []) => {
  manifest(deps, bundles)
  nowMs += 1000
}
const actions = (log, name) => log.installRemove.filter((e) => e.name === name).map((e) => e.action)
const onDisk = () => JSON.parse(fs.readFileSync(historyPath(), 'utf8'))

// The first comparison adopts the profile: its packages predate the log.
let log = recorder.list()
assert.deepStrictEqual(log.installRemove, [], 'the first comparison records nothing')

// An install, whoever performed it.
profile({ 'dsh-old': '1.0.0', 'dsh-new': '2.0.0' })
log = recorder.list()
assert.deepStrictEqual(actions(log, 'dsh-new'), ['install'], 'an install is recorded')

// A removal.
profile({ 'dsh-old': '1.0.0' })
log = recorder.list()
assert.deepStrictEqual(actions(log, 'dsh-new'), ['remove', 'install'], 'a removal is recorded, newest first')

// It is on disk as soon as it is noticed, and a restarted host still has it.
assert.ok(
  onDisk().events.some((e) => e.action === 'remove' && e.name === 'dsh-new'),
  'the removal is written at once',
)
const afterRestart = createRecorder(hostCtx, { removeGraceMs: UPGRADE_WINDOW, now: () => nowMs })
assert.deepStrictEqual(actions(afterRestart.list(), 'dsh-new'), ['remove', 'install'], 'a restarted host keeps it')

// An upgrade: the package disappears and comes back with another version.
profile({ 'dsh-old': '1.0.0', 'dsh-up': '1.0.0' })
recorder.list()
profile({ 'dsh-old': '1.0.0' })
recorder.list()
profile({ 'dsh-old': '1.0.0', 'dsh-up': '2.0.0' })
log = recorder.list()
assert.deepStrictEqual(actions(log, 'dsh-up'), ['install'], 'the upgrade leaves no record, the first install stays')

// A reinstall of the same version is a real removal and a real install.
profile({ 'dsh-old': '1.0.0', 'dsh-again': '1.0.0' })
recorder.list()
profile({ 'dsh-old': '1.0.0' })
recorder.list()
profile({ 'dsh-old': '1.0.0', 'dsh-again': '1.0.0' })
log = recorder.list()
assert.deepStrictEqual(actions(log, 'dsh-again'), ['install', 'remove', 'install'], 'a reinstall keeps both records')

// A bundle switched off and back on.
profile({ 'dsh-old': '1.0.0', 'dsh-again': '1.0.0', 'dsh-b': '1.0.0' }, ['dsh-again', 'dsh-b'])
recorder.list()
profile({ 'dsh-old': '1.0.0', 'dsh-again': '1.0.0', 'dsh-b': '1.0.0' }, ['dsh-again'])
log = recorder.list()
assert.ok(log.enableDisable.some((e) => e.name === 'dsh-b' && e.action === 'disable'), 'a switch off is recorded')
profile({ 'dsh-old': '1.0.0', 'dsh-again': '1.0.0', 'dsh-b': '1.0.0' }, ['dsh-again', 'dsh-b'])
log = recorder.list()
assert.ok(log.enableDisable.some((e) => e.name === 'dsh-b' && e.action === 'enable'), 'a switch on is recorded')

// Switches older than a month are hidden; installs are all kept.
const storedDoc = onDisk()
storedDoc.events.push({ action: 'enable', name: 'dsh-stale', version: null, time: '2026-01-01T00:00:00.000Z' })
fs.writeFileSync(historyPath(), JSON.stringify(storedDoc))
log = recorder.list()
assert.ok(!log.enableDisable.some((e) => e.name === 'dsh-stale'), 'old switches are hidden')
assert.ok(log.installRemove.length > 0, 'installs are all kept')

// Newest first, by time.
const times = log.installRemove.map((e) => e.time)
assert.deepStrictEqual(times, [...times].sort((a, b) => Date.parse(b) - Date.parse(a)), 'installs are newest first')

// The log is a plain file that also remembers the state it recorded.
assert.strictEqual(onDisk().version, 2, 'history file version')
assert.ok(onDisk().known !== null && typeof onDisk().known.packages === 'object', 'the file remembers the profile')

// --- first run: nothing is listed ------------------------------------------
// The plugins a profile already had were installed before this log existed,
// so they are not news. The first comparison adopts them silently.
const baselineHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spc-baseline-'))
const previousHome = process.env.DSH_HOME
process.env.DSH_HOME = baselineHome
manifest({ 'dsh-old': '1.0.0', 'dsh-scan': '3.0.0' }, ['dsh-scan'])
const fresh = createRecorder(hostCtx, { removeGraceMs: UPGRADE_WINDOW })
const freshLog = fresh.list()
assert.deepStrictEqual(freshLog.installRemove, [], 'the first run lists no plugins')
assert.deepStrictEqual(freshLog.enableDisable, [], 'the first run lists no switches')
assert.ok(
  JSON.parse(fs.readFileSync(historyPath(), 'utf8')).known !== null,
  'the first run adopts the profile as the baseline',
)
// A plugin installed after that is a real operation.
manifest({ 'dsh-old': '1.0.0', 'dsh-scan': '3.0.0', 'dsh-later': '1.0.0' }, ['dsh-scan'])
assert.ok(
  createRecorder(hostCtx, { removeGraceMs: UPGRADE_WINDOW }).list().installRemove.some((e) => e.name === 'dsh-later'),
  'a plugin installed later is recorded',
)
// A log written before the known snapshot is adopted the same way: it adds
// no records of its own.
process.env.DSH_HOME = previousHome
const legacyHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spc-legacy-'))
process.env.DSH_HOME = legacyHome
fs.mkdirSync(path.join(legacyHome, 'plugins', 'dsh-toomuch-plugins'), { recursive: true })
fs.writeFileSync(
  historyPath(),
  JSON.stringify({
    version: 1,
    events: [
      { action: 'install', name: 'dsh-old', version: '1.0.0', time: '2026-01-01T00:00:00.000Z', baseline: true },
      { action: 'remove', name: 'dsh-gone', version: '1.0.0', time: '2026-01-02T00:00:00.000Z' },
    ],
  }),
)
const legacy = createRecorder(hostCtx, { removeGraceMs: UPGRADE_WINDOW })
const legacyLog = legacy.list()
assert.ok(
  !legacyLog.installRemove.some((e) => e.name === 'dsh-old'),
  'the initial listing is not shown',
)
assert.ok(
  legacyLog.installRemove.some((e) => e.name === 'dsh-gone' && e.action === 'remove'),
  'a real operation in an old log is kept',
)
process.env.DSH_HOME = previousHome
fs.rmSync(baselineHome, { recursive: true, force: true })
fs.rmSync(legacyHome, { recursive: true, force: true })

fs.rmSync(tmpHome, { recursive: true, force: true })
delete process.env.DSH_HOME

console.log('smoke: all assertions passed')

