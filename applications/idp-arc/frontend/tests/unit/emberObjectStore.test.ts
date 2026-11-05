// The EMBER-DANDI upload (core/use-cases/emberObjectStore.ts) against in-memory ports. Run: yarn test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BIDS_WRITES_AT_ONCE, createEmberObjectStore, EMBER_SIGN_IN } from '../../src/core/use-cases/emberObjectStore'
import type { IDandiDirectApi } from '../../src/core/ports/IDandiDirectApi'
import type { IEmberUploadApi } from '../../src/core/ports/IEmberUploadApi'
import { UserFacingError } from '../../src/core/userMessages'
import { strFromU8, unzipSync } from 'fflate'
import { reporting } from './xlsxFixture'

const ORIGIN = 'https://api-dandi.example.org'
const WEB = 'https://dandi.example.org'
const WORKBOOK = reporting('ABC001')
const file = () => new File([WORKBOOK as BlobPart], 'animal 01.xlsx', { lastModified: new Date(2026, 10, 3).getTime() })
const BIDS = {
  config: { task: 'fourchoice', subjectId: { sheet: 'METADATA', label: 'Animal ID: (XXX001)' }, tables: [{ sheet: 'DISC', acq: 'discrimination', header: 'Trial' }] },
  protocol: { name: 'Four-choice' },
}
const finalizedPaths: string[] = []

function fakes(opts: { draftName?: string; accountName?: string | null; accountFails?: boolean; dedupDirect?: boolean; dedupOsb?: boolean; shortParts?: boolean; failOsbOnce?: boolean; failDirectOnce?: boolean; draft?: Record<string, string>; draftUnreadable?: boolean; slowFinalize?: boolean; failFinalizeOf?: string } = {}) {
  const calls: string[] = []
  const writes = { now: 0, most: 0 }
  const sent: Blob[] = []
  let osbFails = opts.failOsbOnce ? 1 : 0
  let directFails = opts.failDirectOnce ? 1 : 0
  const direct: IDandiDirectApi = {
    async listOwnDandisets() { return [] },
    async createDandiset() { throw new Error('created through the protocol use case') },
    async getDraftMetadata() { return opts.draftName ? { name: opts.draftName } : {} },
    async updateDraftMetadata() {},
    async getVersionInfo() { return { version: 'draft', status: 'Valid', errors: [], filesBeingChecked: 0 } },
    async publishDraft() {},
    async getLatestPublished() { return null },
    async initUpload(token, dandisetId) {
      calls.push(`direct-init:${token}:${dandisetId}`)
      if (directFails > 0) { directFails -= 1; throw new Error('EMBER initialize failed') }
      return opts.dedupDirect ? { parts: [], blobId: 'blob-1' } : { uploadId: 'up-1', parts: [{ partNumber: 1, size: 11, url: 'https://s3/direct' }] }
    },
    async putPart(url, body) { calls.push(`put:${url}`); sent.push(body); return `etag-${url.split('/').pop()}` },
    async finalizeUpload(token, input) {
      writes.most = Math.max(writes.most, ++writes.now)
      if (opts.slowFinalize) await new Promise((resolve) => setTimeout(resolve, 5))
      writes.now--
      if (input.path === opts.failFinalizeOf) throw new Error(`EMBER register failed for ${input.path}`)
      finalizedPaths.push(input.path)
      calls.push(`direct-finalize:${input.dandisetId}:${input.uploadId ?? 'dedup'}:${input.parts.map((p) => p.etag).join(',')}`)
      return { assetId: 'asset-1', assetPath: input.path }
    },
    async readDraftFile(_t, _id, path) {
      calls.push(`read:${path}`)
      if (opts.draftUnreadable) throw new Error('EMBER download of participants.tsv failed (HTTP 403)')
      return opts.draft?.[path] ?? null
    },
  }
  const osb: IEmberUploadApi = {
    async getUploadUrls(token, input) {
      calls.push(`osb-urls:${token}:${input.dandisetId}:${input.filename}:${input.dandiEtag.endsWith('-1')}`)
      if (osbFails > 0) { osbFails -= 1; throw new Error('OSB get_upload_urls failed (HTTP 503)') }
      if (opts.dedupOsb) return { dandisetId: input.dandisetId, path: 'u/x/f', parts: [], blobId: 'blob-1' }
      const parts = opts.shortParts ? [] : [{ partNumber: 1, url: 'https://s3/osb' }]
      return { dandisetId: input.dandisetId, path: 'u/x/f', uploadId: 'up-2', parts: opts.shortParts ? [...parts, { partNumber: 1, url: 'https://s3/a' }, { partNumber: 2, url: 'https://s3/b' }] : parts }
    },
    async validateUpload(token, input) {
      calls.push(`osb-validate:${input.dandisetId}:${input.blobId ?? input.parts?.map((p) => p.etag).join(',')}`)
      return { assetId: 'asset-2', assetPath: input.path, downloadUrl: 'x' }
    },
  }
  const dandisets = {
    async createForProtocol(name: string, protocol: { id: string }) { calls.push(`create:${name}:${protocol.id}`); return '000777' },
    async recordWorkspace(dandisetId: string, workspaceId: number, protocol: { id: string }) { calls.push(`record:${dandisetId}:${workspaceId}:${protocol.id}`) },
  }
  const store = (emberToken: string | null = 'ember-token') => createEmberObjectStore(
    { getToken: async () => 'osb-token' },
    {
      getToken: () => emberToken,
      getAccount: async () => {
        if (opts.accountFails) throw new Error('Could not read EMBER-DANDI account (HTTP 500).')
        return { username: 'ada', name: opts.accountName ?? null }
      },
    },
    direct, osb, dandisets, `${ORIGIN}/`, WEB,
  )
  return { calls, store, sent, writes }
}

