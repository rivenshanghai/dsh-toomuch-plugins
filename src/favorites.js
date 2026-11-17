/**
 * 工作区收藏（Host 半边）。
 *
 * 收藏以**项目绝对路径**为键：工作区被删掉又重新加回来时，宿主会发一个新的
 * workspaceId，但目录还是那个目录 —— 对用户来说是同一个项目，收藏不该丢。
 *
 * 文件落在插件自己的目录下（`<DSH_HOME>/plugins/dsh-toomuch-plugins/`），
 * 与别的插件、与 DSH 配置都无关；插件升级或重装都不影响它。
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** 收藏上限：这是给人看的清单，不是数据库。 */
const MAX_FAVORITES = 500
/** 路径长度上限：挡住把垃圾数据写进文件。 */
const MAX_PATH_LENGTH = 1024

/**
 * 收藏文件的位置。
 * @returns {string} 收藏文件的绝对路径。
 */
export function favoritesFile() {
  const home = (process.env.DSH_HOME || '').trim() || join(homedir(), '.dsh')
  return join(home, 'plugins', 'dsh-toomuch-plugins', 'favorites.json')
}

/**
 * 读收藏列表。文件缺失或损坏时读成空列表，不抛错 —— 收藏坏了不该弄坏侧栏。
 * @returns {string[]} 收藏的项目路径（已去重、已截断）。
 */
export function readFavorites() {
  try {
    const parsed = JSON.parse(readFileSync(favoritesFile(), 'utf8'))
    if (!Array.isArray(parsed)) return []
    const out = []
    for (const item of parsed) {
      if (typeof item !== 'string' || item === '' || item.length > MAX_PATH_LENGTH) continue
      if (out.includes(item)) continue
      out.push(item)
      if (out.length >= MAX_FAVORITES) break
    }
    return out
  } catch {
    // 文件缺失或损坏：从空收藏开始。
    return []
  }
}

/**
 * 写收藏列表。原子写：先写临时文件再改名，中途崩溃只会留下旧文件，不会截断收藏。
 * @param {string[]} paths 收藏的项目路径。
 */
export function writeFavorites(paths) {
  const file = favoritesFile()
  mkdirSync(dirname(file), { recursive: true })
  const body = JSON.stringify(paths.slice(0, MAX_FAVORITES), null, 2) + '\n'
  const temporary = `${file}.tmp`
  writeFileSync(temporary, body)
  renameSync(temporary, file)
}

/**
 * 切换一个项目的收藏状态。
 * @param {string} path 项目绝对路径。
 * @returns {string[]} 切换之后的收藏路径列表。
 */
export function toggleFavorite(path) {
  if (typeof path !== 'string' || path === '' || path.length > MAX_PATH_LENGTH) return readFavorites()
  const favorites = readFavorites()
  const at = favorites.indexOf(path)
  if (at === -1) favorites.push(path)
  else favorites.splice(at, 1)
  try {
    writeFavorites(favorites)
  } catch {
    // 磁盘不可用：这次切换不落盘，调用方手里的内存状态照常变。
  }
  return favorites
}
