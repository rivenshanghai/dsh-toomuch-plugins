// 筛选开关在宿主「视图选项」菜单里的行为 —— 浏览器里的真实检查。
//
// 跑法：node test/filter-menu.mjs
//
// 为什么需要它：这三个开关是克隆宿主的菜单行插进去的，宿主每次打开菜单都重建
// 那片 DOM。第一版有两处错：CSS 的选择器写了一个从未被添加的祖先类（勾永远
// 显示、`display:none` 不生效），以及「已注入就提前返回」让勾的状态不再同步。
// 两者叠在一起，表现为「点了没反应」。
//
// 依赖 playwright-core 与 chromium：本机路径见 CHROME_PATH / PLAYWRIGHT_CORE。
// 找不到就跳过（exit 0）。
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  '/root/.cache/puppeteer/chrome-headless-shell',
].filter((value) => typeof value === 'string' && value !== '')
const PLAYWRIGHT_CANDIDATES = [
  process.env.PLAYWRIGHT_CORE,
  '/usr/local/lib/node_modules/camofox-browser/node_modules/playwright-core/index.mjs',
].filter((value) => typeof value === 'string' && value !== '')

const chrome = CHROME_CANDIDATES.find((path) => existsSync(path))
const playwright = PLAYWRIGHT_CANDIDATES.find((path) => existsSync(path))
if (chrome === undefined || playwright === undefined) {
  console.log('filter-menu: 跳过（没有 chromium 或 playwright-core）')
  process.exit(0)
}

const { chromium } = await import(playwright)
const browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: chrome })
const page = await browser.newPage({ viewport: { width: 320, height: 480 } })
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))

// 用本机 http 承载页面：file:// 下 localStorage 是禁用的。
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>')
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
await page.goto(origin)

const clientSource = new URL('../src/client.js', import.meta.url).pathname
await page.evaluate(() => { window.__ModuleLoader__ = { load: (m) => { window.__mod = m } } })
await page.addScriptTag({ path: clientSource })

