/**
 * Plugin activity history — the host half's recorder.
 *
 * DSH reports every plugin-management operation as a `plugin-manager/operation`
 * event (the plugin manager emits it for installs, removals, enable/disable
 * toggles and version exemptions). This module listens to those events and
 * keeps a small local log of the ones a person cares about:
 *
 *   install / remove  — a plugin package was added to or taken off the profile
 *   enable / disable  — a plugin (or a plugin bundle) was switched on or off
 *
 * Upgrades are deliberately left out: the plugin manager performs an upgrade
 * as a removal followed by an installation of the same package, so an upgrade
 * would otherwise show up as "removed" + "installed". A removal that is
 * followed by an installation of a *different* version is that upgrade and is
 * dropped; a removal that is followed by the very same version is a real
 * re-install and stays.
 *
 * The log lives next to the plugin's other state file:
 * `<DSH_HOME>/plugins/dsh-toomuch-plugins/plugin-history.json`
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** How long a removal waits for a possible upgrade before it counts as one. */
const REMOVE_GRACE_MS = 3000
/** Enable/disable records older than this are not shown (a rolling month). */
const TOGGLE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
/** Cap on the stored log — ponytail: this is a log, not a database. */
const MAX_EVENTS = 2000

/** Where the history is kept. */
export function historyFile() {
  const home = (process.env.DSH_HOME || '').trim() || join(homedir(), '.dsh')
  return join(home, 'plugins', 'dsh-toomuch-plugins', 'plugin-history.json')
}

/** One record as it is stored. */
function isEvent(value) {
  if (value === null || typeof value !== 'object') return false
  if (typeof value.name !== 'string' || value.name === '') return false
  return value.action === 'install' || value.action === 'remove' || value.action === 'enable' || value.action === 'disable'
}

/** Read the stored log; a missing or corrupt file starts an empty log. */
function readLog(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.events)) {
      return parsed.events.filter(isEvent)
    }
  } catch {
    // Missing or corrupt file: start from scratch.
  }
  return []
}

/** Write the log back, keeping only the newest records. */
function writeLog(file, events) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify({ version: 1, events: events.slice(-MAX_EVENTS) }, null, 2) + '\n')
}

/** The profile's installed packages and their versions. */
function profileDependencies(ctx) {
  try {
    const profile = ctx.get('profileContext')
    if (profile === undefined || profile === null || typeof profile.dir !== 'string') return {}
    const manifest = JSON.parse(readFileSync(join(profile.dir, 'package.json'), 'utf8'))
    const dependencies = manifest.dependencies
    if (dependencies === null || typeof dependencies !== 'object') return {}
    return dependencies
  } catch {
    // No profile or an unreadable manifest: nothing is known to be installed.
    return {}
  }
}

/**
 * The plugin behind a loader entry id. The inventory is the cheap source; the
 * plugin manager is the fallback for a profile without the inventory service.
 * @param ctx Plugin context.
 * @param entryId Loader entry id of the plugin.
 * @returns The module name, or the entry id when it cannot be resolved.
 */
async function pluginName(ctx, entryId) {
  try {
    const inventory = ctx.get('pluginInventory')
    if (inventory !== undefined && inventory !== null && typeof inventory.list === 'function') {
      const snapshot = await inventory.list()
      const entries = snapshot !== null && typeof snapshot === 'object' && Array.isArray(snapshot.entries) ? snapshot.entries : []
      const hit = entries.find((entry) => entry.entryId === entryId)
      if (hit !== undefined && typeof hit.moduleName === 'string' && hit.moduleName !== '') return hit.moduleName
    }
  } catch {
    // The inventory is optional.
  }
  try {
    const manager = ctx.get('pluginManager')
    if (manager !== undefined && manager !== null && typeof manager.listPlugins === 'function') {
      const rows = await manager.listPlugins()
      const hit = Array.isArray(rows) ? rows.find((row) => row.entryId === entryId) : undefined
      if (hit !== undefined && typeof hit.moduleName === 'string' && hit.moduleName !== '') return hit.moduleName
    }
  } catch {
    // The plugin manager is optional.
  }
  return entryId
}

/**
 * The bundles the profile selected (the plugin manager writes the selection
 * into the profile manifest).
 * @param ctx Plugin context.
 * @returns The selected bundle names.
 */
function selectedBundles(ctx) {
  try {
    const profile = ctx.get('profileContext')
    if (profile === undefined || profile === null || typeof profile.dir !== 'string') return []
    const manifest = JSON.parse(readFileSync(join(profile.dir, 'package.json'), 'utf8'))
    const bundles = manifest === null || typeof manifest !== 'object' ? undefined : manifest.dsh?.profile?.bundles
    return Array.isArray(bundles) ? bundles : []
  } catch {
    return []
  }
}

