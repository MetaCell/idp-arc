// Protocol and workspace links in a dandiset's metadata (core/dandisetLinks.ts) and the use cases
// built on them (core/use-cases/protocolDandisets.ts). Run: yarn test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  readProtocolLink, readWorkspaceLink, withProtocolLink, withWorkspaceLink, type DandisetMetadata,
} from '../../src/core/dandisetLinks'
import { createProtocolDandisetsUseCases, DANDISET_LICENSE } from '../../src/core/use-cases/protocolDandisets'
import { RUN_SETTINGS } from '../../src/core/runSettings'
import type { IDandiDirectApi } from '../../src/core/ports/IDandiDirectApi'

const DEV = 'v2dev.opensourcebrain.org'
const FOUR = { id: 'four-choice-reversal', name: 'Four-choice reversal digging task', url: 'https://github.com/o/r' }

test('the protocol and the workspace are relatedResource entries, alongside any others', () => {
  const start: DandisetMetadata = { name: 'Mine', relatedResource: [{ identifier: 'doi:10/x', relation: 'dcite:IsCitedBy' }] }
  const linked = withWorkspaceLink(withProtocolLink(start, FOUR), DEV, 42, 'https://ws/42')

  assert.equal(readProtocolLink(linked), 'four-choice-reversal')
  assert.equal(readWorkspaceLink(linked, DEV), 42)
  const entries = linked.relatedResource as { identifier: string; schemaKey?: string }[]
  assert.deepEqual(entries.map((r) => r.identifier), ['doi:10/x', 'idp-protocol:four-choice-reversal', `osb-workspace:${DEV}:42`])
  assert.ok(entries.slice(1).every((r) => r.schemaKey === 'Resource'))
  assert.equal(linked.name, 'Mine')
})

test('relinking replaces the earlier link instead of adding a second one', () => {
  const once = withWorkspaceLink(withProtocolLink({}, FOUR), DEV, 42, 'u')
  const twice = withWorkspaceLink(withProtocolLink(once, { id: 'asst', name: 'ASST' }), DEV, 43, 'u')

  assert.equal((twice.relatedResource as unknown[]).length, 2)
  assert.equal(readProtocolLink(twice), 'asst')
  assert.equal(readWorkspaceLink(twice, DEV), 43)
})

test('a workspace link only counts in its own OSB environment', () => {
  const linked = withWorkspaceLink({}, DEV, 42, 'u')
  assert.equal(readWorkspaceLink(linked, 'opensourcebrain.org'), undefined)
})

/** `statuses`: what each draft-status read returns, in turn (the last one repeats). `versions`:
 *  what each latest-version read returns, in turn. */
function fakeEmber(metadata: Record<string, DandisetMetadata>, publishing: {
  statuses?: { status: string; errors?: string[] }[]
  versions?: ({ version: string; doi?: string; url?: string } | null)[]
} = {}) {
  const calls: string[] = []
  let statusReads = 0
  let versionReads = 0
  const writes: { id: string; metadata: DandisetMetadata }[] = []
  const created: { name: string; metadata?: DandisetMetadata }[] = []
  const direct: IDandiDirectApi = {
    async listOwnDandisets() { return Object.keys(metadata).map((id) => ({ id, name: `set ${id}` })) },
    async createDandiset(_t, name, m) { created.push({ name, metadata: m }); return '000900' },
    async getDraftMetadata(_t, id) { return metadata[id] ?? {} },
    async updateDraftMetadata(_t, id, m) { writes.push({ id, metadata: m }) },
    async getDraftStatus() {
      const all = publishing.statuses ?? [{ status: 'Valid' }]
      const s = all[Math.min(statusReads++, all.length - 1)]
      calls.push(`status:${s.status}`)
      return { status: s.status, errors: s.errors ?? [] }
    },
    async publishDraft(_t, id) { calls.push(`publish:${id}`) },
    async getLatestPublished() {
      const all = publishing.versions ?? [null]
      return all[Math.min(versionReads++, all.length - 1)]
    },
    async initUpload() { throw new Error('unused') },
    async putPart() { throw new Error('unused') },
    async finalizeUpload() { throw new Error('unused') },
  }
  const uc = createProtocolDandisetsUseCases({
    emberAuth: { getToken: () => 'ember-token' }, direct, osbDomain: DEV, workspaceUrl: (id) => `https://ws/${id}`,
  })
  return { uc, writes, created, calls }
}

