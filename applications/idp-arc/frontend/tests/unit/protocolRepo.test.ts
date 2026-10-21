// protocols.json's repoZipUrl → the repository and the folder OSB's import unpacks it into.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRepoZipUrl } from '../../src/core/protocolRepo'

test('a branch archive unpacks to <repo>-<branch>', () => {
  assert.deepEqual(parseRepoZipUrl('https://codeload.github.com/maracbaylis/four-choice-example/zip/refs/heads/main'), {
    owner: 'maracbaylis', repo: 'four-choice-example', ref: 'main', folder: 'four-choice-example-main',
  })
})

test('a tag drops its leading v; a commit is used as is', () => {
  assert.equal(parseRepoZipUrl('https://codeload.github.com/o/r/zip/refs/tags/v1.2.0')?.folder, 'r-1.2.0')
  assert.equal(parseRepoZipUrl('https://codeload.github.com/o/r/zip/72cbc1e7b0d6')?.folder, 'r-72cbc1e7b0d6')
})

test('anything else is not a repository', () => {
  assert.equal(parseRepoZipUrl(undefined), null)
  assert.equal(parseRepoZipUrl('https://github.com/o/r'), null)
})
