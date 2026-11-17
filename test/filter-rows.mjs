// 项目筛选在侧栏里的实际效果 —— 浏览器里的真实检查。
//
// 跑法：node test/filter-rows.mjs
//
// 为什么需要它：筛选要「把不符合条件的项目整行藏掉」，但项目行、会话行、宿主
// 的分组容器三层都在动，只看单测看不见真实效果。这里按宿主的结构复刻侧栏，
// 断言哪些行真的看不见了。
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
  console.log('filter-rows: 跳过（没有 chromium 或 playwright-core）')
  process.exit(0)
}

const { chromium } = await import(playwright)
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>')
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: chrome })
const page = await browser.newPage({ viewport: { width: 300, height: 600 } })
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))
await page.goto(origin)

const clientSource = new URL('../src/client.js', import.meta.url).pathname
await page.evaluate(() => { window.__ModuleLoader__ = { load: (m) => { window.__mod = m } } })
await page.addScriptTag({ path: clientSource })

const result = await page.evaluate(async () => {
  // 宿主侧栏的结构（rc.3 Rows.tsx / WorkspaceBrowser.tsx）：
  // <div class=groupSection>
  //   <div class=projectRow data-row-key="workspace:<id>">名字</div>
  //   <div class=sessionRow data-row-key="session:<sid>">会话</div>
  const sidebar = document.createElement('div')
  sidebar.id = 'sidebar'
  document.body.appendChild(sidebar)

  const WORKSPACES = [
    { workspaceId: 'w-fav', path: '/work/fav', sessionIds: ['session-s-fav'] },
    { workspaceId: 'w-other', path: '/work/other', sessionIds: ['session-s-other'] },
    { workspaceId: 'w-kid', path: '/work/kid', sessionIds: ['session-s-kid'] },
    { workspaceId: 'w-parent', path: '/work', sessionIds: ['session-s-parent'] },
  ]
  for (const workspace of WORKSPACES) {
    const section = document.createElement('span')
    section.className = '_root_l6gf9_3'
    const row = document.createElement('div')
    row.className = 'bw-row bw-container-row'
    row.setAttribute('data-row-key', `ws-${workspace.workspaceId}`)
    row.setAttribute('role', 'treeitem')
    row.style.display = 'flex'
    row.innerHTML = '<span class="bw-chevron"></span><span class="bw-row-icon bw-folder-cell"></span>'
      + `<span class="bw-row-label" title="${workspace.path}">${workspace.path}</span>`
    section.appendChild(row)
    for (const sessionId of workspace.sessionIds) {
      const session = document.createElement('div')
      session.className = 'bw-row bw-session-row'
      session.setAttribute('data-row-key', `session:${sessionId}`)
      session.style.display = 'flex'
      session.textContent = sessionId
      section.appendChild(session)
    }
    sidebar.appendChild(section)
  }

  // 插件自己的样式表（只留与筛选相关的部分）
  const style = document.createElement('style')
  style.textContent = '[data-spc-fhide]{display:none !important;}'
  document.head.appendChild(style)

  // 用真实的 localStorage（页面走 http，file:// 下它是被禁用的）。
  const PREFS_KEY = 'dsh.sidebar-panel-collapse.display'
  window.localStorage.setItem(PREFS_KEY, JSON.stringify({
    grid: false, columns: 3, collapsedCount: 0, collapsedRows: 0, order: [], iconSize: 'md',
    favoritesOnly: true, recentOnly: false, latestOnly: false, recentDays: 7, latestCount: 3,
  }))

  const ctx = {
    effect: (fn) => fn(),
    locale: { register: () => {}, bind: (ns) => (key) => `${ns}.${key}` },
    slots: { inject: (slot, get) => get(), register: (entry) => entry, entriesOfSlot: () => [] },
    remote: { $mount: async () => () => {} },
    contextMenus: { register: () => () => {} },
    get: (name) => {
      if (name === 'workspaces') {
        return { list: { getSnapshot: () => ({ items: WORKSPACES }), subscribe: () => () => {} } }
      }
      if (name === 'sessions') {
        return { list: { getSnapshot: () => ({ byId: {
          'session-s-fav': { updatedAt: Date.now() },
          'session-s-other': { updatedAt: Date.now() },
          'session-s-kid': { updatedAt: Date.now() },
          'session-s-parent': { updatedAt: Date.now() },
        } }), subscribe: () => () => {} } }
      }
      if (name === 'remote.spcFavorites') {
        // 收藏：只有 /work/fav
        return {
          list: async () => ({ ok: true, value: { paths: ['/work/fav', '/work/kid'] } }),
          toggle: async () => ({ ok: true, value: { paths: ['/work/fav', '/work/kid'] } }),
        }
      }
      return undefined
    },
  }
  const exports = window.__mod.factory(() => ({}))
  exports.apply(ctx)
  await new Promise((resolve) => setTimeout(resolve, 300))

  const visible = (selector) => [...document.querySelectorAll(selector)]
    .filter((row) => getComputedStyle(row).display !== 'none')
    .map((row) => row.getAttribute('data-row-key'))
  const hidden = (selector) => [...document.querySelectorAll(selector)]
    .filter((row) => getComputedStyle(row).display === 'none')
    .map((row) => row.getAttribute('data-row-key'))

  return {
    projectVisible: visible('[data-row-key^="ws-"]'),
    projectHidden: hidden('[data-row-key^="ws-"]'),
    sessionVisible: visible('[data-row-key^="session:"]'),
    sessionHidden: hidden('[data-row-key^="session:"]'),
    allHaveFlag: [...document.querySelectorAll('[data-row-key^="ws-"]')]
      .map((row) => ({ key: row.getAttribute('data-row-key'), flag: row.hasAttribute('data-spc-fhide') })),
  }
})

await browser.close()
server.close()

const problems = []
const shown = new Set(result.projectVisible)
const hidden = new Set(result.projectHidden)
if (shown.has('ws-w-other')) problems.push('不符合条件的项目 w-other 仍然显示')
if (hidden.has('ws-w-fav')) problems.push('符合条件的项目 w-fav 被藏了')
if (result.sessionVisible.includes('session:session-s-other')) problems.push('w-other 的会话仍然显示')
if (!result.sessionVisible.includes('session:session-s-fav')) problems.push('w-fav 的会话不见了')
// 祖先规则：合格的子项目 /work/kid 把它的父目录 /work 带出来
if (!shown.has('ws-w-parent')) problems.push('父节点 w-parent 应该显示（合格的子项目带出来）')
if (!shown.has('ws-w-kid')) problems.push('符合条件的子项目 w-kid 应该显示')
// 父节点只是容器：它自己的会话仍然不显示
if (result.sessionVisible.includes('session:session-s-parent')) problems.push('父节点 w-parent 自己的会话不该显示')
if (errors.length > 0) problems.push(`页面报错：${errors.join(' / ')}`)

if (problems.length > 0) {
  console.error('filter-rows: 失败')
  for (const problem of problems) console.error(' - ' + problem)
  console.error('实际：', JSON.stringify(result, null, 1))
  process.exit(1)
}
console.log('filter-rows: 全部通过（不符合条件的项目与会话都隐藏，符合条件的保留）')
