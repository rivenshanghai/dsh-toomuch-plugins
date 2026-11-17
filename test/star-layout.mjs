// 星号在项目行里的位置与存活 —— 浏览器里的真实布局检查。
//
// 跑法：node test/star-layout.mjs
//
// 为什么需要它：星号插在哪、会不会被宿主的 React 重建冲掉，只有真实 DOM
// 算得出来。2026-11-14 的第一版把星号插在行尾 —— 宿主那一列是 `flex:1`，
// 星号被挤到整行最右、贴着悬停才出现的动作区，看起来像「没画出来」。这个脚本
// 用宿主的真实布局规则复刻项目行，把位置和存活都断言一遍。
//
// 依赖 playwright-core 与 chromium：本机路径见 CHROME_PATH / PLAYWRIGHT_CORE。
// 找不到就跳过（exit 0），不拖累没有浏览器的环境。
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
  console.log('star-layout: 跳过（没有 chromium 或 playwright-core）')
  process.exit(0)
}

const { chromium } = await import(playwright)

/** 宿主的项目行（rc.3 的 Rows.tsx + Rows.module.css 的关键规则）。 */
const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<div id="row" class="projectRow" data-row-key="workspace:11111111-2222-3333-4444-555555555555" role="treeitem" aria-expanded="false">
  <span class="bw-chevron"><span class="bw-arrow"></span></span>
  <span class="bw-row-icon bw-folder-cell"></span>
  <span class="bw-row-label" title="my-project">my-project</span>
  <span class="bw-row-count">3</span>
  <span class="bw-row-actions"></span>