test('uploads to the picked dandiset directly; the MAABCD copy is a separate call, through OSB', async () => {
  const { calls, store } = fakes()
  const progress: number[] = []
  const stored = await store().put({
    file: file(), protocolId: 'four-choice-reversal', userSub: 'user-1',
    bids: BIDS, dandisets: { user: '000123', maabcd: '000533' },
  }, (sent, total) => progress.push(sent / total))

  assert.deepEqual(calls.slice(0, 3), ['direct-init:ember-token:000123', 'put:https://s3/direct', 'direct-finalize:000123:up-1:etag-direct'])
  // Plain data, so it can be saved across a reload: the copy needs the etag, not the file.
  assert.deepEqual(JSON.parse(JSON.stringify(stored)), stored)
  calls.length = 0
  await store().shareWithMaabcd!(stored, '000533', file())
  assert.deepEqual(calls, ['osb-urls:osb-token:000533:animal 01.zip:true', 'put:https://s3/osb', 'osb-validate:000533:etag-osb'])
  // The run imports the researcher's own copy, from EMBER's public origin (not the browser's proxy).
  assert.equal(stored.url, `${ORIGIN}/api/assets/asset-1/download/`)
  assert.match(stored.key, /^sourcedata\/upload-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\dZ\/animal-01\.zip$/)
  assert.equal(stored.dandisetId, '000123')
  assert.equal(progress.at(-1), 1)
  assert.ok(progress.every((p, i) => i === 0 || p >= progress[i - 1]), 'progress never goes backwards')
})

test('creates the dandiset for the protocol when none was picked, and skips OSB without a MAABCD dandiset', async () => {
  const { calls, store } = fakes()
  const stored = await store().put({
    file: file(), protocolId: 'asst', userSub: 'user-1',
    bids: BIDS, dandisets: { newName: 'ASST (IDP)', protocol: { id: 'asst', name: 'ASST' }, maabcd: '' },
  })

  assert.equal(calls[0], 'create:ASST (IDP):asst')
  assert.equal(calls[1], 'direct-init:ember-token:000777')
  assert.ok(!calls.some((c) => c.startsWith('osb-')))
  // The run records its workspace in the dandiset it uploaded into.
  assert.equal(stored.dandisetId, '000777')
  await store().recordWorkspace!(stored, 42, { id: 'asst', name: 'ASST' })
  assert.equal(calls.at(-1), 'record:000777:42:asst')
})

test('deduplicated content moves no bytes and registers against the existing blob', async () => {
  const { calls, store } = fakes({ dedupDirect: true, dedupOsb: true })
  const stored = await store().put({ file: file(), protocolId: 'p', userSub: 'u', bids: BIDS, dandisets: { user: '000123', maabcd: '000533' } })
  await store().shareWithMaabcd!(stored, '000533')

  assert.ok(!calls.some((c) => c.startsWith('put:')))
  assert.ok(calls.includes('direct-finalize:000123:dedup:'))
  assert.ok(calls.includes('osb-validate:000533:blob-1'))
})

