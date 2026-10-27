// The upload dialog's state across reloads (components/uploadSession.ts). Run: yarn test:unit
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

/** An in-memory localStorage, installed before the module under test reads it. */
const items = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    get length() { return items.size },
    key: (i: number) => [...items.keys()][i] ?? null,
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => { items.set(k, v) },
    removeItem: (k: string) => { items.delete(k) },
    clear: () => items.clear(),
  },
})
const { INITIAL_FORM, restoreSession, session } = await import('../../src/components/uploadSession')
const checkpoint = { protocolId: 'p', fileKey: 'animal_01.xlsx|1|1', shareWithMaabcd: true }
const saved = (user: string) => JSON.parse(items.get(`idp_run:${user}`) ?? 'null')?.run

beforeEach(() => { session.set(INITIAL_FORM); items.clear() })

test('a run is saved for its user without the file, and cleared once its result is seen', () => {
  restoreSession('alice')
  session.set({ ...INITIAL_FORM, step: 'failed', protocol: 'Four', checkpoint, file: new File(['x'], 'animal_01.xlsx') })
  assert.equal(saved('alice').protocol, 'Four')
  assert.equal('file' in saved('alice'), false)

  session.set((prev) => ({ ...prev, step: 'success', resultSeen: true }))
  assert.equal(saved('alice'), undefined)
})

test('a run that was going when the page went comes back stopped, for Retry', () => {
  items.set('idp_run:bob', JSON.stringify({ version: 1, savedAt: Date.now(), run: {
    step: 'uploading', protocol: 'Four', checkpoint, dandisetId: '000123', spawnedWorkspaceId: 42, shareWithMaabcd: true,
    outputsDir: '', uploadMessage: 'Running the notebooks…',
    runSteps: [{ id: 'upload', label: 'Upload', state: 'succeeded' }, { id: 'run', label: 'Run', state: 'running', detail: 'Running' }],
  } }))
  restoreSession('bob')
  const form = session.get()
  assert.equal(form.step, 'failed')
  assert.match(form.uploadMessage, /stopped unexpectedly/)
  assert.deepEqual(form.runSteps.map((s) => s.state), ['succeeded', 'pending'])
  assert.equal(form.spawnedWorkspaceId, 42)
  assert.equal(form.file, null)
})

test('a run already open in the page is not replaced by a saved one', () => {
  items.set('idp_run:carol', JSON.stringify({ version: 1, savedAt: Date.now(), run: { step: 'failed', protocol: 'Old', checkpoint, runSteps: [] } }))
  session.set({ ...INITIAL_FORM, step: 'uploading', protocol: 'Current', checkpoint })
  restoreSession('carol')
  assert.equal(session.get().protocol, 'Current')
})
