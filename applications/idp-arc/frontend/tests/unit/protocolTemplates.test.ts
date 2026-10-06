// Protocol templates archive links (core/protocolTemplates.ts). Run: yarn test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { templatesZipHref } from '../../src/core/protocolTemplates'

test('relative archive path is served under the app base URL', () => {
  assert.equal(templatesZipHref({ templatesZipUrl: 'protocols_archives/4c.zip' }, '/'), '/protocols_archives/4c.zip')
  assert.equal(templatesZipHref({ templatesZipUrl: '/protocols_archives/4c.zip' }, '/idp'), '/idp/protocols_archives/4c.zip')
})

test('absolute archive URL is used as-is', () => {
  const url = 'https://storage.googleapis.com/maabcd/4c.zip'
  assert.equal(templatesZipHref({ templatesZipUrl: url }, '/idp/'), url)
})

test('no archive (missing, empty, or no protocol) gives null', () => {
  assert.equal(templatesZipHref({}, '/'), null)
  assert.equal(templatesZipHref({ templatesZipUrl: '' }, '/'), null)
  assert.equal(templatesZipHref(undefined, '/'), null)
})

test('every relative templatesZipUrl in protocols.json exists in public/', () => {
  const protocols = JSON.parse(readFileSync(new URL('../../src/data/protocols.json', import.meta.url), 'utf8'))
  for (const p of protocols) {
    const href = templatesZipHref(p, '/')
    if (!href || /^[a-z]+:\/\//i.test(href)) continue
    assert.ok(existsSync(new URL(`../../public${href}`, import.meta.url)), `${p.id}: public${href} is missing`)
  }
})
