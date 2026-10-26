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
assert.deepStrictEqual(mod.inject, ['slots', 'locale'], 'inject faces')

// --- fake ctx -------------------------------------------------------------
const dicts = {}
const registrations = []
const injected = []
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
  },
}
mod.apply(ctx)

// Dictionaries: both locales carry every key the components look up.
const KEYS = ['collapse', 'expand', 'tab', 'grid', 'columns', 'collapsedCount', 'collapsedRows', 'collapsedHint']
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
  { grid: true, columns: 3, collapsedCount: 0, collapsedRows: 0 },
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
  { grid: true, columns: 4, collapsedCount: 0, collapsedRows: 0 },
  'columns=4 persisted',
)
pickButtons(renderTab(), 'collapsedRows').find((n) => n.children[0] === '2').props.onClick()
assert.deepStrictEqual(
  JSON.parse(store.get(prefsKey)),
  { grid: true, columns: 4, collapsedCount: 0, collapsedRows: 2 },
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

console.log('smoke: all assertions passed')

