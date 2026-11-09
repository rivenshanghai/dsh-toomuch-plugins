/**
 * Host half of the dsh-toomuch-plugins bundle; the Client module owns the UI.
 *
 * It serves two small Typert services to the browser:
 *
 *  - `spcClicks` counts how often each sidebar panel entry is clicked. The
 *    Client half reports clicks over a hand-rolled Typert remote (see
 *    CLICK_CONTRIBUTION in src/client.js) and this half persists them to
 *    `<DSH home>/plugins/dsh-toomuch-plugins/click-counts.json` — a plain
 *    `{ "<panel id>": count }` object, kept for a future release to auto-sort
 *    the panel list from real usage.
 *
 *  - `spcHistory` reads the plugin activity log (see src/history.js): what was
 *    installed, removed, enabled or disabled, and when.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRecorder } from './history.js'

/** Typert service key; also its namespace (client mounts against it). */
const SERVICE_KEY = 'spcClicks'
const NAMESPACE = 'spcClicks'
/** Service key of the plugin activity log. */
const HISTORY_SERVICE_KEY = 'spcHistory'
const HISTORY_NAMESPACE = 'spcHistory'
/** Prototype marker the Typert gateway reads to discover remote methods. */
const REMOTE_METHODS = '@deepseek-ai/dsh-typert-protocol/remote-methods'

/** Same resolution as @deepseek-ai/dsh-home-paths, without the dependency. */
function countsFile() {
  const home = (process.env.DSH_HOME || '').trim() || join(homedir(), '.dsh')
  return join(home, 'plugins', 'dsh-toomuch-plugins', 'click-counts.json')
}

function readCounts() {
  try {
    const parsed = JSON.parse(readFileSync(countsFile(), 'utf8'))
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  } catch {
    // Missing or corrupt file: start counting from scratch.
  }
  return {}
}

function writeCounts(counts) {
  const file = countsFile()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(counts, null, 2) + '\n')
}

/**
 * Build a Typert-bound service: the gateway falls back to source-described
 * endpoints for provided services, so no zod manifest is needed. The marker on
 * the prototype publishes the methods; methodParameterNames parses each
 * parameter from source — keep the signatures simple.
 * @param serviceKey Service name the client mounts against.
 * @param namespace Namespace of the service.
 * @param methods Remote method names.
 * @param implementation The methods themselves.
 * @returns The service instance, ready for `ctx.provide`.
 */
function remoteService(serviceKey, namespace, methods, implementation) {
  const proto = { ...implementation }
  Object.defineProperty(proto, REMOTE_METHODS, {
    value: {
      version: 1,
      methods: methods.map((method) => ({ method, invocation: { kind: 'direct' } })),
    },
  })
  // The binding's `service` must be the provided object itself, so it is
  // built after the instance exists.
  const service = Object.create(proto)
  Object.defineProperty(service, 'typertRemote', {
    value: { service, serviceKey, namespace },
  })
  return service
}

export function apply(ctx) {
  // Hand-rolled Typert wiring: the gateway falls back to source-described
  // endpoints for provided services, so no zod manifest is needed.
  const clicks = remoteService(SERVICE_KEY, NAMESPACE, ['recordClick'], {
    async recordClick(id) {
      if (typeof id !== 'string' || id.length === 0 || id.length > 128) return 0
      const counts = readCounts()
      counts[id] = (Number(counts[id]) || 0) + 1
      try {
        writeCounts(counts)
      } catch {
        // Disk unavailable: this increment is dropped; the next click counts.
      }
      return counts[id]
    },
  })
  ctx.provide(SERVICE_KEY, clicks)

  // The plugin activity log: the plugin manager reports every install,
  // removal and enable/disable as a `plugin-manager/operation` event.
  const recorder = createRecorder(ctx)
  const history = remoteService(HISTORY_SERVICE_KEY, HISTORY_NAMESPACE, ['list'], {
    list() {
      return recorder.list()
    },
  })
  ctx.provide(HISTORY_SERVICE_KEY, history)

  if (typeof ctx.on === 'function') {
    ctx.on('plugin-manager/operation', async (operation) => {
      try {
        await recorder.handle(operation)
      } catch {
        // A broken log must never break plugin management.
      }
    })
  }
}