test('a part list that does not cover the file is refused before any of it is uploaded', async () => {
  const { calls, store } = fakes({ shortParts: true })
  const stored = await store().put({ file: file(), protocolId: 'p', userSub: 'u', bids: BIDS, dandisets: { user: '000123', maabcd: '000533' } })
  await assert.rejects(store().shareWithMaabcd!(stored, '000533', file()), /part URLs/)
  assert.ok(!calls.includes('put:https://s3/a'))
})

test('without an EMBER-DANDI sign-in nothing starts and the user is asked to sign in', async () => {
  const { calls, store } = fakes()
  await assert.rejects(
    store(null).put({ file: file(), protocolId: 'p', userSub: 'u', bids: BIDS, dandisets: { user: '000123' } }),
    (err: unknown) => err instanceof UserFacingError && err.message === EMBER_SIGN_IN,
  )
  assert.deepEqual(calls, [])
})

// ── Retry: carrying on from the checkpoint ───────────────────────────────────────────────────

test('a failed MAABCD copy rejects on its own; calling it again makes only that copy', async () => {
  const { calls, store } = fakes({ failOsbOnce: true })
  const stored = await store().put({ file: file(), protocolId: 'p', userSub: 'u', bids: BIDS, dandisets: { user: '000123', maabcd: '000533' } })
  await assert.rejects(store().shareWithMaabcd!(stored, '000533', file()), /503/)
  calls.length = 0

  await store().shareWithMaabcd!(stored, '000533', file())
  assert.deepEqual(calls, ['osb-urls:osb-token:000533:animal 01.zip:true', 'put:https://s3/osb', 'osb-validate:000533:etag-osb'])
})

test('without the file, the MAABCD copy works when EMBER already holds the bytes, and fails when it would need the bytes', async () => {
  const dedup = fakes({ dedupOsb: true })
  const stored = await dedup.store().put({ file: file(), protocolId: 'p', userSub: 'u', bids: BIDS, dandisets: { user: '000123', maabcd: '000533' } })
  await dedup.store().shareWithMaabcd!(stored, '000533', null)
  assert.ok(dedup.calls.includes('osb-validate:000533:blob-1'))

  const parts = fakes()
  const first = await parts.store().put({ file: file(), protocolId: 'p', userSub: 'u', bids: BIDS, dandisets: { user: '000123', maabcd: '000533' } })
  await assert.rejects(parts.store().shareWithMaabcd!(first, '000533', null), /needs the file/)
})

test('a resumed upload registers the same path, so it finds the asset rather than add one', async () => {
  const { calls, store } = fakes()
  const resume = { userDandisetId: '000123', etag: 'e', path: 'sourcedata/upload-fixed/f.zip' }
  finalizedPaths.length = 0
  await store().put({ file: file(), protocolId: 'p', userSub: 'u', bids: BIDS, dandisets: { user: '000123' }, resume })
  assert.ok(calls.includes('direct-finalize:000123:up-1:etag-direct'))
  assert.equal(finalizedPaths[0], 'sourcedata/upload-fixed/f.zip')
})

test('a retry after the own copy failed reuses the dandiset it created', async () => {
  const { calls, store } = fakes({ failDirectOnce: true })
  const checkpoints: unknown[] = []
  const input = {
    file: file(), protocolId: 'asst', userSub: 'u',
    bids: BIDS, dandisets: { newName: 'ASST (IDP)', protocol: { id: 'asst', name: 'ASST' } },
    onCheckpoint: (c: unknown) => checkpoints.push(c),
  }
  await assert.rejects(store().put(input), /initialize failed/)
  assert.equal((checkpoints.at(-1) as { userDandisetId?: string }).userDandisetId, '000777')

  const stored = await store().put({ ...input, resume: checkpoints.at(-1) as Record<string, unknown> })

  assert.equal(calls.filter((c) => c.startsWith('create:')).length, 1, 'the dandiset is created once')
  assert.equal(stored.dandisetId, '000777')
})

test('a retry with everything done makes no copy at all', async () => {
  const { calls, store } = fakes()
  const checkpoints: Record<string, unknown>[] = []
  const input = { file: file(), protocolId: 'p', userSub: 'u', bids: BIDS, dandisets: { user: '000123', maabcd: '000533' } }
  await store().put({ ...input, onCheckpoint: (c) => checkpoints.push(c as Record<string, unknown>) })
  calls.length = 0
  const stored = await store().put({ ...input, resume: checkpoints.at(-1) })

  assert.deepEqual(calls, [])
  assert.equal(stored.url, `${ORIGIN}/api/assets/asset-1/download/`)
})


