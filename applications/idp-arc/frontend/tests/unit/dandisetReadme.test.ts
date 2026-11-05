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
  folder: 'sourcedata/upload-2026-11-05T10-15-00Z',
})

const unpack = async (file: File) => unzipSync(new Uint8Array(await file.arrayBuffer()))

/** When the researcher last saved the sheet: 3 Nov 2026, 14:05. */
const SAVED = new Date(2026, 10, 3, 14, 5).getTime()

/** The DOS date and time a zip's central directory stores for `name`, as a timestamp. */
function dosDate(zip: Uint8Array, name: string): number {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  for (let i = 0; i + 46 <= zip.length; i++) {
    if (view.getUint32(i, true) !== 0x02014b50) continue
    const nameLength = view.getUint16(i + 28, true)
    if (new TextDecoder().decode(zip.subarray(i + 46, i + 46 + nameLength)) !== name) continue
    const time = view.getUint16(i + 12, true), date = view.getUint16(i + 14, true)
    return new Date(1980 + (date >> 9), ((date >> 5) & 15) - 1, date & 31, time >> 11, (time >> 5) & 63, (time & 31) * 2).getTime()
  }
  throw new Error(`${name} is not in the zip`)
}

test('the README says what the dataset is, where it is in the dandiset, how to cite it, and nothing time-dependent', () => {
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
    '## Where it is',
    '',
    '- Dandiset 000777: https://dandi.example.org/dandiset/000777',
    '- This upload: `sourcedata/upload-2026-11-05T10-15-00Z/` in that dandiset.',
    '- The tables made from it: the dandiset\'s `sub-<animal>/` folders, described in its top-level `README.md`.',
    '',
    '## How to cite',
    '',
    'Cite a published version of dandiset 000777 by its DOI, listed on the dandiset\'s page. Uploads go to its draft, which has no DOI.',
    '',
    '## Analysis code',
    '',
    '- https://github.com/maracbaylis/four-choice-example',
    '',
  ].join('\n'))
})

test('without a description or analysis code, those lines are left out', () => {
  const readme = dandisetReadme({ name: 'X', dandisetId: '1', dandisetUrl: 'u', protocol: { name: 'P' }, originalName: 'a.xlsx', folder: 'f' })
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

test('a zip keeps its name and every entry byte for byte, folders included; the README is listed first', async () => {
  const upload = zipSync({ 'cohort/': new Uint8Array(), 'cohort/a.xlsx': strToU8('a'), 'cohort/protocol.pdf': strToU8('p') })
  const packed = await withReadme(new File([upload], 'cohort.zip'), README)
  assert.equal(packed.name, 'cohort.zip')
  const entries = await unpack(packed)
  assert.deepEqual(Object.keys(entries), ['README.md', 'cohort/', 'cohort/a.xlsx', 'cohort/protocol.pdf'])
  assert.equal(strFromU8(entries['cohort/a.xlsx']), 'a')
  // Everything before the old table of contents is copied, not recompressed.
  const cdOffset = new DataView(upload.buffer).getUint32(upload.length - 6, true)
  assert.deepEqual(new Uint8Array(await packed.slice(0, cdOffset).arrayBuffer()), upload.slice(0, cdOffset))
})

test('a README.md already in the zip is replaced by ours; the other files stay', async () => {
  const upload = zipSync({ 'README.md': strToU8('the lab\'s own notes'), 'a.xlsx': strToU8('a') })
  const entries = await unpack(await withReadme(new File([upload], 'x.zip'), README))
  assert.deepEqual(Object.keys(entries), ['README.md', 'a.xlsx'])
  assert.equal(strFromU8(entries['README.md']), README)
})

test('the same file and README always give the same bytes, so a retry gets the same checksum', async () => {
  const bytes = async () => new Uint8Array(await (await withReadme(new File(['sheet'], 'a.xlsx', { lastModified: SAVED }), README)).arrayBuffer())
  assert.deepEqual(await bytes(), await bytes())
})

test('every file in the zip is dated when the researcher last saved theirs; one before 1980 gets 1980, the earliest a zip can hold', async () => {
  const dates = async (lastModified: number) => {
    const zip = new Uint8Array(await (await withReadme(new File(['sheet'], 'a.xlsx', { lastModified }), README)).arrayBuffer())
    const found: Date[] = []
    unzipSync(zip, { filter: (f) => { found.push(new Date(dosDate(zip, f.name))); return false } })
    return found.map((d) => d.toDateString())
  }
  assert.deepEqual(await dates(SAVED), [new Date(SAVED).toDateString(), new Date(SAVED).toDateString()])
  assert.deepEqual(await dates(0), [new Date(1980, 0, 1).toDateString(), new Date(1980, 0, 1).toDateString()])
})

test('a .zip that is not a readable zip is carried inside the new one as it is', async () => {
  const entries = await unpack(await withReadme(new File(['not a zip'], 'broken.zip'), README))
  assert.deepEqual(Object.keys(entries), ['README.md', 'broken.zip'])
  assert.equal(strFromU8(entries['broken.zip']), 'not a zip')
})