/**
 * Whether the profile selects the bundle. The plugin manager writes the
 * selection into the profile manifest, so this is the state a bundle toggle
 * changes.
 * @param ctx Plugin context.
 * @param name Bundle package name.
 * @returns True/False, or null when the state cannot be read.
 */
function bundleSelected(ctx, name) {
  try {
    const profile = ctx.get('profileContext')
    if (profile === undefined || profile === null || typeof profile.dir !== 'string') return null
    const manifest = JSON.parse(readFileSync(join(profile.dir, 'package.json'), 'utf8'))
    const bundles = manifest === null || typeof manifest !== 'object' ? undefined : manifest.dsh?.profile?.bundles
    if (!Array.isArray(bundles)) return null
    return bundles.includes(name)
  } catch {
    return null
  }
}

/**
 * The plugin bundles the profile installed, with whether they are enabled.
 * Only packages that declare a `dsh.bundle` are plugins; the profile's other
 * dependencies are support packages.
 * @param ctx Plugin context.
 * @returns The installed bundles: `{ name, version, enabled }`.
 */
function profileBundles(ctx) {
  let profile = null
  try {
    profile = ctx.get('profileContext')
  } catch {
    profile = null
  }
  if (profile === undefined || profile === null || typeof profile.dir !== 'string') return []
  const selected = new Set(selectedBundles(ctx))
  const bundles = []
  for (const [name, version] of Object.entries(profileDependencies(ctx))) {
    let manifest = null
    try {
      manifest = JSON.parse(readFileSync(join(profile.dir, 'node_modules', name, 'package.json'), 'utf8'))
    } catch {
      continue
    }
    if (manifest === null || typeof manifest !== 'object' || manifest.dsh?.bundle === undefined) continue
    bundles.push({ name, version, enabled: selected.has(name) })
  }
  return bundles
}

/**
 * Whether the loader entry is switched off. The plugin manager switches a
 * plugin off by disabling its loader entry, so this is the state a plugin
 * toggle changes.
 * @param ctx Plugin context.
 * @param entryId Loader entry id of the plugin.
 * @returns True/False, or null when the state cannot be read.
 */
function entryDisabled(ctx, entryId) {
  try {
    const loader = ctx.get('loader')
    if (loader === undefined || loader === null || typeof loader.entries !== 'function') return null
    for (const entry of loader.entries()) {
      if (entry.id === entryId) return entry.disabled === true
    }
    return null
  } catch {
    return null
  }
}

/**
 * Build the recorder: it owns the log, the packages known to be installed and
 * the removals that may still turn out to be an upgrade.
 * @param ctx Plugin context (host half).
 * @param options `removeGraceMs` overrides the removal grace (tests).
 * @returns The recorder with `handle(operation)` and `list()`.
 */