test('what goes up is the file zipped with a README linking the dandiset; the MAABCD copy rebuilds the same bytes', async () => {
  const { store, sent } = fakes()
  const stored = await store().put({
    file: file(), protocolId: 'four-choice-reversal', userSub: 'user-1',
    bids: BIDS, dandisets: { user: '000123', protocol: { id: 'four-choice-reversal', name: 'Four-choice reversal digging task' } },
  })
  const uploaded = unzipSync(new Uint8Array(await sent[0].arrayBuffer()))
  assert.deepEqual(Object.keys(uploaded), ['README.md', 'animal 01.xlsx'])
  assert.deepEqual(uploaded['animal 01.xlsx'], WORKBOOK)
  assert.match(strFromU8(uploaded['README.md']), /^- Dandiset 000123: https:\/\/dandi\.example\.org\/dandiset\/000123$/m)
  // The README names the folder the upload went into.
  assert.ok(strFromU8(uploaded['README.md']).includes(`- This upload: \`${stored.key.slice(0, stored.key.lastIndexOf('/'))}/\` in that dandiset.`))
  assert.equal(stored.readme, strFromU8(uploaded['README.md']))
  assert.equal(stored.name, 'animal 01.zip')
  assert.equal(stored.size, sent[0].size)

  // Without the etag (an older checkpoint), the copy hashes the file it is given: rebuilt, it matches.
  await store().shareWithMaabcd!({ ...stored, etag: undefined }, '000533', file())
  assert.deepEqual(new Uint8Array(await sent.at(-1)!.arrayBuffer()), new Uint8Array(await sent[0].arrayBuffer()))
})

test('the upload goes to sourcedata/, the tables made from it beside it; a retry skips what is done', async () => {
  const { reporting } = await import('./xlsxFixture')
  const { calls, store } = fakes({ dedupDirect: true })
  finalizedPaths.length = 0
  const bids = {
    config: {
      task: 'fourchoice',
      subjectId: { sheet: 'METADATA', label: 'Animal ID: (XXX001)' },
      sessionDate: { label: 'Date:' },
      tables: [{ sheet: 'DISC', acq: 'discrimination', header: 'Trial' }, { sheet: 'REV', acq: 'reversal', header: 'Trial' }],
    },
    protocol: { name: 'Four-choice', description: 'Mice dig.' },
  }
  const workbook = new File([reporting('ABC001') as BlobPart], 'Lab_ABC001.xlsx')
  const checkpoints: Record<string, unknown>[] = []
  const written_: string[] = []
  const stored = await store().put({
    file: workbook, protocolId: 'four-choice-reversal', userSub: 'user-1',
    dandisets: { user: '000123', newName: 'My cohort' }, bids,
    onCheckpoint: (c) => checkpoints.push(c as Record<string, unknown>),
    onBidsProgress: (written, total) => written_.push(`${written}/${total}`),
  })

  // OSB imports the upload (with its README) from sourcedata/, so the run is unchanged.
  assert.match(stored.key, /^sourcedata\/upload-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\dZ\/Lab_ABC001\.zip$/)
  assert.deepEqual(finalizedPaths.slice(1), [
    'sub-ABC001/ses-20260902/beh/sub-ABC001_ses-20260902_task-fourchoice_acq-discrimination_beh.tsv',
    'sub-ABC001/ses-20260903/beh/sub-ABC001_ses-20260903_task-fourchoice_acq-reversal_beh.tsv',
    'task-fourchoice_acq-discrimination_beh.json',
    'task-fourchoice_acq-reversal_beh.json',
    'dataset_description.json',
    'README.md',
  ])
  assert.equal(calls.filter((c) => c.startsWith('direct-finalize')).length, 7)
  // Each BIDS file written is reported, so the step shows it moving after the file itself is up.
  assert.deepEqual(written_, ['0/6', '1/6', '2/6', '3/6', '4/6', '5/6', '6/6'])

  // A retry from the last checkpoint registers nothing again.
  finalizedPaths.length = 0
  written_.length = 0
  await store().put({ file: workbook, protocolId: 'four-choice-reversal', userSub: 'user-1', dandisets: { user: '000123' }, bids, resume: checkpoints.at(-1),
    onBidsProgress: (written, total) => written_.push(`${written}/${total}`) })
  assert.deepEqual(finalizedPaths, [])
  assert.deepEqual(written_, ['6/6'])

  // A sheet the conversion can't use stops the upload, saying why, before any table goes up.
  const blank = new File([reporting(null) as BlobPart], 'blank.xlsx')
  await assert.rejects(
    store().put({ file: blank, protocolId: 'four-choice-reversal', userSub: 'user-1', dandisets: { user: '000123' }, bids }),
    (e: unknown) => e instanceof UserFacingError && /Animal ID: \(XXX001\)" on the METADATA sheet is empty/.test(e.message),
  )
})

