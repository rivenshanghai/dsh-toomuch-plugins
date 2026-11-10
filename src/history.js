/**
 * Plugin activity log (host half).
 *
 * The log answers one question: which plugins were installed, removed, enabled
 * or disabled, and when. It is built by comparing the profile's current state
 * with the state recorded last time, not by listening for change events: a
 * plugin can be installed or removed from the settings panel, from the plugin
 * market, from the `dsh` CLI, or by editing the profile manifest, and only some
 * of those paths announce what they did. The profile manifest is the one place
 * they all agree on, so it is the source of truth here.
 *
 * Comparing states cannot tell an upgrade from a re-install, because DSH
 * upgrades by removing the package and installing it again. That shows up as
 * "present, gone, present with another version", so a removal stays retractable
 * for a while and a re-appearing package with a different version retracts it:
 * the upgrade leaves no record at all, which is the intent.
 *
 * State lives in `~/.dsh/plugins/dsh-toomuch-plugins/plugin-history.json` as
 * `{ version, known, events }`. Details: docs/design.md.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * How long a written removal stays retractable as the start of a two-step
 * upgrade. Both halves run npm, so the gap is seconds to minutes.
 * ponytail: an upgrade slower than this leaves the removal in the log.
 */
const REMOVE_GRACE_MS = 10 * 60 * 1000
/** Enable/disable records older than this are not shown (a rolling month). */
const TOGGLE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
/** Cap on the stored log — ponytail: this is a log, not a database. */
const MAX_EVENTS = 2000
/** How often the host half re-reads the profile (see `sync`). */
export const SYNC_INTERVAL_MS = 5000

const ACTIONS = new Set(['install', 'remove', 'enable', 'disable'])

/**
 * Where the log lives. Kept beside the plugin's other state, not inside the
 * profile, so it survives a reinstall of the plugin itself.
 * @returns Absolute path of the log file.
 */
export function historyFile() {
  const home = (process.env.DSH_HOME || '').trim() || join(homedir(), '.dsh')
  return join(home, 'plugins', 'dsh-toomuch-plugins', 'plugin-history.json')
}

/** Whether a parsed record is one this module wrote. */
function isEvent(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.name === 'string' &&
    value.name !== '' &&
    ACTIONS.has(value.action) &&
    typeof value.time === 'string'
  )
}

/**
 * Whether a record is one this module wrote. Baseline records — the initial
 * listing of the plugins a profile already had — are dropped: they were not
 * operations, and the list they produced was never true.
 * @param value A parsed record.
 * @returns True when the record is an operation worth showing.
 */
function isOperation(value) {
  return isEvent(value) && value.baseline !== true
}

/**
 * Read the stored document. A missing or corrupt file reads as an empty one.
 * @param file Log path.
 * @returns `{ events, known }`; `known` is null when the file predates it.
 */
function readDoc(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.events)) {
      const known = parsed.known
      const usable =
        known !== null &&
        typeof known === 'object' &&
        known.packages !== null &&
        typeof known.packages === 'object' &&
        Array.isArray(known.enabled)
      return { events: parsed.events.filter(isOperation), known: usable ? known : null }
    }
  } catch {
    // Missing or corrupt file: start from scratch.
  }
  return { events: [], known: null }
}

/** Write the document back, keeping only the newest records. */
function writeDoc(file, doc) {
  mkdirSync(dirname(file), { recursive: true })
  const events = doc.events.slice(-MAX_EVENTS)
  const body = JSON.stringify({ version: 2, known: doc.known, events }, null, 2) + '\n'
  // Rename over the old file: a crash mid-write then leaves the previous log
  // intact instead of truncating the history.
  const temporary = `${file}.tmp`
  writeFileSync(temporary, body)
  renameSync(temporary, file)
}

/**
 * The profile manifest, read once per comparison.
 * @param ctx Plugin context.
 * @returns `{ packages, enabled }`, or null when the profile cannot be read.
 */
function profileState(ctx) {
  try {
    const profile = ctx.get('profileContext')
    if (profile === undefined || profile === null || typeof profile.dir !== 'string') return null
    const manifest = JSON.parse(readFileSync(join(profile.dir, 'package.json'), 'utf8'))
    const dependencies = manifest?.dependencies
    const bundles = manifest?.dsh?.profile?.bundles
    if (dependencies === null || typeof dependencies !== 'object') return null
    return {
      packages: dependencies,
      enabled: Array.isArray(bundles) ? bundles : [],
    }
  } catch {
    // No profile or an unreadable manifest: the state is unknown, which is
    // not the same as an empty profile.
    return null
  }
}

/**
 * Build the recorder: it owns the log and the last state it recorded.
 * @param ctx Plugin context (host half).
 * @param options `now` overrides the clock, `removeGraceMs` the upgrade window
 *   (both are for tests).
 * @returns The recorder with `sync()` and `list()`.
 */
