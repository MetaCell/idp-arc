// What IDP actually sends: to OSB's /dandi upload endpoints (infra/emberUploadApiClient.ts) and to
// EMBER-DANDI when publishing (infra/emberDandiDirectClient.ts). Run: yarn test:unit
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { EmberUploadApiClient } from '../../src/infra/emberUploadApiClient'
import { EmberDandiDirectClient } from '../../src/infra/emberDandiDirectClient'

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

/** Replaces fetch: records each request and answers with `reply`. */
function recordFetch(reply: (url: string) => { status?: number; json?: unknown }) {
  const requests: { url: string; method?: string; headers: Record<string, string>; body?: unknown }[] = []
  globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
    requests.push({
      url, method: init.method, headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
    })
    const r = reply(url)
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200 })
  }) as typeof fetch
  return requests
}

test('the MAABCD copy asks OSB for upload URLs on its /dandi endpoint, naming the deployment and key user', async () => {
  const requests = recordFetch(() => ({ json: { dandiset_id: '000542', path: 'sub/u/f.xlsx', upload_id: 'up', parts: [{ part_number: 1, url: 'https://s3/p1' }] } }))
  const osb = new EmberUploadApiClient('https://osb/api', 'ember-dandi', 'maabcd-consortium')

  const upload = await osb.getUploadUrls('osb-token', { dandisetId: '000542', filename: 'f.xlsx', size: 10, dandiEtag: 'e-1' })

  assert.equal(requests[0].url, 'https://osb/api/dandi/get_upload_urls')
  assert.equal(requests[0].headers.Authorization, 'Bearer osb-token')
  assert.deepEqual(requests[0].body, {
    instance: 'ember-dandi', username: 'maabcd-consortium', dandiset_id: '000542', filename: 'f.xlsx', size: 10, dandi_etag: 'e-1',
  })
  assert.deepEqual(upload.parts, [{ partNumber: 1, url: 'https://s3/p1' }])
})

test('validating sends the deployment and key user too, and only the fields that apply', async () => {
  const requests = recordFetch(() => ({ json: { asset_id: 'a', asset_path: 'p', download_url: 'https://dl' } }))
  const osb = new EmberUploadApiClient('https://osb/api', 'ember-dandi', 'maabcd-consortium')

  const asset = await osb.validateUpload('osb-token', { dandisetId: '000542', path: 'sub/u/f.xlsx', blobId: 'blob-1' })

  assert.equal(requests[0].url, 'https://osb/api/dandi/validate_upload')
  assert.deepEqual(requests[0].body, {
    instance: 'ember-dandi', username: 'maabcd-consortium', dandiset_id: '000542', path: 'sub/u/f.xlsx', blob_id: 'blob-1',
  })
  assert.deepEqual(asset, { assetId: 'a', assetPath: 'p', downloadUrl: 'https://dl' })
})

test('an OSB error names the call and carries its status and message', async () => {
  recordFetch(() => ({ status: 400, json: 'instance must be one of dandi, ember-dandi' }))
  const osb = new EmberUploadApiClient('https://osb/api', 'nope', 'u')

  await assert.rejects(
    osb.getUploadUrls('t', { dandisetId: '000542', filename: 'f', size: 1, dandiEtag: 'e' }),
    /OSB get_upload_urls failed \(HTTP 400\).*instance must be one of/,
  )
})

test('publishing sends a JSON body, which newer DANDI releases require', async () => {
  const requests = recordFetch(() => ({ status: 202 }))
  const ember = new EmberDandiDirectClient('/ember-proxy')

  await ember.publishDraft('ember-token', '000777')

  assert.equal(requests[0].url, '/ember-proxy/api/dandisets/000777/versions/draft/publish/')
  assert.equal(requests[0].method, 'POST')
  assert.equal(requests[0].headers.Authorization, 'Bearer ember-token')
  assert.equal(requests[0].headers['Content-Type'], 'application/json')
  assert.deepEqual(requests[0].body, {})
})

test('a version\'s status separates files EMBER is still checking from real problems', async () => {
  const requests = recordFetch(() => ({
    json: {
      status: 'Valid',
      version_validation_errors: [{ field: 'assetsSummary', message: 'A Dandiset containing no files or zero bytes is not publishable' }],
      asset_validation_errors: [
        { field: '', message: 'asset is currently being validated, please wait.', path: 'p/u/a.xlsx' },
        { field: 'contentSize', message: 'is required', path: 'p/u/b.xlsx' },
      ],
    },
  }))
  const ember = new EmberDandiDirectClient('/ember-proxy')

  const draft = await ember.getVersionInfo('ember-token', '000777', 'draft')

  assert.equal(requests[0].url, '/ember-proxy/api/dandisets/000777/versions/draft/info/')
  assert.deepEqual(draft, {
    version: 'draft',
    status: 'Valid',
    errors: ['assetsSummary: A Dandiset containing no files or zero bytes is not publishable', 'p/u/b.xlsx: is required'],
    filesBeingChecked: 1,
  })
})

test('the dandiset list reads as many pages as EMBER\'s count says, through the proxy', async () => {
  const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ identifier: String(from + i).padStart(6, '0') }))
  const requests = recordFetch((url) => (url.endsWith('&page=1')
    ? { json: { count: 150, results: [{ identifier: '000000', draft_version: { name: 'First' } }, ...page(1, 99)] } }
    : { json: { count: 150, results: page(100, 50) } }))
  const list = await new EmberDandiDirectClient('/ember-proxy').listOwnDandisets('ember-token')

  assert.equal(list.length, 150)
  assert.deepEqual(list[0], { id: '000000', name: 'First' })
  assert.deepEqual(list.at(-1), { id: '000149', name: '000149' })
  assert.equal(requests.length, 2)
  assert.ok(requests.every((r) => r.url.startsWith('/ember-proxy/api/dandisets/?user=me')))
  assert.match(requests[1].url, /page_size=100&page=2$/)
})

test('a search is passed to EMBER, encoded, on every page', async () => {
  const requests = recordFetch(() => ({ json: { count: 1, results: [{ identifier: '000001' }] } }))
  await new EmberDandiDirectClient('/ember-proxy').listOwnDandisets('ember-token', 'idp-protocol:four-choice-reversal')
  assert.match(requests[0].url, /&search=idp-protocol%3Afour-choice-reversal&/)
})

test('one page when the count fits in it, none more for an empty account', async () => {
  let requests = recordFetch(() => ({ json: { count: 1, results: [{ identifier: '000001' }] } }))
  await new EmberDandiDirectClient('/ember-proxy').listOwnDandisets('ember-token')
  assert.equal(requests.length, 1)

  requests = recordFetch(() => ({ json: { count: 0, results: [] } }))
  assert.deepEqual(await new EmberDandiDirectClient('/ember-proxy').listOwnDandisets('ember-token'), [])
  assert.equal(requests.length, 1)
})

test('an empty page ends the list early', async () => {
  const requests = recordFetch(() => ({ json: { count: 5000, results: [] } }))
  await new EmberDandiDirectClient('/ember-proxy').listOwnDandisets('ember-token')
  assert.equal(requests.length, 1)
})
