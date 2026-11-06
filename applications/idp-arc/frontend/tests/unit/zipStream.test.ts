// Zips read and written without loading them into memory (core/zipStream.ts). Run: yarn test:unit
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { strFromU8, strToU8, unzipSync, zipSync, Zip, ZipDeflate } from 'fflate'
import { readZipEntries, readZipIndex, withEntry, zipOf } from '../../src/core/zipStream'
import { undecodable } from './xlsxFixture'

const DATE = new Date(2026, 8, 2, 10, 30, 4)
const blob = (bytes: Uint8Array) => new Blob([bytes as BlobPart])
const bytesOf = async (b: Blob) => new Uint8Array(await b.arrayBuffer())

/** A zip written as a stream, the way macOS Finder writes them: each entry's sizes come after its data. */
function streamedZip(files: Record<string, Uint8Array>): Uint8Array {
  const chunks: Uint8Array[] = []
  const zip = new Zip((error, data) => { if (error) throw error; chunks.push(data) })
  for (const [name, bytes] of Object.entries(files)) {
    const entry = new ZipDeflate(name, { level: 6 })
    zip.add(entry)
    entry.push(bytes, true)
  }
  zip.end()
  return new Uint8Array(chunks.flatMap((c) => [...c]))
}

test('readZipEntries returns only the entries asked for, decompressed', async () => {
  const zip = zipSync({ 'c/a.xlsx': strToU8('workbook'), 'c/p.pdf': strToU8('pdf'), 'c/v.mp4': new Uint8Array(5000) })
  const kept = await readZipEntries(blob(zip), (name) => !name.endsWith('.mp4'))
  assert.deepEqual(kept.map((e) => [e.name, strFromU8(e.bytes)]), [['c/a.xlsx', 'workbook'], ['c/p.pdf', 'pdf']])
})

test('an entry not asked for is never decompressed, so even one no decoder reads passes through', async () => {
  const zip = undecodable(zipSync({ 'v.mp4': [new Uint8Array(5000), { level: 0 }], 'a.xlsx': strToU8('workbook') }), 'v.mp4')
  assert.deepEqual((await readZipEntries(blob(zip), (n) => n === 'a.xlsx')).map((e) => e.name), ['a.xlsx'])
  await assert.rejects(readZipEntries(blob(zip), () => true))
})

test('a zip written as a stream (sizes after each entry, as macOS Finder writes) is read', async () => {
  const zip = streamedZip({ 'v.mp4': new Uint8Array(70000).map((_, i) => i * 7), 'a.xlsx': strToU8('workbook') })
  assert.ok(new DataView(zip.buffer).getUint16(6, true) & 8, 'the fixture has data descriptors')
  const kept = await readZipEntries(blob(zip), (n) => n === 'a.xlsx')
  assert.equal(strFromU8(kept[0].bytes), 'workbook')
  assert.deepEqual((await readZipIndex(blob(zip)))?.names, ['v.mp4', 'a.xlsx'])
})

test('readZipEntries throws on something that is not a zip', async () => {
  await assert.rejects(readZipEntries(blob(strToU8('not a zip')), () => true))
})

test('readZipIndex lists the names, and is null for anything that is not a readable zip', async () => {
  const zip = zipSync({ 'a/': new Uint8Array(), 'a/b.txt': strToU8('b') })
  assert.deepEqual((await readZipIndex(blob(zip)))?.names, ['a/', 'a/b.txt'])
  assert.equal(await readZipIndex(blob(strToU8('not a zip at all, but long enough to scan'))), null)
  assert.equal(await readZipIndex(blob(zip.slice(0, zip.length - 3))), null)
})

test('withEntry adds a file to a zip, comment kept; the result reads with fflate', async () => {
  const zip = zipSync({ 'a.txt': strToU8('a') }, { comment: 'the lab\'s comment' } as never)
  const index = (await readZipIndex(blob(zip)))!
  const out = await bytesOf(withEntry(blob(zip), index, { name: 'README.md', data: strToU8('hello'), date: DATE }))
  const entries = unzipSync(out)
  assert.deepEqual(Object.keys(entries), ['README.md', 'a.txt'])
  assert.equal(strFromU8(entries['README.md']), 'hello')
  assert.deepEqual((await readZipIndex(blob(out)))?.comment, index.comment)
})

test('past 65,535 entries the zip gets ZIP64 records, and still reads', async () => {
  const files: Record<string, Uint8Array> = {}
  for (let i = 0; i < 65535; i++) files[`f${i}`] = new Uint8Array(0)
  const zip = zipSync(files, { level: 0 })
  const index = (await readZipIndex(blob(zip)))!
  assert.equal(index.count, 65535)
  const out = withEntry(blob(zip), index, { name: 'README.md', data: strToU8('hello'), date: DATE })
  const reread = (await readZipIndex(out))!
  assert.equal(reread.count, 65536)
  assert.equal(reread.names[0], 'README.md')
  assert.equal(strFromU8(unzipSync(await bytesOf(out), { filter: (f) => f.name === 'README.md' })['README.md']), 'hello')
})

test('zipOf stores each file as it is, a Blob read only for its checksum', async () => {
  const out = await zipOf([{ name: 'README.md', data: strToU8('hello'), date: DATE }, { name: 'ünïcode name.xlsx', data: blob(strToU8('sheet')), date: DATE }])
  const entries = unzipSync(await bytesOf(out))
  assert.deepEqual(Object.keys(entries), ['README.md', 'ünïcode name.xlsx'])
  assert.equal(strFromU8(entries['ünïcode name.xlsx']), 'sheet')
})