test('the BIDS dataset\'s author is the EMBER-DANDI account\'s name; the OSB name only when the account has none', async () => {
  const { reporting } = await import('./xlsxFixture')
  const authorsFor = async (opts: Parameters<typeof fakes>[0]) => {
    const { sent, store } = fakes(opts)
    await store().put({
      file: new File([reporting('ABC001') as BlobPart], 'Lab_ABC001.xlsx'), protocolId: 'four-choice-reversal', userSub: 'user-1',
      dandisets: { user: '000123', newName: 'Four-choice' },
      bids: {
        config: { task: 'fourchoice', subjectId: { sheet: 'METADATA', label: 'Animal ID: (XXX001)' }, tables: [{ sheet: 'DISC', acq: 'discrimination', header: 'Trial' }] },
        protocol: { name: 'Four-choice' },
        authors: ['Osb Name'],
      },
    })
    const texts = await Promise.all(sent.map((b) => b.text()))
    return texts.map((t) => { try { return JSON.parse(t) } catch { return null } }).find((j) => j?.BIDSVersion).Authors
  }
  assert.deepEqual(await authorsFor({ accountName: ' Ada Lovelace ' }), ['Ada Lovelace'])
  assert.deepEqual(await authorsFor({ accountName: null }), ['Osb Name'])
  assert.deepEqual(await authorsFor({ accountName: '  ' }), ['Osb Name'])
  assert.deepEqual(await authorsFor({ accountFails: true }), ['Osb Name'])
})

test('the BIDS dataset is named after the dandiset itself, not the protocol, when uploading into an existing one', async () => {
  const { reporting } = await import('./xlsxFixture')
  const { sent, store } = fakes({ draftName: 'Lab cohort 2026' })
  await store().put({
    file: new File([reporting('ABC001') as BlobPart], 'Lab_ABC001.xlsx'), protocolId: 'four-choice-reversal', userSub: 'user-1',
    dandisets: { user: '000123', newName: 'Four-choice' },
    bids: {
      config: { task: 'fourchoice', subjectId: { sheet: 'METADATA', label: 'Animal ID: (XXX001)' }, tables: [{ sheet: 'DISC', acq: 'discrimination', header: 'Trial' }] },
      protocol: { name: 'Four-choice' },
    },
  })
  const texts = await Promise.all(sent.map((b) => b.text()))
  const description = texts.map((t) => { try { return JSON.parse(t) } catch { return null } }).find((j) => j?.BIDSVersion)
  assert.equal(description.Name, 'Lab cohort 2026')
})

