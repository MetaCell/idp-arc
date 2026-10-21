// Where a run's files go (core/workspaceLayout.ts). Run: yarn test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { workspaceLayout } from '../../src/core/workspaceLayout'

test('one folder per protocol, one per run inside it, named by the UTC time without colons', () => {
  const layout = workspaceLayout('four-choice-reversal', new Date('2026-10-05T10:54:43.123Z'))
  assert.deepEqual(layout, {
    run: 'four-choice-reversal/run-four-choice-reversal-2026-10-05T10-54-43Z',
    inputs: 'four-choice-reversal/run-four-choice-reversal-2026-10-05T10-54-43Z/inputs',
    outputs: 'four-choice-reversal/run-four-choice-reversal-2026-10-05T10-54-43Z/outputs',
    notebooks: 'four-choice-reversal/run-four-choice-reversal-2026-10-05T10-54-43Z/notebooks',
    failedNotebooks: 'four-choice-reversal/run-four-choice-reversal-2026-10-05T10-54-43Z/notebooks.failed',
    log: 'four-choice-reversal/run-four-choice-reversal-2026-10-05T10-54-43Z/run.log',
  })
})
