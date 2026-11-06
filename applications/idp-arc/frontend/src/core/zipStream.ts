/**
 * Zips read and written without loading them into memory, so an upload of any size works (a zip
 * with videos, say). Reading goes through the zip's table of contents and slices out only the
 * entries asked for; writing builds the new zip from slices of the old one, which the browser reads
 * only when sent. ZIP64 (over 4 GB, or over 65,535 entries) is read and written.
 */
import { inflateSync } from 'fflate'

export interface ZipEntry {
  name: string
  bytes: Uint8Array
}

/** A file to put in a zip, stored as it is (no compression). */
export interface NewEntry {
  name: string
  data: Blob | Uint8Array
  date: Date
}

/** The entries `keep` accepts, decompressed; the bytes of every other entry are never read.
 *  Throws when `zip` is not a readable zip, or a kept entry can't be decompressed. */
export async function readZipEntries(zip: Blob, keep: (name: string) => boolean): Promise<ZipEntry[]> {
  const index = await readZipIndex(zip)
  if (!index) throw new Error('Not a readable zip')
  const kept: ZipEntry[] = []
  for (const entry of index.entries) {
    if (!keep(entry.name)) continue
    const local = viewOf(await bytesOf(zip.slice(entry.localOffset, entry.localOffset + 30)))
    if (local.byteLength < 30 || local.getUint32(0, true) !== LOCAL_SIG) throw new Error(`${entry.name}: no local header`)
    const start = entry.localOffset + 30 + local.getUint16(26, true) + local.getUint16(28, true)
    const raw = await bytesOf(zip.slice(start, start + entry.compressedSize))
    if (raw.length !== entry.compressedSize) throw new Error(`${entry.name}: truncated`)
    if (entry.method === 0) kept.push({ name: entry.name, bytes: raw })
    else if (entry.method === 8) kept.push({ name: entry.name, bytes: inflateSync(raw, { out: new Uint8Array(entry.size) }) })
    else throw new Error(`${entry.name}: compression method ${entry.method} is not supported`)
  }
  return kept
}

/** An entry as the table of contents lists it. */
export interface IndexEntry {
  name: string
  method: number
  compressedSize: number
  size: number
  localOffset: number
  /** Where its record sits in the table of contents: [start, end), from the table's start. */
  record: [number, number]
}

/** Where a zip's table of contents is, and what it lists. */
export interface ZipIndex {
  entries: IndexEntry[]
  names: string[]
  count: number
  cdOffset: number
  cdSize: number
  comment: Uint8Array
}

/** The zip's table of contents, read from its end; null when `zip` is not a readable zip. */
export async function readZipIndex(zip: Blob): Promise<ZipIndex | null> {
  const tailStart = Math.max(0, zip.size - (EOCD_SIZE + MAX16 + LOCATOR_SIZE))
  const tail = await bytesOf(zip.slice(tailStart))
  const view = viewOf(tail)
  let at = -1
  for (let i = tail.length - EOCD_SIZE; i >= 0; i--) {
    if (view.getUint32(i, true) === EOCD_SIG && i + EOCD_SIZE + view.getUint16(i + 20, true) === tail.length) { at = i; break }
  }
  if (at === -1) return null
  let count = view.getUint16(at + 10, true)
  let cdSize = view.getUint32(at + 12, true)
  let cdOffset = view.getUint32(at + 16, true)
  const comment = tail.slice(at + EOCD_SIZE)
  let recordsStart = tailStart + at
  // Maxed-out fields point to the ZIP64 records; a zip of exactly 65,535 entries may have none.
  const hasZip64 = at >= LOCATOR_SIZE && view.getUint32(at - LOCATOR_SIZE, true) === LOCATOR_SIG
  if ((count === MAX16 || cdSize === MAX32 || cdOffset === MAX32) && hasZip64) {
    const zip64At = Number(view.getBigUint64(at - LOCATOR_SIZE + 8, true))
    if (zip64At + ZIP64_EOCD_SIZE > zip.size) return null
    const zip64 = viewOf(await bytesOf(zip.slice(zip64At, zip64At + ZIP64_EOCD_SIZE)))
    if (zip64.getUint32(0, true) !== ZIP64_EOCD_SIG) return null
    count = Number(zip64.getBigUint64(32, true))
    cdSize = Number(zip64.getBigUint64(40, true))
    cdOffset = Number(zip64.getBigUint64(48, true))
    recordsStart = zip64At
  }
  if (cdOffset + cdSize > recordsStart) return null
  const entries = centralEntries(await bytesOf(zip.slice(cdOffset, cdOffset + cdSize)), count)
  return entries && { entries, names: entries.map((e) => e.name), count, cdOffset, cdSize, comment }
}