test('lists only the dandisets recorded for the protocol, with the workspaces the user still has', async () => {
  const { uc } = fakeEmber({
    '000001': withWorkspaceLink(withProtocolLink({}, FOUR), DEV, 42, 'u'),
    '000002': withWorkspaceLink(withProtocolLink({}, FOUR), DEV, 99, 'u'), // workspace gone
    '000003': withProtocolLink({}, { id: 'asst', name: 'ASST' }),
    '000004': {}, // not an IDP dandiset
  })

  const list = await uc.listForProtocol('four-choice-reversal', [42, 7])

  assert.deepEqual(list, [
    { id: '000001', name: 'set 000001', workspaceId: 42 },
    { id: '000002', name: 'set 000002' },
  ])
})

test('a new dandiset is created already recorded for its protocol', async () => {
  const { uc, created } = fakeEmber({})
  assert.equal(await uc.createForProtocol('Four (IDP)', FOUR), '000900')
  assert.equal(readProtocolLink(created[0].metadata ?? {}), 'four-choice-reversal')
})

test('recording the workspace writes once, and not at all when it is already there', async () => {
  const { uc, writes } = fakeEmber({
    '000001': { name: 'set', ...withProtocolLink({}, FOUR) },
    '000002': withWorkspaceLink(withProtocolLink({}, FOUR), DEV, 42, 'u'),
  })

  await uc.recordWorkspace('000001', 42, FOUR)
  await uc.recordWorkspace('000002', 42, FOUR)

  assert.equal(writes.length, 1)
  assert.equal(writes[0].id, '000001')
  assert.equal(readWorkspaceLink(writes[0].metadata, DEV), 42)
  assert.equal(writes[0].metadata.name, 'set')
})

// ── Publishing for a DOI ─────────────────────────────────────────────────────────────────────

const fastPolls = () => { RUN_SETTINGS.publishStatusPollMs = 1 }

test('new dandisets get a license, since EMBER publishes none without one', async () => {
  const { uc, created } = fakeEmber({})
  await uc.createForProtocol('Four (IDP)', FOUR)
  assert.deepEqual(created[0].metadata?.license, DANDISET_LICENSE)
})

test('publishing waits for a valid draft, publishes, and returns the new version with its DOI', async () => {
  fastPolls()
  const { uc, calls, writes } = fakeEmber({ '000777': { name: 'Mine', license: ['spdx:CC0-1.0'] } }, {
    statuses: [{ status: 'Pending' }, { status: 'Validating' }, { status: 'Valid' }],
    versions: [
      { version: '0.260924.1156', doi: '10.60533/ember-dandi.000777/0.260924.1156' }, // before
      { version: '0.260924.1156', doi: '10.60533/ember-dandi.000777/0.260924.1156' }, // not out yet
      { version: '0.261010.1200', doi: '10.60533/ember-dandi.000777/0.261010.1200', url: 'https://ember/000777/0.261010.1200' },
    ],
  })

  const published = await uc.publish('000777')

  assert.deepEqual(calls, ['status:Pending', 'status:Validating', 'status:Valid', 'publish:000777'])
  assert.equal(published?.doi, '10.60533/ember-dandi.000777/0.261010.1200')
  assert.equal(writes.length, 0, 'its own license is kept')
})

test('a dandiset without a license gets one before publishing', async () => {
  fastPolls()
  const { uc, writes } = fakeEmber({ '000777': { name: 'Mine' } }, { versions: [null, { version: '0.261010.1200', doi: 'd' }] })
  await uc.publish('000777')
  assert.deepEqual(writes, [{ id: '000777', metadata: { name: 'Mine', license: DANDISET_LICENSE } }])
})

test('an invalid draft is not published, and says why', async () => {
  fastPolls()
  const { uc, calls } = fakeEmber({ '000777': { license: ['x'] } }, { statuses: [{ status: 'Invalid', errors: ["contributor: is required"] }] })
  await assert.rejects(uc.publish('000777'), /could not be published: contributor: is required/)
  assert.ok(!calls.some((c) => c.startsWith('publish:')))
})

test('a draft unchanged since its last version returns that version instead of publishing again', async () => {
  fastPolls()
  const { uc, calls } = fakeEmber({ '000777': { license: ['x'] } }, {
    statuses: [{ status: 'Published' }], versions: [{ version: '0.261010.1200', doi: '10.60533/ember-dandi.000777/0.261010.1200' }],
  })
  assert.equal((await uc.publish('000777'))?.version, '0.261010.1200')
  assert.ok(!calls.some((c) => c.startsWith('publish:')))
})

test('stopping while EMBER validates publishes nothing', async () => {
  fastPolls()
  const { uc, calls } = fakeEmber({ '000777': { license: ['x'] } }, { statuses: [{ status: 'Pending' }] })
  let reads = 0
  assert.equal(await uc.publish('000777', () => reads++ > 2), null)
  assert.ok(!calls.some((c) => c.startsWith('publish:')))
})