export function createRecorder(ctx, options = {}) {
  const file = historyFile()
  const graceMs = Number.isFinite(options.removeGraceMs) ? options.removeGraceMs : REMOVE_GRACE_MS
  const clock = typeof options.now === 'function' ? options.now : () => Date.now()
  /** Package name -> the removal just written, which an upgrade must retract. */
  const recent = new Map()

  // The first run has no history, and the plugins already installed are not
  // news: they were installed before this log existed. So nothing is listed.
  // The current state becomes the baseline the next comparison starts from.
  // A log that predates the `known` snapshot is adopted the same way, so
  // upgrading this plugin adds no records of its own.
  if (!existsSync(file)) {
    try {
      writeDoc(file, { events: [], known: null })
    } catch {
      // No writable log: the window simply stays empty.
    }
  }

  /** Drop one record again: an upgrade retracts the removal it started with. */
  function retract(events, event) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const candidate = events[index]
      if (
        candidate.action === event.action &&
        candidate.name === event.name &&
        candidate.time === event.time &&
        candidate.version === event.version
      ) {
        events.splice(index, 1)
        return true
      }
    }
    return false
  }

  /** Forget removals too old to be the start of a two-step upgrade. */
  function prune(now) {
    for (const [name, removal] of [...recent]) {
      if (now - removal.at >= graceMs) recent.delete(name)
    }
  }

  /**
   * Compare the profile with the state recorded last time and write down what
   * changed. Safe to call at any time: with nothing changed it writes nothing.
   * @returns The records added by this comparison.
   */
  function sync() {
    const doc = readDoc(file)
    const state = profileState(ctx)
    // An unreadable profile is an unknown state, not an empty one: recording
    // it would claim every installed plugin was just removed.
    if (state === null) return []
    const { packages, enabled } = state
    const selected = new Set(enabled)
    const at = new Date(clock()).toISOString()
    const now = clock()
    const added = []
    let changed = false
    const record = (action, name, version) => added.push({ action, name, version, time: at })

    const before = doc.known
    if (before === null) {
      // A log written before this field existed: adopt the current state as
      // the baseline instead of reporting the whole profile as new.
      doc.known = { packages, enabled }
      try {
        writeDoc(file, doc)
      } catch {
        // Disk unavailable: the next comparison adopts it again.
      }
      return []
    }

    prune(now)
    // Appearances and switches.
    for (const [name, version] of Object.entries(packages)) {
      const wasInstalled = Object.hasOwn(before.packages, name)
      if (!wasInstalled) {
        const removal = recent.get(name)
        const upgraded =
          removal !== undefined &&
          typeof version === 'string' &&
          typeof removal.event.version === 'string' &&
          removal.event.version !== version
        if (upgraded) {
          // An upgrade: retract the removal and leave the installation out.
          recent.delete(name)
          if (retract(doc.events, removal.event)) changed = true
        } else {
          if (removal !== undefined) recent.delete(name)
          record('install', name, typeof version === 'string' ? version : null)
          if (selected.has(name)) record('enable', name, null)
        }
      } else if (before.enabled.includes(name) !== selected.has(name)) {
        record(selected.has(name) ? 'enable' : 'disable', name, null)
      }
    }
    // Disappearances.
    for (const name of Object.keys(before.packages)) {
      if (Object.hasOwn(packages, name)) continue
      const version = typeof before.packages[name] === 'string' ? before.packages[name] : null
      const event = { action: 'remove', name, version, time: at }
      added.push(event)
      // Held as retractable, not withheld: an upgrade removes the package and
      // installs it again, and that second step retracts this record.
      recent.set(name, { at: now, event })
    }

    // Nothing changed: leave the file alone rather than rewrite it on every
    // poll. Only presence and selection are compared, so a version that moved
    // without the package ever disappearing is an upgrade and stays unseen.
    if (added.length > 0) {
      doc.events = doc.events.concat(added)
      changed = true
    }
    if (!changed) return []
    doc.known = { packages, enabled }
    try {
      writeDoc(file, doc)
    } catch {
      // Disk unavailable: these records are dropped, the state is retried.
      return []
    }
    return added
  }

  /**
   * The log as the window shows it: every install / removal, and the
   * enable / disable records of the last month.
   */
  function list() {
    try {
      sync()
    } catch {
      // A profile read failure must not hide the records already written.
    }
    const now = clock()
    const cutoff = now - TOGGLE_WINDOW_MS
    const installRemove = []
    const enableDisable = []
    for (const event of readDoc(file).events) {
      if (event.action === 'install' || event.action === 'remove') installRemove.push(event)
      else if (Date.parse(event.time) >= cutoff) enableDisable.push(event)
    }
    // Newest first. The log is written oldest-first, so reversing first
    // puts the later-inserted record ahead when two share a timestamp (a
    // baseline scan writes them all at once), and the stable sort keeps
    // that tie order while ordering by time.
    const newestFirst = (a, b) => Date.parse(b.time) - Date.parse(a.time)
    return {
      installRemove: installRemove.reverse().sort(newestFirst),
      enableDisable: enableDisable.reverse().sort(newestFirst),
    }
  }

  return { sync, list }
}
