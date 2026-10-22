// The store that keeps the upload dialog's run across closing it (components/sessionStore.ts).
// Run: yarn test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSessionStore } from '../../src/components/sessionStore'

test('keeps its state, applies updates like setState, and tells subscribers', () => {
  const store = createSessionStore({ step: 'select', runs: 0 })
  const seen: string[] = []
  const unsubscribe = store.subscribe(() => seen.push(store.get().step))

  store.set((prev) => ({ ...prev, step: 'uploading', runs: prev.runs + 1 }))
  store.set({ step: 'failed', runs: 1 })
  unsubscribe()
  store.set((prev) => ({ ...prev, step: 'select' }))

  assert.deepEqual(seen, ['uploading', 'failed'], 'no news after unsubscribing')
  assert.deepEqual(store.get(), { step: 'select', runs: 1 })
})
