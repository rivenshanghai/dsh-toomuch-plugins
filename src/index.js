/**
 * Host half of the dsh-toomuch-plugins bundle; the Client module owns the UI.
 *
 * Its only job is recording how often each sidebar panel entry is clicked:
 * the Client half reports clicks over a hand-rolled Typert remote (see
 * CLICK_CONTRIBUTION in src/client.js) and this half persists them to
 * `<DSH home>/plugins/dsh-toomuch-plugins/click-counts.json` — a plain
 * `{ "<panel id>": count }` object, kept for a future release to auto-sort
 * the panel list from real usage.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** Typert service key; also its namespace (client mounts against it). */
const SERVICE_KEY = 'spcClicks'
const NAMESPACE = 'spcClicks'
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

export function apply(ctx) {
  // Hand-rolled Typert wiring: the gateway falls back to source-described
  // endpoints for provided services, so no zod manifest is needed. The marker
  // on the prototype publishes recordClick; methodParameterNames parses its
  // single plain-identifier parameter from source — keep the signature simple.
  const proto = {
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
  }
  Object.defineProperty(proto, REMOTE_METHODS, {
    value: { version: 1, methods: [{ method: 'recordClick', invocation: { kind: 'direct' } }] },
  })
  // The binding's `service` must be the provided object itself, so it is
  // built after the instance exists.
  const service = Object.create(proto)
  Object.defineProperty(service, 'typertRemote', {
    value: { service, serviceKey: SERVICE_KEY, namespace: NAMESPACE },
  })
  ctx.provide(SERVICE_KEY, service)
}
