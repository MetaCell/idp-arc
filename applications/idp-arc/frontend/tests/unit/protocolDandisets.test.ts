// Protocol and workspace links in a dandiset's metadata (core/dandisetLinks.ts) and the use cases
// built on them (core/use-cases/protocolDandisets.ts). Run: yarn test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  readProtocolLink, readWorkspaceLink, withProtocolLink, withWorkspaceLink, type DandisetMetadata,
} from '../../src/core/dandisetLinks'
import { createProtocolDandisetsUseCases } from '../../src/core/use-cases/protocolDandisets'
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

function fakeEmber(metadata: Record<string, DandisetMetadata>) {
  const writes: { id: string; metadata: DandisetMetadata }[] = []
  const created: { name: string; metadata?: DandisetMetadata }[] = []
  const direct: IDandiDirectApi = {
    async listOwnDandisets() { return Object.keys(metadata).map((id) => ({ id, name: `set ${id}` })) },
    async createDandiset(_t, name, m) { created.push({ name, metadata: m }); return '000900' },
    async getDraftMetadata(_t, id) { return metadata[id] ?? {} },
    async updateDraftMetadata(_t, id, m) { writes.push({ id, metadata: m }) },
    async initUpload() { throw new Error('unused') },
    async putPart() { throw new Error('unused') },
    async finalizeUpload() { throw new Error('unused') },
  }
  const uc = createProtocolDandisetsUseCases({
    emberAuth: { getToken: () => 'ember-token' }, direct, osbDomain: DEV, workspaceUrl: (id) => `https://ws/${id}`,
  })
  return { uc, writes, created }
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
