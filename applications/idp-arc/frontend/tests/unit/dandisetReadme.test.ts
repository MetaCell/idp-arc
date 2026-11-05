// The README packed into an upload (core/dandisetReadme.ts). Run: yarn test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { dandisetReadme, withReadme } from '../../src/core/dandisetReadme'

const README = dandisetReadme({
  name: 'Cohort A, spring 2026',
  dandisetId: '000777',
  dandisetUrl: 'https://dandi.example.org/dandiset/000777',
  protocol: {
    name: 'Four-choice reversal digging task',
    url: 'https://github.com/maracbaylis/four-choice-example',
    description: 'Mice must identify the single rewarded option.',
  },
  originalName: 'cohort.zip',
})

const unpack = async (file: File) => unzipSync(new Uint8Array(await file.arrayBuffer()))

test('the README says what the dataset is, then its files and links, and nothing time-dependent', () => {
  assert.equal(README, [
    '# Cohort A, spring 2026',
    '',
    'Behavioral data from the Four-choice reversal digging task.',
    '',
    'Mice must identify the single rewarded option.',
    '',
    '## Files',
    '',
    '- `cohort.zip`: the researcher\'s upload. Every file here except this README comes from it, unchanged.',
    '',
    '## Links',
    '',
    '- Dandiset 000777: https://dandi.example.org/dandiset/000777 (every published version, with its DOI)',
    '- Analysis code: https://github.com/maracbaylis/four-choice-example',
    '',
  ].join('\n'))
})

test('without a description or analysis code, those lines are left out', () => {
  const readme = dandisetReadme({ name: 'X', dandisetId: '1', dandisetUrl: 'u', protocol: { name: 'P' }, originalName: 'a.xlsx' })
  assert.doesNotMatch(readme, /Analysis code|\n\n\n/)
})

test('a single file is zipped together with the README, under its own name', async () => {
  const packed = await withReadme(new File(['sheet bytes'], 'animal 01.xlsx'), README)
  assert.equal(packed.name, 'animal 01.zip')
  const entries = await unpack(packed)
  assert.deepEqual(Object.keys(entries), ['README.md', 'animal 01.xlsx'])
  assert.equal(strFromU8(entries['README.md']), README)
  assert.equal(strFromU8(entries['animal 01.xlsx']), 'sheet bytes')
})

test('a zip keeps its name and every file and folder path; the README goes at its top', async () => {
  const upload = zipSync({ 'cohort/': new Uint8Array(), 'cohort/a.xlsx': strToU8('a'), 'cohort/protocol.pdf': strToU8('p') })
  const packed = await withReadme(new File([upload], 'cohort.zip'), README)
  assert.equal(packed.name, 'cohort.zip')
  const entries = await unpack(packed)
  assert.deepEqual(Object.keys(entries), ['README.md', 'cohort/a.xlsx', 'cohort/protocol.pdf'])
  assert.equal(strFromU8(entries['cohort/a.xlsx']), 'a')
})

test('a README.md already in the zip is kept; ours takes another name', async () => {
  const upload = zipSync({ 'README.md': strToU8('the lab\'s own notes') })
  const entries = await unpack(await withReadme(new File([upload], 'x.zip'), README))
  assert.deepEqual(Object.keys(entries), ['README-dandiset.md', 'README.md'])
  assert.equal(strFromU8(entries['README.md']), 'the lab\'s own notes')
})

test('the same file and README always give the same bytes, so a retry gets the same checksum', async () => {
  const bytes = async () => new Uint8Array(await (await withReadme(new File(['sheet'], 'a.xlsx'), README)).arrayBuffer())
  assert.deepEqual(await bytes(), await bytes())
})

test('a .zip that is not a readable zip is carried inside the new one as it is', async () => {
  const entries = await unpack(await withReadme(new File(['not a zip'], 'broken.zip'), README))
  assert.deepEqual(Object.keys(entries), ['README.md', 'broken.zip'])
  assert.equal(strFromU8(entries['broken.zip']), 'not a zip')
})
