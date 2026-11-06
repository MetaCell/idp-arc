// Spreadsheets → minimal BIDS (core/bids). Run: yarn test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { readWorkbook } from '../../src/core/bids/xlsxReader'
import { reporting, undecodable, xlsx, type Row } from './xlsxFixture'
import { convertToBids, type BidsConfig, type DatasetInfo } from '../../src/core/bids/convert'

const CONFIG: BidsConfig = {
  task: 'fourchoice',
  subjectId: { sheet: 'METADATA', label: 'Animal ID: (XXX001)' },
  sex: { sheet: 'METADATA', label: 'Sex (M/F)' },
  sessionDate: { label: 'Date:' },
  tables: [
    { sheet: 'DISC', acq: 'discrimination', header: 'Trial' },
    { sheet: 'REV', acq: 'reversal', header: 'Trial' },
  ],
}

const upload = (name: string, bytes: Uint8Array) => new File([bytes as BlobPart], name)

const tsvOf = (result: Awaited<ReturnType<typeof convertToBids>>, path: string) => {
  const f = result.files.find((x) => x.path === path)
  return typeof f?.content === 'string' ? f.content : undefined
}

test('reads shared, rich-text and inline strings, numbers, entities; unsaved formulas are empty', async () => {
  const wb = readWorkbook(reporting('ABC001'))
  assert.deepEqual([...wb.keys()], ['METADATA', 'DISC', 'REV'])
  assert.equal(wb.get('METADATA')![0][0], 'SECTION 1 — Animal Info') // rich text, joined
  const disc = wb.get('DISC')!
  assert.deepEqual(disc[4], [1, 'ABCD', null, 29])
  assert.deepEqual(disc[5], [2, 'BCDA', null, 3.5, 'tab\there\r\nnext & <ok>'])
})

