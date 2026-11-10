/**
 * 事件落盘（JSONL 追加写）。
 *
 * 落盘位置与本仓库既有约定一致：`<DSH_HOME>/plugins/<包名>/` 下放自己的私有
 * 文件，不碰 DSH 的配置与会话目录。
 *
 * 只写最小字段，不写参数正文与结果正文——统计层要的是「谁被调了、调了几次、
 * 花了多久、有没有出错」，正文不属于这些问题的答案。
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * 事件流文件路径。
 * @returns 绝对路径。
 */
export function eventsFile() {
  const home = (process.env.DSH_HOME || '').trim() || join(homedir(), '.dsh')
  return join(home, 'plugins', 'dsh-plugin-insight', 'events.jsonl')
}

/**
 * 建一个只追加的写入器。
 *
 * 写失败不抛：磁盘不可写时这一条事件被丢掉，运行时不能因此崩。
 * @param {string} [file] 目标文件；默认取 eventsFile()。
 * @returns {{ file: string, append: (row: object) => boolean }}
 */
export function createStore(file = eventsFile()) {
  return {
    file,
    /**
     * 追加一行事件。
     * @param {object} row 事件行，必须能被 JSON 序列化。
     * @returns 是否写成功。
     */
    append(row) {
      try {
        mkdirSync(dirname(file), { recursive: true })
        appendFileSync(file, JSON.stringify(row) + '\n')
        return true
      } catch {
        // 磁盘不可写：这一行丢掉，下一条继续。
        return false
      }
    },
  }
}