/** `zip` with `entry` added, in place of any entry of the same name: the other entries stay byte
 *  for byte; the new one is listed first. */
export function withEntry(zip: Blob, index: ZipIndex, entry: NewEntry & { data: Uint8Array }): Blob {
  const header = { name: encode(entry.name), crc: crc32(0, entry.data), size: entry.data.length, date: entry.date, offset: index.cdOffset }
  const local = localHeader(header)
  const central = centralHeader(header)
  const cdOffset = index.cdOffset + local.length + entry.data.length
  // The table of contents without the replaced entries' records (their bytes stay, unlisted).
  const kept = index.entries.filter((e) => e.name !== entry.name)
  const records = kept.map((e) => zip.slice(index.cdOffset + e.record[0], index.cdOffset + e.record[1]))
  const recordsSize = kept.reduce((n, e) => n + e.record[1] - e.record[0], 0)
  return new Blob([
    zip.slice(0, index.cdOffset), local, entry.data, central, ...records,
    endRecords(kept.length + 1, recordsSize + central.length, cdOffset, index.comment),
  ] as BlobPart[])
}

/** A new zip of `entries`, in that order; a Blob entry is read in chunks for its checksum only. */
export async function zipOf(entries: NewEntry[]): Promise<Blob> {
  const parts: BlobPart[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const crc = entry.data instanceof Blob ? await crcOf(entry.data) : crc32(0, entry.data)
    const size = entry.data instanceof Blob ? entry.data.size : entry.data.length
    const header = { name: encode(entry.name), crc, size, date: entry.date, offset }
    const local = localHeader(header)
    parts.push(local as BlobPart, entry.data as BlobPart)
    centrals.push(centralHeader(header))
    offset += local.length + size
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0)
  return new Blob([...parts, ...centrals, endRecords(entries.length, cdSize, offset, new Uint8Array(0))] as BlobPart[])
}

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50
const ZIP64_EOCD_SIG = 0x06064b50
const LOCATOR_SIG = 0x07064b50
const EOCD_SIZE = 22
const ZIP64_EOCD_SIZE = 56
const LOCATOR_SIZE = 20
const MAX16 = 0xffff
const MAX32 = 0xffffffff
/** General-purpose flag: names are UTF-8. */
const UTF8 = 0x0800

interface Header {
  name: Uint8Array
  crc: number
  size: number
  date: Date
  offset: number
}

function localHeader({ name, crc, size, date }: Header): Uint8Array {
  const zip64 = size >= MAX32
  const out = new Uint8Array(30 + name.length + (zip64 ? 20 : 0))
  const v = viewOf(out)
  v.setUint32(0, LOCAL_SIG, true)
  v.setUint16(4, zip64 ? 45 : 20, true)
  v.setUint16(6, UTF8, true)
  v.setUint16(8, 0, true) // stored
  v.setUint16(10, dosTime(zipDate(date)), true)
  v.setUint16(12, dosDate(zipDate(date)), true)
  v.setUint32(14, crc, true)
  v.setUint32(18, zip64 ? MAX32 : size, true)
  v.setUint32(22, zip64 ? MAX32 : size, true)
  v.setUint16(26, name.length, true)
  v.setUint16(28, zip64 ? 20 : 0, true)
  out.set(name, 30)
  if (zip64) {
    const at = 30 + name.length
    v.setUint16(at, 1, true)
    v.setUint16(at + 2, 16, true)
    v.setBigUint64(at + 4, BigInt(size), true)
    v.setBigUint64(at + 12, BigInt(size), true)
  }
  return out
}

function centralHeader({ name, crc, size, date, offset }: Header): Uint8Array {
  // ZIP64 extra: only the fields too big for their own place, in this order.
  const big = [size >= MAX32 ? size : null, size >= MAX32 ? size : null, offset >= MAX32 ? offset : null]
    .filter((n): n is number => n !== null)
  const extra = big.length ? 4 + 8 * big.length : 0
  const out = new Uint8Array(46 + name.length + extra)
  const v = viewOf(out)
  v.setUint32(0, CENTRAL_SIG, true)
  v.setUint16(4, 45, true) // made by: spec version 4.5
  v.setUint16(6, big.length ? 45 : 20, true)
  v.setUint16(8, UTF8, true)
  v.setUint16(10, 0, true) // stored
  v.setUint16(12, dosTime(zipDate(date)), true)
  v.setUint16(14, dosDate(zipDate(date)), true)
  v.setUint32(16, crc, true)
  v.setUint32(20, Math.min(size, MAX32), true)
  v.setUint32(24, Math.min(size, MAX32), true)
  v.setUint16(28, name.length, true)
  v.setUint16(30, extra, true)
  v.setUint32(42, Math.min(offset, MAX32), true)
  out.set(name, 46)
  if (big.length) {
    const at = 46 + name.length
    v.setUint16(at, 1, true)
    v.setUint16(at + 2, 8 * big.length, true)
    big.forEach((n, i) => v.setBigUint64(at + 4 + 8 * i, BigInt(n), true))
  }
  return out
}

