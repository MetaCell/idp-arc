// Saving the upload dialog's run across reloads (components/runStorage.ts). Run: yarn test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clearAllRuns, clearRun, loadRun, saveRun, withRunLock } from '../../src/components/runStorage'

/** An in-memory Storage. */
function memory(): Storage {
  const items = new Map<string, string>()
  return {
    get length() { return items.size },
    key: (i) => [...items.keys()][i] ?? null,
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => { items.set(k, v) },
    removeItem: (k) => { items.delete(k) },
    clear: () => items.clear(),
  }
}

test('a saved run comes back for the same user only', () => {
  const storage = memory()
  saveRun('alice', { step: 'failed' }, storage)
  assert.deepEqual(loadRun('alice', storage), { step: 'failed' })
  assert.equal(loadRun('bob', storage), null)
  clearRun('alice', storage)
  assert.equal(loadRun('alice', storage), null)
})

test('one saved by another version, or over a week ago, is dropped', () => {
  const storage = memory()
  storage.setItem('idp_run:alice', JSON.stringify({ version: 0, savedAt: Date.now(), run: { step: 'failed' } }))
  assert.equal(loadRun('alice', storage), null)
  storage.setItem('idp_run:alice', JSON.stringify({ version: 1, savedAt: Date.now() - 8 * 24 * 3600_000, run: { step: 'failed' } }))
  assert.equal(loadRun('alice', storage), null)
  assert.equal(storage.getItem('idp_run:alice'), null, 'and removed')
})

test('logout clears every user\'s run and nothing else', () => {
  const storage = memory()
  saveRun('alice', {}, storage)
  saveRun('bob', {}, storage)
  storage.setItem('other', 'kept')
  clearAllRuns(storage)
  assert.equal(storage.length, 1)
  assert.equal(storage.getItem('other'), 'kept')
})

test('blocked storage is no storage, not an error', () => {
  const blocked = { ...memory(), getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } } as Storage
  assert.doesNotThrow(() => saveRun('alice', {}, blocked))
  assert.equal(loadRun('alice', blocked), null)
})

test('without the Web Locks API the run still runs', async () => {
  let ran = false
  assert.equal(await withRunLock('alice', async () => { ran = true }), true)
  assert.ok(ran)
})
