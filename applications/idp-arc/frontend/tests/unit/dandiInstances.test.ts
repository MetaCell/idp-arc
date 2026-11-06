// The DANDI instance in use (core/dandiInstances.ts). Run: yarn test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DANDI_INSTANCES, dandiInstance, isDandiInstanceName, maabcdDandisetFor } from '../../src/core/dandiInstances'

test('EMBER-DANDI when no instance is configured', () => {
  for (const unset of [undefined, '', '  ']) {
    assert.deepEqual(dandiInstance(unset), { name: 'ember-dandi', api: 'https://api-dandi.emberarchive.org', web: 'https://dandi.emberarchive.org' })
  }
})

test('each sandbox gives its own API and web origins', () => {
  assert.deepEqual(dandiInstance(' dandi-sandbox '), { name: 'dandi-sandbox', api: 'https://api.sandbox.dandiarchive.org', web: 'https://sandbox.dandiarchive.org' })
  assert.equal(dandiInstance('ember-dandi-sandbox').api, 'https://api-dandi.sandbox.emberarchive.org')
  assert.deepEqual(Object.keys(DANDI_INSTANCES), ['ember-dandi', 'ember-dandi-sandbox', 'dandi-sandbox'])
})

test('an unknown instance name throws, naming the ones there are', () => {
  assert.throws(() => dandiInstance('dandi-sandbx'), /"dandi-sandbx".*ember-dandi, ember-dandi-sandbox, dandi-sandbox/)
  assert.throws(() => dandiInstance('dandi'), /not a DANDI instance/)
  assert.throws(() => dandiInstance('toString'), /not a DANDI instance/)
})

test('a protocol\'s MAABCD dandiset is the one for the instance in use, or none', () => {
  const protocol = { maabcdAggregateDandisets: { 'ember-dandi': '000607', 'dandi-sandbox': '219158' } }
  assert.equal(maabcdDandisetFor(protocol, 'ember-dandi'), '000607')
  assert.equal(maabcdDandisetFor(protocol, 'dandi-sandbox'), '219158')
  assert.equal(maabcdDandisetFor({}, 'ember-dandi'), undefined)
})

test('every maabcdAggregateDandisets key in protocols.json is an instance, and its value six digits', () => {
  const protocols = JSON.parse(readFileSync(new URL('../../src/data/protocols.json', import.meta.url), 'utf8'))
  for (const p of protocols) {
    assert.equal('maabcdAggregateDandisetId' in p, false, `${p.id}: the field is now maabcdAggregateDandisets, by instance`)
    for (const [instance, id] of Object.entries(p.maabcdAggregateDandisets ?? {})) {
      assert.ok(isDandiInstanceName(instance), `${p.id}: "${instance}" is not a DANDI instance`)
      assert.match(id as string, /^\d{6}$/, `${p.id}: ${instance}`)
    }
  }
})