test('a re-upload merges participants.tsv with the draft\'s: earlier animals stay, the same animal takes the new row', async () => {
  const { reporting } = await import('./xlsxFixture')
  const upload = (opts: Parameters<typeof fakes>[0]) => {
    const { calls, sent, store } = fakes(opts)
    finalizedPaths.length = 0
    const put = store().put({
      file: new File([reporting('ABC001') as BlobPart], 'Lab_ABC001.xlsx'), protocolId: 'four-choice-reversal', userSub: 'user-1',
      dandisets: { user: '000123' },
      bids: {
        config: { task: 'fourchoice', subjectId: { sheet: 'METADATA', label: 'Animal ID: (XXX001)' }, sex: { sheet: 'METADATA', label: 'Sex (M/F)' }, tables: [{ sheet: 'DISC', acq: 'discrimination', header: 'Trial' }], participants: { species: 'mus musculus', fields: [] } },
        protocol: { name: 'Four-choice' },
      },
    })
    return { calls, put, contentOf: async (path: string) => sent[finalizedPaths.indexOf(path)].text() }
  }
  const { calls, put, contentOf } = upload({ draft: {
    'participants.tsv': 'participant_id\tspecies\tsex\nsub-ABC009\tmus musculus\tfemale\nsub-ABC001\tmus musculus\tfemale\n',
    'participants.json': '{ "extra": { "Description": "From an earlier upload." } }',
  } })
  await put
  assert.equal(await contentOf('participants.tsv'), 'participant_id\tspecies\tsex\nsub-ABC009\tmus musculus\tfemale\nsub-ABC001\tmus musculus\tM\n')
  assert.deepEqual(JSON.parse(await contentOf('participants.json')).extra, { Description: 'From an earlier upload.' })
  // participants.tsv is read first for the Animal ID check; only the merged files are read back, the tables are replaced.
  const reads = calls.filter((c) => c.startsWith('read:'))
  assert.equal(reads[0], 'read:participants.tsv')
  assert.deepEqual(reads.slice(1).sort(), ['read:participants.json', 'read:participants.tsv', 'read:task-fourchoice_acq-discrimination_beh.json'])

  // The draft's copy can't be read: stop, rather than overwrite the earlier animals.
  const unreadable = upload({ draftUnreadable: true })
  await assert.rejects(unreadable.put, /download of participants\.tsv failed/)
  assert.ok(!finalizedPaths.includes('participants.tsv'))

  // The same animal in other upper/lower case: stopped before anything is written.
  const cased = upload({ draft: { 'participants.tsv': 'participant_id\tspecies\tsex\nsub-abc001\tmus musculus\tM\n' } })
  await assert.rejects(cased.put, /Animal ID ABC001 is already in this dandiset as abc001\. Write it abc001/)
  assert.ok(!cased.calls.some((c) => c.startsWith('direct-init')))
})

test('BIDS files are written a few at a time, never more than BIDS_WRITES_AT_ONCE', async () => {
  const { store, writes } = fakes({ dedupDirect: true, slowFinalize: true })
  const two = { ...BIDS, config: { ...BIDS.config, tables: [...BIDS.config.tables, { sheet: 'REV', acq: 'reversal', header: 'Trial' }] } }
  const written: string[] = []
  await store().put({ file: file(), protocolId: 'p', userSub: 'u', bids: two, dandisets: { user: '000123' },
    onBidsProgress: (n, total) => written.push(`${n}/${total}`) })
  assert.equal(writes.most, BIDS_WRITES_AT_ONCE)
  // Progress still counts up one by one, whichever write finishes first.
  assert.deepEqual(written, ['0/6', '1/6', '2/6', '3/6', '4/6', '5/6', '6/6'])
})

test('a failed BIDS write starts no new one; the running ones finish, then it fails; a retry writes only the rest', async () => {
  // Six files, four at a time: the first fails while three others run; the last two never start.
  const failing = 'sub-ABC001/ses-20260902/beh/sub-ABC001_ses-20260902_task-fourchoice_acq-discrimination_beh.tsv'
  const two = { ...BIDS, config: { ...BIDS.config, sessionDate: { label: 'Date:' }, tables: [...BIDS.config.tables, { sheet: 'REV', acq: 'reversal', header: 'Trial' }] } }
  const { store, writes } = fakes({ dedupDirect: true, slowFinalize: true, failFinalizeOf: failing })
  const checkpoints: Record<string, unknown>[] = []
  const input = { file: file(), protocolId: 'p', userSub: 'u', bids: two, dandisets: { user: '000123' } }
  finalizedPaths.length = 0
  await assert.rejects(store().put({ ...input, onCheckpoint: (c) => checkpoints.push(c as Record<string, unknown>) }), /register failed/)
  assert.equal(writes.now, 0, 'nothing still running once it fails')
  assert.deepEqual(writes.most, BIDS_WRITES_AT_ONCE)
  const done = checkpoints.at(-1)!.bidsDone as string[]
  assert.equal(done.length, 3, 'the three running beside the failure finished')
  assert.ok(!finalizedPaths.includes('dataset_description.json') && !finalizedPaths.includes('README.md'), 'no write started after the failure')

  const retry = fakes({ dedupDirect: true })
  finalizedPaths.length = 0
  await retry.store().put({ ...input, resume: checkpoints.at(-1) })
  // The upload itself is done; only the three BIDS files not yet written go up.
  assert.deepEqual(finalizedPaths.sort(), [failing, 'README.md', 'dataset_description.json'].sort())
})