export function createRecorder(ctx, options = {}) {
  const file = historyFile()
  const graceMs = Number.isFinite(options.removeGraceMs) ? options.removeGraceMs : REMOVE_GRACE_MS
  /** Package name -> version currently on disk. */
  const installed = new Map()
  /** Package name -> a removal that has not been recorded yet. */
  const pending = new Map()
  /** Package names whose installation is running right now. */
  const installing = new Set()
  /** Operation id -> plugin name, resolved while the entry was still loaded. */
  const resolved = new Map()
  /** Operation id -> enablement state before the operation. */
  const states = new Map()

  // The packages the profile already had are not new installs.
  for (const [name, version] of Object.entries(profileDependencies(ctx))) installed.set(name, version)

  // The first run: there is no history yet, so scan the profile once and
  // record the plugins it already had as the starting point. The scan cannot
  // know when they were installed, so these records are marked as a baseline.
  if (!existsSync(file)) {
    const at = new Date().toISOString()
    const events = []
    for (const bundle of profileBundles(ctx)) {
      events.push({ action: 'install', name: bundle.name, version: bundle.version, time: at, baseline: true })
      events.push({ action: bundle.enabled ? 'enable' : 'disable', name: bundle.name, version: null, time: at, baseline: true })
    }
    try {
      writeLog(file, events)
    } catch {
      // No writable log: the window simply stays empty.
    }
  }

  /** Append one record to the log; a disk failure drops the record only. */
  function append(event) {
    const events = readLog(file)
    events.push(event)
    try {
      writeLog(file, events)
    } catch {
      // Disk unavailable: this record is dropped, the next one still lands.
    }
  }

  /** Record the removals that no installation has claimed. */
  function flush(now) {
    for (const [name, removal] of [...pending]) {
      if (installing.has(name)) continue
      if (now - removal.at < graceMs) continue
      pending.delete(name)
      append(removal.event)
    }
  }

  /** An operation that really changed something. */
  function applied(operation) {
    return operation.application !== 'failed' && operation.application !== 'cancelled'
  }

  /** The record's timestamp, falling back to now. */
  function stamp(operation) {
    return typeof operation.time === 'string' && operation.time !== '' ? operation.time : new Date().toISOString()
  }

  /** A package was installed. */
  function onInstall(operation) {
    const name = operation.target
    if (typeof name !== 'string' || name === '') return
    if (operation.phase !== 'settled') {
      installing.add(name)
      return
    }
    installing.delete(name)
    if (!applied(operation)) return
    const version = profileDependencies(ctx)[name] ?? null
    const removal = pending.get(name)
    if (removal !== undefined) {
      pending.delete(name)
      const upgraded =
        removal.event.version !== null &&
        version !== null &&
        removal.event.version !== version
      if (upgraded) {
        // An upgrade: the removal and the new version are both left out.
        installed.set(name, version)
        return
      }
      // A real re-install: the removal happened first and stays.
      append(removal.event)
      installed.set(name, version)
      append({ action: 'install', name, version, time: stamp(operation) })
      return
    }
    if (installed.has(name)) {
      // Already on disk and no removal in between: an upgrade, not shown.
      installed.set(name, version)
      return
    }
    installed.set(name, version)
    append({ action: 'install', name, version, time: stamp(operation) })
  }

  /** A package was removed. */
  function onRemove(operation) {
    const name = operation.target
    if (typeof name !== 'string' || name === '') return
    if (operation.phase !== 'settled') return
    if (!applied(operation)) return
    const version = typeof operation.version === 'string' ? operation.version : (installed.get(name) ?? null)
    installed.delete(name)
    // Held back: an upgrade removes the package first and installs it again.
    pending.set(name, {
      at: Date.now(),
      event: { action: 'remove', name, version, time: stamp(operation) },
    })
  }

  /** A plugin or a plugin bundle was switched on or off. */
  async function onToggle(operation) {
    if (operation.phase !== 'settled') {
      // Read the state before the change: afterwards the entry may be gone.
      if (operation.reason === 'plugin' && typeof operation.target === 'string') {
        resolved.set(operation.id, await pluginName(ctx, operation.target))
        states.set(operation.id, entryDisabled(ctx, operation.target))
        return
      }
      if (operation.reason === 'bundle' && typeof operation.target === 'string') {
        states.set(operation.id, bundleSelected(ctx, operation.target))
      }
      return
    }
    if (!applied(operation)) return
    let name
    let before
    if (operation.reason === 'plugin') {
      name = resolved.get(operation.id)
      if (typeof name !== 'string' || name === '') name = await pluginName(ctx, operation.target)
      before = states.get(operation.id)
    } else {
      name = operation.target
      before = states.get(operation.id)
    }
    // The operation is done: its scratch entries are not needed any more.
    resolved.delete(operation.id)
    states.delete(operation.id)
    if (typeof name !== 'string' || name === '') return
    // A version exemption is reported as a bundle change; it changes no
    // enablement, so the state check below skips it.
    if (operation.reason === 'bundle' && name.indexOf('@') > 0) return
    // Only a real switch counts: the state before and after must differ.
    const after = operation.reason === 'plugin' ? entryDisabled(ctx, operation.target) : bundleSelected(ctx, name)
    if (before !== null && before !== undefined && after !== null && after !== undefined && before === after) return
    const enabled = operation.enabled === true
    append({ action: enabled ? 'enable' : 'disable', name, version: null, time: stamp(operation) })
  }

  /** Handle one plugin-manager operation. */
  async function handle(operation) {
    if (operation === null || typeof operation !== 'object') return
    const reason = operation.reason
    if (reason === 'install') return onInstall(operation)
    if (reason === 'remove') return onRemove(operation)
    if (reason === 'plugin' || reason === 'bundle') return onToggle(operation)
  }

  /**
   * The log as the window shows it: every install / removal, and the
   * enable / disable records of the last month.
   */
  function list() {
    const now = Date.now()
    flush(now)
    const cutoff = now - TOGGLE_WINDOW_MS
    const installRemove = []
    const enableDisable = []
    for (const event of readLog(file)) {
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

  return { handle, list }
}