</div>
<script>window.__ModuleLoader__={load:(m)=>{window.__mod=m}}</script>
</body></html>`

const dir = mkdtempSync(join(tmpdir(), 'spc-star-'))
const pagePath = join(dir, 'index.html')
writeFileSync(pagePath, PAGE)

const browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: chrome })
const page = await browser.newPage({ viewport: { width: 260, height: 400 } })
const errors = []
page.on('pageerror', (error) => errors.push(String(error)))

const clientSource = new URL('../src/client.js', import.meta.url).pathname
// 页面先摆好宿主的行与模块加载桩，再注入插件的 client.js
await page.setContent(PAGE)
await page.evaluate(() => { window.__ModuleLoader__ = { load: (m) => { window.__mod = m } } })
await page.addScriptTag({ path: clientSource })

const result = await page.evaluate(async () => {
  const row = document.querySelector('#row')
  // 宿主项目行的布局（rc.3 Rows.module.css）
  row.style.display = 'flex'
  row.style.alignItems = 'center'
  row.style.gap = '8px'
  row.style.height = '32px'
  for (const slot of row.querySelectorAll('.slot')) {
    slot.style.flex = 'none'
    slot.style.width = '16px'
    slot.style.height = '20px'
    slot.style.display = 'inline-flex'
  }
  const title = row.querySelector('.bw-row-label')
  title.style.minWidth = '0'
  title.style.overflow = 'hidden'
  title.style.textOverflow = 'ellipsis'
  title.style.whiteSpace = 'nowrap'
  title.style.fontSize = '14px'
  title.style.lineHeight = '20px'
  title.style.flex = '1 1 0%'
  row.querySelector('.bw-row-count').style.flex = 'none'
  row.querySelector('.bw-row-actions').style.flex = 'none'
  row.querySelector('.bw-row-actions').style.display = 'none'

  const style = document.createElement('style')
  style.textContent = '.dsh-spc-star{align-items:center;color:#e8a33d;display:inline-flex;flex:none;}'
  document.head.appendChild(style)

  const menus = []
  let favoritePaths = []
  const ctx = {
    effect: (fn) => fn(),
    locale: { register: () => {}, bind: (ns) => (key) => `${ns}.${key}` },
    slots: { inject: (slot, get) => get(), register: (entry) => entry, entriesOfSlot: () => [] },
    remote: { $mount: async () => () => {} },
    contextMenus: { register: (contribution) => { menus.push(contribution); return () => {} } },
    get: (name) => {
      if (name === 'workspaces') {
        return { list: { getSnapshot: () => ({ items: [
          { workspaceId: '11111111-2222-3333-4444-555555555555', path: '/home/rivenhong/dsh-toomuch-plugins', sessionIds: [] },
        ] }), subscribe: () => () => {} } }
      }
      if (name === 'sessions') return { list: { getSnapshot: () => ({ byId: {} }), subscribe: () => () => {} } }
      if (name === 'remote.spcFavorites') {
        return {
          list: async () => ({ ok: true, value: { paths: favoritePaths } }),
          toggle: async (path) => {
            favoritePaths = favoritePaths.includes(path)
              ? favoritePaths.filter((one) => one !== path)
              : [...favoritePaths, path]
            return { ok: true, value: { paths: favoritePaths } }
          },
        }
      }
      return undefined
    },
  }
  const exports = window.__mod.factory(() => ({}))
  exports.apply(ctx)
  await new Promise((resolve) => setTimeout(resolve, 60))

  const contribution = menus.find((one) => one.id === 'workspace.favorite')
  const actions = contribution.resolve({
    workspaceId: '11111111-2222-3333-4444-555555555555',
    path: '/home/rivenhong/dsh-toomuch-plugins',
    displayTitle: 'my-project',
  })
  await actions[0].run()
  await new Promise((resolve) => setTimeout(resolve, 300))

  const star = row.querySelector('[data-spc-star]')
  const starRect = star?.getBoundingClientRect()
  const titleRect = title.getBoundingClientRect()
  const rowRect = row.getBoundingClientRect()
  const placed = {
    starFound: star !== null,
    // 星号紧跟名字（几像素内），不是被 flex:1 挤到行尾
    gapAfterTitle: starRect ? Math.round(starRect.x - (titleRect.x + titleRect.width)) : null,
    insideRow: starRect ? starRect.x + starRect.width <= rowRect.x + rowRect.width + 1 : false,
    color: star === null ? null : getComputedStyle(star).color,
  }

  // 长名字：省略号照旧，星号仍然可见
  title.textContent = 'a-very-very-long-project-name-that-should-be-truncated'
  title.removeAttribute('title')
  const longTitle = title.getBoundingClientRect()
  const longStar = row.querySelector('[data-spc-star]').getBoundingClientRect()
  const longRow = row.getBoundingClientRect()
  const longName = {
    ellipsis: title.scrollWidth > title.clientWidth,
    starVisible: longStar.width > 0 && longStar.x + longStar.width <= longRow.x + longRow.width + 1,
  }

  // 宿主重建这一行（React 换掉 children）：星号要自己回来
  const fresh = document.createElement('div')
  fresh.className = row.className
  fresh.setAttribute('data-row-key', row.getAttribute('data-row-key'))
  fresh.innerHTML = '<span class="bw-chevron"></span><span class="bw-row-icon"></span>'
    + '<span class="bw-row-label" title="my-project">my-project</span>'
  row.replaceWith(fresh)
  // 在文档里数：旧行已经脱离文档了，在旧行上数会一直看到那颗星。
  const rightAfterRebuild = document.querySelectorAll('[data-spc-star]').length
  await new Promise((resolve) => setTimeout(resolve, 400))
  const afterRebuild = document.querySelectorAll('[data-spc-star]').length

  return { placed, longName, rightAfterRebuild, afterRebuild }
})

await browser.close()

const problems = []
if (!result.placed.starFound) problems.push('星号没有画出来')
if (result.placed.gapAfterTitle !== null && result.placed.gapAfterTitle > 8) {
  problems.push(`星号离名字太远（${result.placed.gapAfterTitle}px，应紧跟名字）`)
}
if (!result.placed.insideRow) problems.push('星号越出了行的边界')
if (!result.longName.ellipsis) problems.push('长名字没有省略号')
if (!result.longName.starVisible) problems.push('长名字时星号不可见')
if (result.rightAfterRebuild !== 0) problems.push('重建前星号本应被宿主删掉（测试前提失效）')
if (result.afterRebuild !== 1) problems.push('宿主重建行后星号没有补回来')

if (errors.length > 0) problems.push(`页面报错：${errors.join(' / ')}`)
if (problems.length > 0) {
  console.error('star-layout: 失败')
  for (const problem of problems) console.error(' - ' + problem)
  process.exit(1)
}
console.log('star-layout: 全部通过（位置紧跟名字 / 长名字省略号 / 宿主重建后补回）')