test('reads a workbook whose elements carry a namespace prefix, with absolute relationship targets', async () => {
  const prefixed = (xml: Uint8Array) => {
    const files = unzipSync(xml)
    const add = (s: string) => s.replace(/<(\/?)(sst|si|t|worksheet|sheetData|row|c|v|is|workbook|sheets|sheet)\b/g, '<$1x:$2')
    for (const f of ['xl/workbook.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml']) {
      if (files[f]) files[f] = strToU8(add(strFromU8(files[f])))
    }
    files['xl/_rels/workbook.xml.rels'] = strToU8(strFromU8(files['xl/_rels/workbook.xml.rels']).replace(/Target="worksheets/g, 'Target="/xl/worksheets'))
    return zipSync(files)
  }
  const wb = readWorkbook(prefixed(reporting('ABC001')))
  assert.deepEqual([...wb.keys()], ['METADATA', 'DISC', 'REV'])
  assert.deepEqual(wb.get('DISC')![4], [1, 'ABCD', null, 29])
})

const DATASET: DatasetInfo = {
  name: 'Four-choice test',
  protocol: { name: 'Four-choice reversal digging task', description: 'Mice dig for a reward.', url: 'https://github.com/x/y' },
  license: 'CC-BY-4.0',
}

test('a workbook: a table per configured sheet in the session of its date, described once at the top', async () => {
  const result = await convertToBids(upload('Lab_ABC001.xlsx', reporting('ABC-001')), CONFIG, DATASET)
  assert.deepEqual(result.problems, [])
  assert.deepEqual(result.subjects, [{ id: 'ABC001', sex: 'M', source: 'Lab_ABC001.xlsx' }])
  assert.deepEqual(result.files.map((f) => f.path), [
    'sourcedata/Lab_ABC001.xlsx',
    'sub-ABC001/ses-20260902/beh/sub-ABC001_ses-20260902_task-fourchoice_acq-discrimination_beh.tsv',
    'sub-ABC001/ses-20260903/beh/sub-ABC001_ses-20260903_task-fourchoice_acq-reversal_beh.tsv',
    'task-fourchoice_acq-discrimination_beh.json',
    'task-fourchoice_acq-reversal_beh.json',
    'dataset_description.json',
    'README.md',
  ])
  assert.equal(tsvOf(result, 'sub-ABC001/ses-20260902/beh/sub-ABC001_ses-20260902_task-fourchoice_acq-discrimination_beh.tsv'),
    'trial\tramekin_order\tcorrect\tlatency_s\tnotes\n'
    + '1\tABCD\tn/a\t29\tn/a\n'
    + '2\tBCDA\tn/a\t3.5\ttab here next & <ok>\n')
  assert.deepEqual(JSON.parse(tsvOf(result, 'task-fourchoice_acq-discrimination_beh.json')!), {
    TaskName: 'fourchoice',
    TaskDescription: 'Mice dig for a reward.',
    trial: { LongName: 'Trial' },
    ramekin_order: { LongName: 'Ramekin Order (NW, NE, SW, SE)' },
    correct: { LongName: 'Correct?' },
    latency_s: { LongName: 'Latency (s)', Units: 's' },
    notes: { LongName: 'Notes' },
  })
  assert.deepEqual(JSON.parse(tsvOf(result, 'dataset_description.json')!), {
    Name: 'Four-choice test', BIDSVersion: '1.10.0', DatasetType: 'raw', License: 'CC-BY-4.0',
    ReferencesAndLinks: ['https://github.com/x/y'],
    GeneratedBy: [{ Name: 'MAABCD Four-choice reversal digging task upload', Description: 'Behavioral tables copied, unchanged, from the spreadsheets in sourcedata/, in the browser.' }],
  })
  assert.match(tsvOf(result, 'README.md')!, /^# Four-choice test\n\nProtocol: Four-choice reversal digging task\n\nAnalysis code: https:\/\/github.com\/x\/y\n/)
})

test('authors, the upload\'s real path, and what the protocol says about each column', async () => {
  const columns: BidsConfig['columns'] = {
    latency_s: { Description: 'Time to choose.', Units: 's' },
    correct: { Description: 'Rewarded choice?', Levels: { Correct: 'the rewarded odor', Incorrect: 'any other' } },
  }
  const result = await convertToBids(upload('Lab ABC001 -2-.xlsx', reporting('ABC001')), { ...CONFIG, columns },
    { ...DATASET, authors: ['Ada Lovelace'], source: 'sourcedata/0b1f/Lab-ABC001-2.xlsx' })
  assert.equal(result.files[0].path, 'sourcedata/0b1f/Lab-ABC001-2.xlsx')
  const description = JSON.parse(tsvOf(result, 'dataset_description.json')!)
  assert.deepEqual(description.Authors, ['Ada Lovelace'])
  assert.equal(description.SourceDatasets, undefined)
  const sidecar = JSON.parse(tsvOf(result, 'task-fourchoice_acq-discrimination_beh.json')!)
  assert.deepEqual(sidecar.latency_s, { LongName: 'Latency (s)', Description: 'Time to choose.', Units: 's' })
  assert.deepEqual(sidecar.correct, { LongName: 'Correct?', Description: 'Rewarded choice?', Levels: { Correct: 'the rewarded odor', Incorrect: 'any other' } })
  assert.deepEqual(sidecar.trial, { LongName: 'Trial' })
})

test('the upload\'s name in sourcedata/ is clean: no spaces, no dangling dash', async () => {
  const result = await convertToBids(upload('four-choice-filled-3-animals-ABC001-003 -2-.zip', zipSync({ 'a.xlsx': reporting('ABC001') })), CONFIG, DATASET)
  assert.equal(result.files[0].path, 'sourcedata/four-choice-filled-3-animals-ABC001-003-2.zip')
})

test('PDFs in a zip are the protocol documents: kept in logs/, and named in the README', async () => {
  const zip = zipSync({
    'cohort/Lab_ABC001.xlsx': reporting('ABC001'),
    'cohort/Task Protocol.pdf': strToU8('%PDF-1.4'),
    'other/Filling Instructions.pdf': strToU8('%PDF-1.4 second'),
  })
  const result = await convertToBids(upload('cohort.zip', zip), CONFIG, DATASET)
  assert.deepEqual(result.files.filter((f) => f.path.startsWith('logs/')).map((f) => f.path), ['logs/Task-Protocol.pdf', 'logs/Filling-Instructions.pdf'])
  assert.match(tsvOf(result, 'README.md')!, /- `logs\/`: the protocol documents/)
  assert.doesNotMatch(tsvOf(await convertToBids(upload('a.xlsx', reporting('A1')), CONFIG, DATASET), 'README.md')!, /logs\//)
})

test('only workbooks and PDFs are read from a zip: anything else (a video) passes through unread', async () => {
  // No decoder reads this video's compression, so the conversion fails if it ever opens it.
  const zip = undecodable(zipSync({ 'cohort/session.mp4': [new Uint8Array(100000), { level: 0 }], 'cohort/Lab_ABC001.xlsx': reporting('ABC001') }), 'cohort/session.mp4')
  const result = await convertToBids(upload('cohort.zip', zip), CONFIG, DATASET)
  assert.deepEqual(result.problems, [])
  assert.deepEqual(result.subjects.map((s) => s.id), ['ABC001'])
  // The upload itself goes to sourcedata/ as the File, never copied into memory.
  const source = result.files.find((f) => f.path.startsWith('sourcedata/'))!
  assert.ok(source.content instanceof Blob && source.content.size === zip.length)
})

test('a workbook with an animal and a date but no trial filled in is an error, not an empty dataset', async () => {
  const blank = xlsx({
    METADATA: [['Animal ID: (XXX001)', 'X1'], ['Sex (M/F)', 'M']],
    DISC: [['Date:', '9/2/2026'], ['Trial', 'Latency (s)'], [1, null]],
    REV: [['Date:', '9/3/2026'], ['Trial', 'Latency (s)'], [1, null]],
  })
  const result = await convertToBids(upload('blank.xlsx', blank), CONFIG, DATASET)
  assert.deepEqual(result.problems.filter((p) => p.level === 'error').map((p) => p.message),
    ['No trials are filled in: every DISC, REV sheet in blank.xlsx is empty or missing.'])
})

test('without sessionDate, tables go straight under beh/', async () => {
  const { sessionDate: _, ...noSessions } = CONFIG
  const result = await convertToBids(upload('a.xlsx', reporting('A1')), noSessions, DATASET)
  assert.ok(result.files.some((f) => f.path === 'sub-A1/beh/sub-A1_task-fourchoice_acq-discrimination_beh.tsv'))
})

test('a zip: every reporting workbook is a subject; other files only go to sourcedata', async () => {
  const zip = zipSync({
    'cohort/Lab_ABC001.xlsx': reporting('ABC001'),
    'cohort/Lab_ABC002.xlsx': reporting('ABC002', 'f'),
    'cohort/Weight log.xlsx': xlsx({ WEIGHT: [['Day', 'Weight (g)'], [0, 30]] }),
    'cohort/Protocol.pdf': strToU8('%PDF-1.4'),
    '__MACOSX/cohort/._Lab_ABC001.xlsx': strToU8('junk'),
    'cohort/.DS_Store': strToU8('junk'),
    'other/Protocol.pdf': strToU8('%PDF-1.4 second'),
  })
  const result = await convertToBids(upload('cohort.zip', zip), CONFIG, DATASET)
  assert.deepEqual(result.problems, [])
  assert.deepEqual(result.subjects.map((s) => [s.id, s.sex]), [['ABC001', 'M'], ['ABC002', 'f']])
  const paths = result.files.map((f) => f.path)
  // The upload goes to sourcedata/ whole: OSB imports it from there, unpacking it as before.
  assert.deepEqual(paths.filter((p) => p.startsWith('sourcedata/')), ['sourcedata/cohort.zip'])
  assert.equal(paths.filter((p) => p.startsWith('sub-')).length, 4)
})

test('problems: empty or duplicate Animal ID, nothing usable, unreadable file; a missing sheet or header is left out quietly', async () => {
  const messages = async (bytes: Uint8Array, name = 'in.zip') =>
    (await convertToBids(upload(name, bytes), CONFIG, DATASET)).problems.map((p) => `${p.level}: ${p.message}`)

  assert.deepEqual(await messages(reporting(null), 'a.xlsx'), ['error: a.xlsx: "Animal ID: (XXX001)" on the METADATA sheet is empty.'])
  assert.deepEqual(await messages(zipSync({ 'a.xlsx': reporting('X1'), 'b.xlsx': reporting('X-1') })),
    ['error: b.xlsx and a.xlsx both have Animal ID X1.'])
  const noRev = xlsx({ METADATA: [['Animal ID: (XXX001)', 'X1'], ['Sex (M/F)', 'M']], DISC: [['Notes only']] })
  assert.deepEqual(await messages(noRev, 'n.xlsx'), ['error: No trials are filled in: every DISC, REV sheet in n.xlsx is empty or missing.'])
  const discOnly = xlsx({ METADATA: [['Animal ID: (XXX001)', 'X1']], DISC: [['Date:', '9/2/2026'], ['Trial', 'Latency (s)'], [1, 12]] })
  assert.deepEqual(await messages(discOnly, 'd.xlsx'), [])
  assert.deepEqual(await messages(zipSync({ 'notes.pdf': strToU8('%PDF') })),
    ['error: No workbook with "Animal ID: (XXX001)" on a METADATA sheet was found in in.zip.'])
  assert.deepEqual(await messages(strToU8('not a zip')), ['error: in.zip could not be opened. Is it a valid zip file?'])
  const undated = xlsx({ METADATA: [['Animal ID: (XXX001)', 'X1'], ['Sex (M/F)', 'M']], DISC: [['Date:', 'last week'], ['Trial', 'Latency (s)'], [1, 2]], REV: [['Trial', 'Latency (s)'], [1, 2]] })
  assert.deepEqual(await messages(undated, 'u.xlsx'), [
    'error: u.xlsx, DISC sheet: "Date:" should be the testing date.',
    'error: u.xlsx, REV sheet: "Date:" should be the testing date.',
  ])
})

test('a stage with no rows is left out with a warning; sex is kept as written', async () => {
  const empty = xlsx({
    METADATA: [['Animal ID: (XXX001)', 'X1'], ['Sex (M/F)', 'male']],
    DISC: [['Date:', '9/2/2026'], ['Trial', 'Latency (s)'], [1, 12]],
    REV: [['Date:', '9/3/2026'], ['Trial', 'Latency (s)'], [1, null], [2, null]],
  })
  const result = await convertToBids(upload('x.xlsx', empty), CONFIG, DATASET)
  assert.deepEqual(result.problems, [
    { level: 'warning', message: 'x.xlsx, REV sheet: no rows filled in; left out.' },
  ])
  assert.equal(result.subjects[0].sex, 'male')
  assert.ok(result.files.some((f) => f.path === 'sub-X1/ses-20260902/beh/sub-X1_ses-20260902_task-fourchoice_acq-discrimination_beh.tsv'))
  assert.ok(!result.files.some((f) => f.path.endsWith('acq-reversal_beh.tsv')))
})

test('filledBy: a row counts only when one of those columns is filled, so a template\'s prefill is left out', async () => {
  const sheet = xlsx({
    METADATA: [['Animal ID: (XXX001)', 'ABC001'], ['Sex (M/F)', 'M']],
    DISC: [['Date:', '9/2/2026'], ['Trial', 'Ramekin Order', 'Latency (s)', 'Notes'], [1, 'ABCD', 7, null], [2, 'BCDA', null, 'SKIP'], [3, 'CDAB', null, null], [4, 'DABC', null, null]],
    REV: [['Date:', '9/3/2026'], ['Trial', 'Latency (s)'], [1, 2]],
  })
  const config = { ...CONFIG, tables: [{ ...CONFIG.tables[0], filledBy: ['latency_s', 'notes'] }, CONFIG.tables[1]] }
  const result = await convertToBids(upload('f.xlsx', sheet), config, DATASET)
  assert.equal(tsvOf(result, 'sub-ABC001/ses-20260902/beh/sub-ABC001_ses-20260902_task-fourchoice_acq-discrimination_beh.tsv'),
    'trial\tramekin_order\tlatency_s\tnotes\n1\tABCD\t7\tn/a\n2\tBCDA\tn/a\tSKIP\n')
  // Without filledBy, the prefilled orders make every row count.
  assert.equal(tsvOf(await convertToBids(upload('f.xlsx', sheet), CONFIG, DATASET), 'sub-ABC001/ses-20260902/beh/sub-ABC001_ses-20260902_task-fourchoice_acq-discrimination_beh.tsv')!.split('\n').length, 6)
})

test('participants.tsv: one row per animal, species and sex, and the configured METADATA cells', async () => {
  const participants: BidsConfig['participants'] = {
    species: 'mus musculus',
    fields: [
      { column: 'strain', sheet: 'METADATA', label: 'Strain', Description: 'Strain.' },
      { column: 'dob', sheet: 'METADATA', label: 'DOB (mm/dd/yyyy)', LongName: 'Date of birth', Description: 'Date of birth.', type: 'date' },
    ],
  }
  const animal = (id: string, sex: string, strain: string | null) => xlsx({
    METADATA: [['Animal ID: (XXX001)', id], ['Sex (M/F)', sex], ['Strain', strain], ['DOB (mm/dd/yyyy)', 46199]],
    DISC: [['Date:', '9/2/2026'], ['Trial', 'Latency (s)'], [1, 3]],
    REV: [['Date:', '9/3/2026'], ['Trial', 'Latency (s)'], [1, 2]],
  })
  const result = await convertToBids(upload('c.zip', zipSync({ 'a.xlsx': animal('ABC001', 'M', 'C57BL/6'), 'b.xlsx': animal('ABC002', 'Female', null) })),
    { ...CONFIG, participants }, DATASET)
  assert.equal(tsvOf(result, 'participants.tsv'),
    'participant_id\tspecies\tsex\tstrain\tdob\n'
    + 'sub-ABC001\tmus musculus\tM\tC57BL/6\t2026-06-26\n'
    + 'sub-ABC002\tmus musculus\tFemale\tn/a\t2026-06-26\n')
  const sidecar = JSON.parse(tsvOf(result, 'participants.json')!)
  assert.deepEqual(sidecar.dob, { LongName: 'Date of birth', Description: 'Date of birth.' })
  assert.deepEqual(sidecar.sex, { Description: 'Sex of the animal, as written on the sheet.' })
  assert.match(sidecar.participant_id.Description, /^Animal ID from the METADATA sheet \("Animal ID: \(XXX001\)"\)/)
  assert.ok(!(await convertToBids(upload('a.xlsx', animal('ABC001', 'M', 'x')), CONFIG, DATASET)).files.some((f) => f.path === 'participants.tsv'))
})

test('phenotype: a sideways sheet becomes one row per animal, a group of columns per record', async () => {
  const phenotype: BidsConfig['phenotype'] = [{
    name: 'weight', sheet: 'WEIGHT', header: 'Experimental Day', description: 'Weights.',
    fields: [
      { column: 'date', label: 'Date', Description: 'Date of the weighing.', type: 'date' },
      { column: 'time', label: 'Time', Description: 'Time weighed.', type: 'time' },
      { column: 'weight', label: 'Weight (g)', Description: 'Body weight.', Units: 'g' },
    ],
  }]
  const sheet = xlsx({
    METADATA: [['Animal ID: (XXX001)', 'ABC001'], ['Sex (M/F)', 'M']],
    WEIGHT: [['Experimental Day', 'Day 0', 'Day 1'], ['Stage', 'Initial', 'Restriction'], ['Date', '8/28/2026', 46263], ['Time', 0.5, '11:10:00'], ['Weight (g)', 30, 'N/A']],
    DISC: [['Date:', '9/2/2026'], ['Trial', 'Latency (s)'], [1, 3]],
    REV: [['Date:', '9/3/2026'], ['Trial', 'Latency (s)'], [1, 2]],
  })
  const result = await convertToBids(upload('w.xlsx', sheet), { ...CONFIG, phenotype }, DATASET)
  assert.deepEqual(result.problems, [])
  assert.equal(tsvOf(result, 'phenotype/weight.tsv'),
    'participant_id\tday_0_date\tday_0_time\tday_0_weight\tday_1_date\tday_1_time\tday_1_weight\n'
    + 'sub-ABC001\t2026-08-28\t12:00:00\t30\t2026-08-29\t11:10:00\tn/a\n')
  const sidecar = JSON.parse(tsvOf(result, 'phenotype/weight.json')!)
  assert.deepEqual(sidecar.MeasurementToolMetadata, { Description: 'Weights.' })
  assert.deepEqual(sidecar.day_1_weight, { Description: 'Day 1: Body weight.', Units: 'g' })
  const noSheet = await convertToBids(upload('n.xlsx', reporting('ABC001')), { ...CONFIG, phenotype }, DATASET)
  assert.deepEqual(noSheet.problems.map((p) => p.message), ['n.xlsx, WEIGHT sheet: no "Experimental Day" row; left out of phenotype/weight.tsv.'])
})

test('cell values are not checked: whatever the sheet holds goes into the table as it is, with no warning', async () => {
  const result = await convertToBids(upload('v.xlsx', xlsx({
    METADATA: [['Animal ID: (XXX001)', 'Mouse_7'], ['Sex (M/F)', 'M']],
    DISC: [['Date:', '9/2/2026'], ['Trial', 'Ramekin Order', 'Correct?', 'Latency (s)', 'Odor Sequences'], [1, 'ABCA', 'Yes', -3, 'Error: #VALUE!'], [1, 'ABCD', 'Correct', 'fast', '#NAME?']],
    REV: [['Date:', '9/3/2026'], ['Trial', 'Latency (s)'], [1, 2]],
  })), { ...CONFIG, columns: { ramekin_order: { Description: 'Ramekin order.' } } }, DATASET)
  assert.deepEqual(result.problems, [])
  assert.equal(tsvOf(result, 'sub-Mouse7/ses-20260902/beh/sub-Mouse7_ses-20260902_task-fourchoice_acq-discrimination_beh.tsv'),
    'trial\tramekin_order\tcorrect\tlatency_s\todor_sequences\n1\tABCA\tYes\t-3\tError: #VALUE!\n1\tABCD\tCorrect\tfast\t#NAME?\n')
  // What protocols.json says about a column goes into its JSON description.
  assert.deepEqual(JSON.parse(tsvOf(result, 'task-fourchoice_acq-discrimination_beh.json')!).ramekin_order,
    { LongName: 'Ramekin Order', Description: 'Ramekin order.' })
})

test('the real 4C template archive reads: its blank reporting sheet is found, with no animal ID', async () => {
  const protocols = JSON.parse(readFileSync(new URL('../../src/data/protocols.json', import.meta.url), 'utf8'))
  const fourChoice = protocols.find((p: { id: string }) => p.id === 'four-choice-reversal')
  const zip = new Uint8Array(readFileSync(new URL('../../public/protocols_archives/4c.zip', import.meta.url)))
  const result = await convertToBids(upload('4c.zip', zip), fourChoice.bids, DATASET)
  assert.deepEqual(result.problems.map((p) => p.message),
    ['MAABCD 4C Digging Reversal Reporting Sheets.xlsx: "Animal ID: (XXX001)" on the METADATA sheet is empty.'])
  assert.deepEqual(result.files.filter((f) => f.path.startsWith('sourcedata/')).map((f) => f.path), ['sourcedata/4c.zip'])
  const reporting = unzipSync(zip)['MAABCD 4C Digging Reversal Reporting Sheets.xlsx']
  assert.deepEqual([...readWorkbook(reporting).keys()], ['METADATA', 'WEIGHT', 'ACCLIM', 'SHAPE', 'DISC', 'RECALL', 'REV', 'SUMMARY'])
})

test('every bids block in protocols.json is well formed', async () => {
  const protocols = JSON.parse(readFileSync(new URL('../../src/data/protocols.json', import.meta.url), 'utf8'))
  for (const p of protocols.filter((x: { bids?: unknown }) => x.bids)) {
    const b = p.bids as BidsConfig
    assert.match(b.task, /^[A-Za-z0-9]+$/, `${p.id}: task`)
    assert.ok(b.subjectId?.sheet && b.subjectId?.label, `${p.id}: subjectId`)
    assert.ok(b.tables.length, `${p.id}: tables`)
    for (const t of b.tables) assert.ok(t.sheet && /^[A-Za-z0-9]+$/.test(t.acq) && t.header, `${p.id}: table ${t.sheet}`)
    for (const t of b.tables) if (t.filledBy) assert.ok(t.filledBy.length && t.filledBy.every((n) => /^[a-z0-9_]+$/.test(n)), `${p.id}: ${t.sheet} filledBy`)
    if (b.sessionDate) assert.ok(b.sessionDate.label, `${p.id}: sessionDate.label`)
    assert.equal(new Set(b.tables.map((t) => t.acq)).size, b.tables.length, `${p.id}: acq labels repeat`)
  }
})

test('fileTree: folders first, then files, each level sorted', async () => {
  const { fileTree } = await import('../../src/core/bids/fileTree')
  const lines = fileTree([
    'sourcedata/b.xlsx', 'dataset_description.json', 'sub-X1/beh/sub-X1_acq-rev_beh.tsv',
    'sourcedata/a.pdf', 'sub-X1/beh/sub-X1_acq-disc_beh.tsv',
  ]).map((l) => `${'  '.repeat(l.depth)}${l.name}`)
  assert.deepEqual(lines, [
    'sourcedata/', '  a.pdf', '  b.xlsx',
    'sub-X1/', '  beh/', '    sub-X1_acq-disc_beh.tsv', '    sub-X1_acq-rev_beh.tsv',
    'dataset_description.json',
  ])
})

test('a column in skipColumns is left out of the table and its description', async () => {
  const sheet = xlsx({
    METADATA: [['Animal ID: (XXX001)', 'ABC001']],
    DISC: [['Date:', '9/2/2026'], ['Trial', 'Quadrant Chosen', 'Odor Chosen'], [1, 'NW', 'A']],
    REV: [['Date:', '9/3/2026'], ['Trial', 'Quadrant Chosen', 'Odor Chosen'], [1, 'SE', 'B']],
  })
  const result = await convertToBids(upload('a.xlsx', sheet), { ...CONFIG, skipColumns: ['quadrant_chosen'] }, DATASET)
  assert.equal(tsvOf(result, 'sub-ABC001/ses-20260902/beh/sub-ABC001_ses-20260902_task-fourchoice_acq-discrimination_beh.tsv'),
    'trial\todor_chosen\n1\tA\n')
  const sidecar = JSON.parse(tsvOf(result, 'task-fourchoice_acq-discrimination_beh.json')!)
  assert.equal(sidecar.quadrant_chosen, undefined)
  assert.ok(sidecar.trial && sidecar.odor_chosen)
})

test('tableInfo: the cells above a table go, as they are, into a JSON beside it; empty ones are left out', async () => {
  const sheet = (odors: string[]) => [
    ['Experimenter:', 'Aria', 'Start time:', 0.3763888888888889],
    ['Date:', '2026-09-02', 'End time:', null],
    ['Trial Type:', 'Discrimination', 'Rewarded:', 'Anise'],
    ['Odors:', ...odors],
    ['Trial', 'Odor Chosen'],
    [1, 'A'],
  ]
  const bytes = xlsx({
    METADATA: [['Animal ID: (XXX001)', 'ABC001']],
    DISC: sheet(['A: Anise', null, 'B: Cinnamon']),
    REV: sheet(['A: Anise', 'mint']),
  })
  const config: BidsConfig = { ...CONFIG, tableInfo: [
    { key: 'Experimenter', label: 'Experimenter:' },
    { key: 'StartTime', label: 'Start time:', type: 'time' },
    { key: 'EndTime', label: 'End time:', type: 'time' },
    { key: 'Rewarded', label: 'Rewarded:' },
    { key: 'Odors', label: 'Odors:', type: 'list' },
    { key: 'Room', label: 'Room:' },
  ] }
  const result = await convertToBids(upload('a.xlsx', bytes), config, DATASET)
  const info = (acq: string, date: string) =>
    JSON.parse(tsvOf(result, `sub-ABC001/ses-${date}/beh/sub-ABC001_ses-${date}_task-fourchoice_acq-${acq}_beh.json`)!)
  assert.deepEqual(info('discrimination', '20260902'), {
    Experimenter: 'Aria', StartTime: '09:02:00', Rewarded: 'Anise', Odors: { A: 'Anise', B: 'Cinnamon' },
  })
  // A cell not written `letter: odor` keeps the row as a list, so nothing is lost.
  assert.deepEqual(info('reversal', '20260902').Odors, ['A: Anise', 'mint'])
  assert.match(tsvOf(result, 'README.md')!, /Each table's own `\.json`: the cells above the table on its sheet \(Experimenter, Start time, End time, Rewarded, Odors, Room\)\./)
})

test('an Excel date that also holds a time stays on its own day; a time that also holds a date keeps its time of day', async () => {
  const participants: BidsConfig['participants'] = { fields: [{ column: 'dob', sheet: 'METADATA', label: 'DOB', Description: 'Date of birth.', type: 'date' }] }
  const phenotype: BidsConfig['phenotype'] = [{ name: 'weight', sheet: 'WEIGHT', header: 'Experimental Day', fields: [
    { column: 'time', label: 'Time', Description: 'Time weighed.', type: 'time' },
  ] }]
  const sheet = xlsx({
    // 2026-09-03 18:00, 2026-06-26 23:00; 2026-09-01 09:00, and a hair before midnight.
    METADATA: [['Animal ID: (XXX001)', 'ABC001'], ['DOB', 46199.96]],
    WEIGHT: [['Experimental Day', 'Day 0', 'Day 1'], ['Time', 46266.375, 0.999996]],
    DISC: [['Date:', 46268.75], ['Trial', 'Latency (s)'], [1, 3]],
  })
  const result = await convertToBids(upload('t.xlsx', sheet), { ...CONFIG, participants, phenotype, tables: [CONFIG.tables[0]] }, DATASET)
  assert.ok(result.files.some((f) => f.path.startsWith('sub-ABC001/ses-20260903/')))
  assert.match(tsvOf(result, 'participants.tsv')!, /\t2026-06-26\n$/)
  assert.equal(tsvOf(result, 'phenotype/weight.tsv'), 'participant_id\tday_0_time\tday_1_time\nsub-ABC001\t09:00:00\t00:00:00\n')
})

test('phenotype: a blank header cell shifts nothing; workbooks with different records share one table', async () => {
  const phenotype: BidsConfig['phenotype'] = [{ name: 'weight', sheet: 'WEIGHT', header: 'Experimental Day', fields: [
    { column: 'weight', label: 'Weight (g)', Description: 'Body weight.', Units: 'g' },
  ] }]
  const animal = (id: string, weight: Row[]) => xlsx({
    METADATA: [['Animal ID: (XXX001)', id]],
    WEIGHT: weight,
    DISC: [['Date:', '9/2/2026'], ['Trial', 'Latency (s)'], [1, 3]],
  })
  const zip = zipSync({
    'a.xlsx': animal('ABC001', [['Experimental Day', null, 'Day 0', 'Day 1'], ['Weight (g)', null, 20, 21]]),
    'b.xlsx': animal('ABC002', [['Experimental Day', 'Day 0', 'Day 1', 'Day 2'], ['Weight (g)', 30, 31, 32]]),
  })
  const result = await convertToBids(upload('w.zip', zip), { ...CONFIG, phenotype, tables: [CONFIG.tables[0]] }, DATASET)
  assert.deepEqual(result.problems, [])
  assert.equal(tsvOf(result, 'phenotype/weight.tsv'),
    'participant_id\tday_0_weight\tday_1_weight\tday_2_weight\nsub-ABC001\t20\t21\tn/a\nsub-ABC002\t30\t31\t32\n')
  assert.deepEqual(Object.keys(JSON.parse(tsvOf(result, 'phenotype/weight.json')!)), ['day_0_weight', 'day_1_weight', 'day_2_weight'])
})

test('a stage\'s column descriptions cover every workbook\'s columns', async () => {
  const animal = (id: string, header: string[]) => xlsx({
    METADATA: [['Animal ID: (XXX001)', id]],
    DISC: [['Date:', '9/2/2026'], header, [1, 3, 'x']],
  })
  const zip = zipSync({ 'a.xlsx': animal('ABC001', ['Trial', 'Latency (s)']), 'b.xlsx': animal('ABC002', ['Trial', 'Latency (s)', 'Error type']) })
  const result = await convertToBids(upload('c.zip', zip), { ...CONFIG, tables: [CONFIG.tables[0]] }, DATASET)
  const described = JSON.parse(tsvOf(result, 'task-fourchoice_acq-discrimination_beh.json')!)
  assert.deepEqual([described.latency_s, described.error_type], [{ LongName: 'Latency (s)', Units: 's' }, { LongName: 'Error type' }])
})

test('Animal IDs that differ only in upper/lower case are one ID twice', async () => {
  const result = await convertToBids(upload('c.zip', zipSync({ 'a.xlsx': reporting('abc001'), 'b.xlsx': reporting('ABC-001') })), CONFIG, DATASET)
  assert.deepEqual(result.problems.map((p) => p.message), ['b.xlsx (Animal ID ABC001) and a.xlsx (abc001) have the same Animal ID apart from upper/lower case.'])
})

test('a workbook on the 1904 date system: its dates read as the dates Excel shows', async () => {
  const sheet = (date1904: boolean) => {
    // 2026-09-02 is 46267 in the 1900 system, 44805 in the 1904 one.
    const files = unzipSync(xlsx({ METADATA: [['Animal ID: (XXX001)', 'ABC001']], DISC: [['Date:', date1904 ? 44805 : 46267], ['Trial', 'Latency (s)'], [1, 3]] }))
    if (date1904) files['xl/workbook.xml'] = strToU8(strFromU8(files['xl/workbook.xml']).replace('<workbook>', '<workbook><workbookPr date1904="1"/>'))
    return zipSync(files)
  }
  assert.equal(readWorkbook(sheet(true)).date1904, true)
  assert.equal(readWorkbook(sheet(false)).date1904, undefined)
  for (const date1904 of [true, false]) {
    const result = await convertToBids(upload('d.xlsx', sheet(date1904)), { ...CONFIG, tables: [CONFIG.tables[0]] }, DATASET)
    assert.ok(result.files.some((f) => f.path.startsWith('sub-ABC001/ses-20260902/')), `date1904=${date1904}`)
  }
})