/** The end-of-zip records; the ZIP64 ones too when a count, size or offset needs them. */
function endRecords(count: number, cdSize: number, cdOffset: number, comment: Uint8Array): Uint8Array {
  const zip64 = count >= MAX16 || cdSize >= MAX32 || cdOffset >= MAX32
  const out = new Uint8Array((zip64 ? ZIP64_EOCD_SIZE + LOCATOR_SIZE : 0) + EOCD_SIZE + comment.length)
  const v = viewOf(out)
  let at = 0
  if (zip64) {
    v.setUint32(0, ZIP64_EOCD_SIG, true)
    v.setBigUint64(4, BigInt(ZIP64_EOCD_SIZE - 12), true)
    v.setUint16(12, 45, true)
    v.setUint16(14, 45, true)
    v.setBigUint64(24, BigInt(count), true)
    v.setBigUint64(32, BigInt(count), true)
    v.setBigUint64(40, BigInt(cdSize), true)
    v.setBigUint64(48, BigInt(cdOffset), true)
    v.setUint32(56, LOCATOR_SIG, true)
    v.setBigUint64(64, BigInt(cdOffset + cdSize), true)
    v.setUint32(72, 1, true)
    at = ZIP64_EOCD_SIZE + LOCATOR_SIZE
  }
  v.setUint32(at, EOCD_SIG, true)
  v.setUint16(at + 8, Math.min(count, MAX16), true)
  v.setUint16(at + 10, Math.min(count, MAX16), true)
  v.setUint32(at + 12, Math.min(cdSize, MAX32), true)
  v.setUint32(at + 16, Math.min(cdOffset, MAX32), true)
  v.setUint16(at + 20, comment.length, true)
  out.set(comment, at + EOCD_SIZE)
  return out
}

/** The entries in a table of contents, or null when it isn't `count` well-formed records. */
function centralEntries(cd: Uint8Array, count: number): IndexEntry[] | null {
  const v = viewOf(cd)
  const entries: IndexEntry[] = []
  let at = 0
  for (let i = 0; i < count; i++) {
    if (at + 46 > cd.length || v.getUint32(at, true) !== CENTRAL_SIG) return null
    const nameLength = v.getUint16(at + 28, true)
    const extraStart = at + 46 + nameLength
    const extraEnd = extraStart + v.getUint16(at + 30, true)
    const next = extraEnd + v.getUint16(at + 32, true)
    if (next > cd.length) return null
    // Names are UTF-8 when flagged, else the old DOS code page (read as Latin-1, as fflate does).
    const decoder = new TextDecoder(v.getUint16(at + 8, true) & UTF8 ? 'utf-8' : 'latin1')
    let size = v.getUint32(at + 24, true)
    let compressedSize = v.getUint32(at + 20, true)
    let localOffset = v.getUint32(at + 42, true)
    // ZIP64 extra: the fields too big for their own place, in this order.
    for (let e = extraStart; e + 4 <= extraEnd; e += 4 + v.getUint16(e + 2, true)) {
      if (v.getUint16(e, true) !== 1) continue
      let f = e + 4
      const next64 = () => { const n = f + 8 <= extraEnd ? Number(v.getBigUint64(f, true)) : NaN; f += 8; return n }
      if (size === MAX32) size = next64()
      if (compressedSize === MAX32) compressedSize = next64()
      if (localOffset === MAX32) localOffset = next64()
    }
    if ([size, compressedSize, localOffset].some(Number.isNaN)) return null
    entries.push({ name: decoder.decode(cd.subarray(at + 46, extraStart)), method: v.getUint16(at + 10, true), compressedSize, size, localOffset, record: [at, next] })
    at = next
  }
  return at === cd.length ? entries : null
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

/** CRC-32 of `data`, continuing from `crc` (0 to start). */
function crc32(crc: number, data: Uint8Array): number {
  let c = ~crc
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return ~c >>> 0
}

async function crcOf(blob: Blob): Promise<number> {
  let crc = 0
  const reader = blob.stream().getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return crc
    crc = crc32(crc, value)
  }
}

function dosTime(d: Date): number {
  return (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
}

function dosDate(d: Date): number {
  return ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
}

/** `date` within what a zip entry can hold: 1980 to 2107, clamped to the nearest end. */
export function zipDate(date: Date): Date {
  const first = new Date(1980, 0, 1), last = new Date(2107, 11, 31, 23, 59, 58)
  return Number.isNaN(date.getTime()) || date < first ? first : date > last ? last : date
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}
