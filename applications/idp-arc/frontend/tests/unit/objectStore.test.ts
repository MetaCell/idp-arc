// The Scenario 1 object store (infra/publicBucketObjectStore.ts). Run: yarn test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { objectKey } from '../../src/infra/publicBucketObjectStore'

test('object key follows uploads/<protocolId>/<userSub>/<uploadId>/<filename>', () => {
  assert.equal(
    objectKey('four-choice-reversal', '1a2b-3c', 'u-1', 'Tac184_8-25-17.nwb'),
    'uploads/four-choice-reversal/1a2b-3c/u-1/Tac184_8-25-17.nwb',
  )
})

test('object key segments are path-safe: no traversal, no slashes, no spaces', () => {
  assert.equal(
    objectKey('four choice', 'user@lab.org', 'u-1', '../../my cohort.zip'),
    'uploads/four-choice/user-lab.org/u-1/my-cohort.zip',
  )
})
