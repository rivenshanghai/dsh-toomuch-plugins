// Minimal wiring check for src/client.js — run with: node test/smoke.js
// Zero deps: stubs window.__ModuleLoader__ and react, then asserts the plugin
// registers both slots with the expected metadata and that the settings tab
// reads/writes its localStorage preferences through the safe-default rules.
import assert from 'node:assert'

// --- browser stub ---------------------------------------------------------
const store = new Map()
global.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
}
let loaded = null
window.__ModuleLoader__ = { load: (mod) => { loaded = mod } }

// --- react stub -----------------------------------------------------------
// createElement builds a plain tree; hooks are inert so components can be
// invoked as plain functions during render assertions.
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
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
]
assert.deepStrictEqual(Object.keys(dicts.sidebarPanelCollapse.zh).sort(), [...KEYS].sort(), 'zh keys')
assert.deepStrictEqual(Object.keys(dicts.sidebarPanelCollapse.en).sort(), [...KEYS].sort(), 'en keys')

// Both slots register exactly once, with the expected metadata.
assert.deepStrictEqual(
  injected.sort(),
  ['settings.plugins.tab', 'sidebar.footer.action'],
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

// --- component renders ----------------------------------------------------
const t = (key) => `t:${key}`
const footerTree = footer.component({ t, wide: true })
assert.strictEqual(footerTree.props.className, 'dsh-spc-layer', 'footer wrapper')
const footerBtn = footerTree.children.find((c) => c.type === 'button')
assert.strictEqual(footerBtn.props['aria-label'], 't:expand', 'collapsed -> button offers "expand"')
assert.strictEqual(footerBtn.props['aria-expanded'], false, 'collapsed by default')

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
const select = nodes.find((n) => n.type === 'select')
assert.ok(select, 'order dropdown rendered')
assert.strictEqual(select.props.disabled, false, 'dropdown enabled under the cap')
assert.strictEqual(select.props.value, '', 'dropdown resets to the placeholder')
assert.deepStrictEqual(
  flatten(select).filter((n) => n.type === 'option').map((n) => n.props.value),
  ['', 'plugins', 'market', 'schedules'],
  'dropdown lists every panel plus the placeholder',
)
assert.ok(captionHas(nodes, 'orderEmpty'), 'empty order shows the default-order hint')

// Adding: the picked id is appended; picking it again is deduped on save.
select.props.onChange({ target: { value: 'market' } })
assert.deepStrictEqual(JSON.parse(store.get(prefsKey)).order, ['market'], 'first add stored')
nodes = renderTab()
nodes.find((n) => n.type === 'select').props.onChange({ target: { value: 'market' } })
assert.deepStrictEqual(JSON.parse(store.get(prefsKey)).order, ['market'], 'duplicate add dropped on save')
nodes = renderTab()
nodes.find((n) => n.type === 'select').props.onChange({ target: { value: 'plugins' } })
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
assert.strictEqual(nodes.find((n) => n.type === 'select').props.disabled, true, 'dropdown disabled at the cap')

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
  const nav = { style: mkStyle(), classList: mkClassList(), children: [], querySelectorAll: () => nav.children }
  nav.children = labels.map((label) => {
    const row = {
      style: mkStyle(), hidden: false, parentElement: nav,
      getAttribute: (name) => (name === 'aria-label' ? label : null),
      setAttribute: (name) => { if (name === 'data-spc-hidden') row.hidden = true },
      removeAttribute: (name) => { if (name === 'data-spc-hidden') row.hidden = false },
      matches: () => true,
      querySelector: () => null,
    }
    return row
  })
  return nav
}
const runFooterEffect = (nav, storedOrder, collapsedCount, iconSize) => {
  store.set('dsh.sidebar-panel-collapse', 'expanded') // start expanded so one click collapses
  store.set(prefsKey, JSON.stringify({
    grid: false, columns: 3, collapsedCount, collapsedRows: 0, order: storedOrder,
    iconSize: iconSize ?? 'md',
  }))
  const tree = footer.component({ t, wide: true })
  const root = { parentElement: null, querySelector: (sel) => (sel === ':scope > nav' ? nav : null) }
  tree.props.ref.current = root
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

// Adopted third-party entries report an id derived from their data attr.
clickHandler({ target: { closest: (sel) => (sel.startsWith('[') ? { hasAttribute: (a) => a === 'data-dsh-rss-entry' } : null) } })
await Promise.resolve()
assert.deepStrictEqual(recorded, ['plugins', 'rss'], 'adopted entry click reported')

// Anything else (no panel label, not in the sidebar) is ignored.
clickHandler({ target: { closest: (sel) => (sel.startsWith('[') ? null : { closest: () => null, getAttribute: () => null }) } })
await Promise.resolve()
assert.strictEqual(recorded.length, 2, 'non-panel click ignored')

// --- host half ------------------------------------------------------------
// The Typert service counts clicks into <DSH_HOME>/plugins/.../click-counts.json.
const fs = await import('node:fs')
const os = await import('node:os')
const path = await import('node:path')
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spc-smoke-'))
process.env.DSH_HOME = tmpHome
const host = await import('../src/index.js')
const provided = {}
host.apply({ provide: (name, value) => { provided[name] = value } })
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
fs.rmSync(tmpHome, { recursive: true, force: true })
delete process.env.DSH_HOME

console.log('smoke: all assertions passed')

