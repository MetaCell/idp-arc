// Merging a re-upload's per-animal files with the draft's (core/bids/merge.ts). Run: yarn test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMergedFile, mergeWithDraft } from '../../src/core/bids/merge'

test('only the per-animal files, their descriptions and the stage descriptions are merged', () => {
  assert.deepEqual(['participants.tsv', 'participants.json', 'phenotype/weight.tsv', 'phenotype/weight.json', 'task-x_acq-y_beh.json'].map(isMergedFile), [true, true, true, true, true])
  assert.deepEqual(['dataset_description.json', 'sub-A/beh/sub-A_beh.tsv', 'sub-A/ses-1/beh/sub-A_ses-1_task-x_acq-y_beh.json', 'sourcedata/participants.tsv'].map(isMergedFile), [false, false, false, false])
})

test('a stage description keeps the columns only earlier uploads had', () => {
  const merged = JSON.parse(mergeWithDraft('task-x_acq-y_beh.json',
    '{"TaskName":"x","error_type":{"LongName":"Error type"},"latency_s":{"LongName":"old"}}',
    '{"TaskName":"x","latency_s":{"LongName":"Latency (s)","Units":"s"}}'))
  assert.deepEqual(merged, { TaskName: 'x', error_type: { LongName: 'Error type' }, latency_s: { LongName: 'Latency (s)', Units: 's' } })
})

test('rows merge by participant_id; columns are the union, missing cells n/a', () => {
  const existing = 'participant_id\tday_0_weight\tday_7_weight\nsub-A\t30\t28\nsub-B\t31\t29\n'
  const incoming = 'participant_id\tday_0_weight\nsub-B\t32\nsub-C\t33\n'
  assert.equal(mergeWithDraft('phenotype/weight.tsv', existing, incoming),
    'participant_id\tday_0_weight\tday_7_weight\nsub-A\t30\t28\nsub-B\t32\tn/a\nsub-C\t33\tn/a\n')
  assert.equal(mergeWithDraft('participants.tsv', '', incoming), incoming)
})

test('descriptions merge by key, the new one winning', () => {
  const merged = JSON.parse(mergeWithDraft('participants.json', '{"a":{"Description":"old"},"b":{"Description":"kept"}}', '{"a":{"Description":"new"}}'))
  assert.deepEqual(merged, { a: { Description: 'new' }, b: { Description: 'kept' } })
})
