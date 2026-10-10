// The EMBER-DANDI upload (core/use-cases/emberObjectStore.ts) against in-memory ports. Run: yarn test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createEmberObjectStore, EMBER_SIGN_IN } from '../../src/core/use-cases/emberObjectStore'
import type { IDandiDirectApi } from '../../src/core/ports/IDandiDirectApi'
import type { IEmberUploadApi } from '../../src/core/ports/IEmberUploadApi'
import { UserFacingError } from '../../src/core/userMessages'

const ORIGIN = 'https://api-dandi.example.org'
const file = () => new File(['animal data'], 'animal 01.xlsx')

function fakes(opts: { dedupDirect?: boolean; dedupOsb?: boolean; shortParts?: boolean } = {}) {
  const calls: string[] = []
  const direct: IDandiDirectApi = {
    async listOwnDandisets() { return [] },
    async createDandiset() { throw new Error('created through the protocol use case') },
    async getDraftMetadata() { return {} },
    async updateDraftMetadata() {},
    async getDraftStatus() { return { status: 'Valid', errors: [] } },
    async publishDraft() {},
    async getLatestPublished() { return null },
    async initUpload(token, dandisetId) {
      calls.push(`direct-init:${token}:${dandisetId}`)
      return opts.dedupDirect ? { parts: [], blobId: 'blob-1' } : { uploadId: 'up-1', parts: [{ partNumber: 1, size: 11, url: 'https://s3/direct' }] }
    },
    async putPart(url) { calls.push(`put:${url}`); return `etag-${url.split('/').pop()}` },
    async finalizeUpload(token, input) {
      calls.push(`direct-finalize:${input.dandisetId}:${input.uploadId ?? 'dedup'}:${input.parts.map((p) => p.etag).join(',')}`)
      return { assetId: 'asset-1', assetPath: input.path }
    },
  }
  const osb: IEmberUploadApi = {
    async getUploadUrls(token, input) {
      calls.push(`osb-urls:${token}:${input.dandisetId}:${input.filename}:${input.dandiEtag.endsWith('-1')}`)
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
    async publish(dandisetId: string) { calls.push(`publish:${dandisetId}`); return { version: 'v1', doi: `doi/${dandisetId}` } },
  }
  const store = (emberToken: string | null = 'ember-token') => createEmberObjectStore(
    { getToken: async () => 'osb-token' }, { getToken: () => emberToken }, direct, osb, dandisets, `${ORIGIN}/`,
  )
  return { calls, store }
}

test('uploads to the picked dandiset directly, then to the MAABCD dandiset through OSB', async () => {
  const { calls, store } = fakes()
  const progress: number[] = []
  const stored = await store().put({
    file: file(), protocolId: 'four-choice-reversal', userSub: 'user-1',
    dandisets: { user: '000123', maabcd: '000533' },
  }, (sent, total) => progress.push(sent / total))

  assert.deepEqual(calls, [
    'direct-init:ember-token:000123',
    'put:https://s3/direct',
    'direct-finalize:000123:up-1:etag-direct',
    'osb-urls:osb-token:000533:animal 01.xlsx:true',
    'put:https://s3/osb',
    'osb-validate:000533:etag-osb',
  ])
  // The run imports the researcher's own copy, from EMBER's public origin (not the browser's proxy).
  assert.equal(stored.url, `${ORIGIN}/api/assets/asset-1/download/`)
  assert.match(stored.key, /^four-choice-reversal\/[0-9a-f-]{36}\/animal-01\.xlsx$/)
  assert.equal(stored.dandisetId, '000123')
  assert.equal(progress.at(-1), 1)
  assert.ok(progress.every((p, i) => i === 0 || p >= progress[i - 1]), 'progress never goes backwards')
})

test('creates the dandiset for the protocol when none was picked, and skips OSB without a MAABCD dandiset', async () => {
  const { calls, store } = fakes()
  const stored = await store().put({
    file: file(), protocolId: 'asst', userSub: 'user-1',
    dandisets: { newName: 'ASST (IDP)', protocol: { id: 'asst', name: 'ASST' }, maabcd: '' },
  })

  assert.equal(calls[0], 'create:ASST (IDP):asst')
  assert.equal(calls[1], 'direct-init:ember-token:000777')
  assert.ok(!calls.some((c) => c.startsWith('osb-')))
  // The run records its workspace in the dandiset it uploaded into.
  assert.equal(stored.dandisetId, '000777')
  await stored.recordWorkspace?.(42)
  assert.equal(calls.at(-1), 'record:000777:42:asst')
})

test('deduplicated content moves no bytes and registers against the existing blob', async () => {
  const { calls, store } = fakes({ dedupDirect: true, dedupOsb: true })
  await store().put({ file: file(), protocolId: 'p', userSub: 'u', dandisets: { user: '000123', maabcd: '000533' } })

  assert.ok(!calls.some((c) => c.startsWith('put:')))
  assert.ok(calls.includes('direct-finalize:000123:dedup:'))
  assert.ok(calls.includes('osb-validate:000533:blob-1'))
})

test('a part list that does not cover the file is refused before anything is uploaded', async () => {
  const { calls, store } = fakes({ shortParts: true })
  await assert.rejects(
    store().put({ file: file(), protocolId: 'p', userSub: 'u', dandisets: { user: '000123', maabcd: '000533' } }),
    /2 part URLs for a file of 1 parts/,
  )
  assert.ok(!calls.includes('put:https://s3/a'))
})

test('without an EMBER-DANDI sign-in nothing starts and the user is asked to sign in', async () => {
  const { calls, store } = fakes()
  await assert.rejects(
    store(null).put({ file: file(), protocolId: 'p', userSub: 'u', dandisets: { user: '000123' } }),
    (err: unknown) => err instanceof UserFacingError && err.message === EMBER_SIGN_IN,
  )
  assert.deepEqual(calls, [])
})

test('the stored upload publishes the dandiset it went into, for its DOI', async () => {
  const { calls, store } = fakes()
  const stored = await store().put({ file: file(), protocolId: 'p', userSub: 'u', dandisets: { user: '000123' } })
  assert.deepEqual(await stored.publish?.(() => false), { doi: 'doi/000123', url: undefined })
  assert.equal(calls.at(-1), 'publish:000123')
})