const result = await page.evaluate(async () => {
  // 宿主 MenuSurface + MenuRow 的真实结构（primitives）：
  // 面板上带三个分组标题（role="presentation"），每项是
  // <div class=itemWrap><button role=menuitem><span class=itemIcon><svg/></span>
  //   <span class=itemLabel>文字</span>[<svg class=check/>]</button></div>
  const surface = document.createElement('div')
  surface.setAttribute('data-menu-material', 'translucent')
  document.body.appendChild(surface)
  const label = (text) => {
    const wrap = document.createElement('div')
    wrap.className = '_itemWrap_70kcw_173'
    wrap.innerHTML = `<button type="button" role="menuitem" class="_item_70kcw_173">
      <span aria-hidden="true" class="_itemIcon_70kcw_233"><svg viewBox="0 0 16 16"><path d="M2 8h12"/></svg></span>
      <span class="_itemLabel_70kcw_276">${text}</span>
    </button>`
    surface.appendChild(wrap)
    return wrap
  }
  const groupLabel = () => {
    const div = document.createElement('div')
    div.className = '_label_70kcw_214'
    div.setAttribute('role', 'presentation')
    div.textContent = '筛选会话'
    surface.appendChild(div)
  }
  groupLabel()
  label('隐藏已归档')
  groupLabel()
  label('全部对话')
  const selectedWrap = label('仅显示已归档')
  // 宿主给已选中项画的勾
  selectedWrap.querySelector('button').insertAdjacentHTML(
    'beforeend',
    '<svg class="_check_70kcw_265" viewBox="0 0 16 16"><path d="M3 8l3 3 6-7"/></svg>',
  )

  const style = document.createElement('style')
  style.textContent = `
    .dsh-spc-menuCheck{align-items:center;display:inline-flex;flex:none;margin-left:auto;}
    .dsh-spc-menuCheck[data-off]{display:none;}
  `
  document.head.appendChild(style)

  const store = new Map()
  window.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  }
  const PREFS_KEY = 'dsh.sidebar-panel-collapse.display'

  const menus = []
  const ctx = {
    effect: (fn) => fn(),
    locale: { register: () => {}, bind: (ns) => (key, params) => {
      if (key === 'filterRecent') return `仅显示最近 ${params.n} 天`
      if (key === 'filterLatest') return `仅显示最新 ${params.m} 个项目`
      if (key === 'filterFavorites') return '仅显示我的最爱项目'
      return `${ns}.${key}`
    } },
    slots: { inject: (slot, get) => get(), register: (entry) => entry, entriesOfSlot: () => [] },
    remote: { $mount: async () => () => {} },
    contextMenus: { register: (contribution) => { menus.push(contribution); return () => {} } },
    get: (name) => {
      if (name === 'workspaces') {
        return { list: { getSnapshot: () => ({ items: [
          { workspaceId: 'w1', path: '/work/one', sessionIds: [] },
          { workspaceId: 'w2', path: '/work/two', sessionIds: [] },
        ] }), subscribe: () => () => {} } }
      }
      if (name === 'sessions') return { list: { getSnapshot: () => ({ byId: {} }), subscribe: () => () => {} } }
      if (name === 'remote.spcFavorites') {
        return { list: async () => ({ ok: true, value: { paths: [] } }), toggle: async () => ({ ok: true, value: { paths: [] } }) }
      }
      return undefined
    },
  }
  const exports = window.__mod.factory(() => ({}))
  exports.apply(ctx)
  await new Promise((resolve) => setTimeout(resolve, 150))

  const rows = [...surface.querySelectorAll('[data-spc-filter]')]
  const readRows = () => rows.map((row) => {
    const btn = row.querySelector('button')
    const check = btn.querySelector('.dsh-spc-menuCheck')
    return {
      kind: row.getAttribute('data-spc-filter'),
      label: btn.querySelector('[data-spc-menu-label]')?.textContent ?? null,
      pressed: btn.getAttribute('aria-pressed'),
      checkOff: check?.hasAttribute('data-off') ?? null,
      checkVisible: check === null ? null : getComputedStyle(check).display !== 'none',
      iconLeft: btn.querySelectorAll('svg').length,
    }
  })

  const initial = readRows()

  // 点第一个开关
  const first = rows[0].querySelector('button')
  first.click()
  await new Promise((resolve) => setTimeout(resolve, 150))
  const afterClick = readRows()
  const stored = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}')

  // 宿主重建菜单（React 每次打开都重建）：克隆的行是全新节点
  const freshSurface = surface.cloneNode(true)
  surface.replaceWith(freshSurface)
  await new Promise((resolve) => setTimeout(resolve, 200))
  const freshRows = [...freshSurface.querySelectorAll('[data-spc-filter]')]
  const afterRebuild = freshRows.map((row) => {
    const btn = row.querySelector('button')
    const check = btn.querySelector('.dsh-spc-menuCheck')
    return {
      kind: row.getAttribute('data-spc-filter'),
      pressed: btn.getAttribute('aria-pressed'),
      checkOff: check?.hasAttribute('data-off') ?? null,
    }
  })

  return { initial, afterClick, stored, afterRebuild, rowCount: rows.length }
})

await browser.close()
server.close()

const problems = []
if (result.rowCount !== 3) problems.push(`注入了 ${result.rowCount} 行，应为 3 行`)
for (const row of result.initial) {
  if (row.label === null) problems.push(`${row.kind} 没有文字`)
  if (row.pressed !== 'false') problems.push(`${row.kind} 初始 aria-pressed 应为 false`)
  if (row.checkOff !== true) problems.push(`${row.kind} 初始勾应被标记为隐藏`)
  if (row.checkVisible !== false) problems.push(`${row.kind} 初始勾不该显示`)
}
const clicked = result.afterClick[0]
if (clicked.pressed !== 'true') problems.push('点击后 aria-pressed 没变成 true')
if (clicked.checkVisible !== true) problems.push('点击后勾没有显示出来')
if (result.stored.favoritesOnly !== true) problems.push('点击没有写进偏好')
for (const row of result.afterClick.slice(1)) {
  if (row.pressed !== 'false') problems.push(`${row.kind} 不该被点击影响`)
  if (row.checkVisible !== false) problems.push(`${row.kind} 的勾不该显示`)
}
const rebuilt = result.afterRebuild[0]
if (rebuilt.pressed !== 'true') problems.push('宿主重建菜单后 aria-pressed 丢了')
if (rebuilt.checkOff !== false) problems.push('宿主重建菜单后勾的状态没同步')
if (errors.length > 0) problems.push(`页面报错：${errors.join(' / ')}`)

if (problems.length > 0) {
  console.error('filter-menu: 失败')
  for (const problem of problems) console.error(' - ' + problem)
  process.exit(1)
}
console.log('filter-menu: 全部通过（初始无勾 / 点击出勾 / 重建后状态保持）')
