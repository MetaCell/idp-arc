/**
 * Keeps the upload dialog's run in localStorage, so a page reload (an OSB re-login, a refresh)
 * doesn't lose it. One per user; ids only, never tokens. Blocked storage just means no resume.
 */

const PREFIX = 'idp_run:'
/** Bumped when the saved shape changes: an older one is dropped, not misread. */
const VERSION = 1
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

function localStore(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function saveRun(user: string, run: unknown, storage = localStore()): void {
  try {
    storage?.setItem(PREFIX + user, JSON.stringify({ version: VERSION, savedAt: Date.now(), run }))
  } catch {
    /* full or blocked: the run just won't survive a reload */
  }
}

/** The user's saved run, or null (none, too old, or saved by another version of IDP). */
export function loadRun<T>(user: string, storage = localStore()): T | null {
  try {
    const raw = storage?.getItem(PREFIX + user)
    if (!raw) return null
    const saved = JSON.parse(raw) as { version?: number; savedAt?: number; run?: T }
    if (saved.version === VERSION && Date.now() - (saved.savedAt ?? 0) < MAX_AGE_MS && saved.run) return saved.run
    storage?.removeItem(PREFIX + user)
  } catch {
    /* unreadable: treated as none */
  }
  return null
}

export function clearRun(user: string, storage = localStore()): void {
  try {
    storage?.removeItem(PREFIX + user)
  } catch {
    /* blocked */
  }
}

/** On logout: nothing of anyone's run stays in this browser. */
export function clearAllRuns(storage = localStore()): void {
  try {
    if (!storage) return
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k) => k?.startsWith(PREFIX))
    keys.forEach((k) => storage.removeItem(k!))
  } catch {
    /* blocked */
  }
}

/** Runs `fn` unless another tab is already running this user's run; false if one is. */
export async function withRunLock(user: string, fn: () => Promise<void>): Promise<boolean> {
  const locks = globalThis.navigator?.locks
  if (!locks) {
    await fn()
    return true
  }
  return locks.request(PREFIX + user, { ifAvailable: true }, async (lock) => {
    if (!lock) return false
    await fn()
    return true
  })
}
