// One DANDI asset path segment (core/pathSafe.ts). Run: yarn test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pathSafe } from '../../src/core/pathSafe'

test('runs of other characters become one dash, and none is left before the extension', () => {
  assert.equal(pathSafe('four-choice-filled-3-animals-ABC001-003 -2-.zip'), 'four-choice-filled-3-animals-ABC001-003-2.zip')
  assert.equal(pathSafe('Weight and Feeding log.xlsx'), 'Weight-and-Feeding-log.xlsx')
  assert.equal(pathSafe('animal_01.xlsx'), 'animal_01.xlsx')
  assert.equal(pathSafe('a@b/c.xlsx'), 'a-b-c.xlsx')
})

test('nothing usable gives "unknown"; dots and dashes at the ends are dropped', () => {
  assert.equal(pathSafe('@@@'), 'unknown')
  assert.equal(pathSafe('--.hidden--'), 'hidden')
  assert.equal(pathSafe('four-choice-reversal'), 'four-choice-reversal')
})
