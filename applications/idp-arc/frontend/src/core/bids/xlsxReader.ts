/**
 * Reads the cell values of an .xlsx workbook: just what the BIDS conversion needs, no styles.
 *
 * Values are what the file has saved. A formula whose result was never saved (the workbook was
 * written by a script and never opened in Excel) reads as empty: formulas are never evaluated.
 * Element names may carry a namespace prefix (`<x:sheet>`), as some writers produce.
 */
import { strFromU8, unzipSync } from 'fflate'

/** A cell's saved value: text, a number (dates are Excel serial numbers), or null when empty. */
export type CellValue = string | number | null

/** Sheet name → rows → cells, both 0-based; rows and cells past the last value are left out.
 *  `date1904`: its date numbers count from 1904-01-01 (an old Mac Excel setting), not 1899-12-30. */
export type Workbook = Map<string, CellValue[][]> & { date1904?: boolean }

export function readWorkbook(bytes: Uint8Array): Workbook {
  const files = unzipSync(bytes, { filter: (f) => f.name.startsWith('xl/') && f.name.endsWith('.xml') || f.name.endsWith('.rels') })
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : '')
  const workbookXml = text('xl/workbook.xml')
  if (!workbookXml) throw new Error('Not an Excel workbook (no xl/workbook.xml)')

  const targets = new Map<string, string>()
  for (const rel of text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(rel[0], 'Id'), target = attr(rel[0], 'Target')
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`)
  }
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => textRuns(m[1]))

  const workbook: Workbook = new Map()
  if (/<(?:\w+:)?workbookPr\b[^>]*\sdate1904="(1|true)"/.test(workbookXml)) workbook.date1904 = true
  for (const sheet of workbookXml.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)) {
    const name = attr(sheet[0], 'name'), path = targets.get(attr(sheet[0], 'r:id') ?? '')
    if (name && path) workbook.set(decode(name), readSheet(text(path), shared))
  }
  return workbook
}

function readSheet(xml: string, shared: string[]): CellValue[][] {
  const rows: CellValue[][] = []
  for (const cell of xml.matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
    const ref = attr(cell[1], 'r')
    const value = cellValue(attr(cell[1], 't'), cell[2] ?? '', shared)
    if (!ref || value === null) continue
    const [col, row] = position(ref)
    ;(rows[row] ??= [])[col] = value
  }
  // Fill the gaps the sparse assignment leaves, so every row and cell reads as an array value.
  return Array.from(rows, (r) => Array.from(r ?? [], (c) => c ?? null))
}

function cellValue(type: string | undefined, body: string, shared: string[]): CellValue {
  if (type === 'inlineStr') return emptyToNull(textRuns(body))
  const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1]
  if (v === undefined || v === '') return null
  if (type === 's') return emptyToNull(shared[Number(v)] ?? '')
  if (type === 'str' || type === 'e') return emptyToNull(decode(v))
  if (type === 'b') return v === '1' ? 'TRUE' : 'FALSE'
  const n = Number(v)
  return Number.isFinite(n) ? n : decode(v)
}

/** "C10" → [2, 9]. */
function position(ref: string): [number, number] {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!m) return [0, 0]
  const col = [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
  return [col - 1, Number(m[2]) - 1]
}

/** All `<t>` text in a string item, rich-text runs included. */
function textRuns(xml: string): string {
  return [...xml.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => decode(m[1])).join('')
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1]
}

function emptyToNull(s: string): string | null {
  return s === '' ? null : s
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (whole, e: string) =>
    e[0] === '#' ? String.fromCodePoint(Number(e[1] === 'x' ? `0${e.slice(1)}` : e.slice(1))) : ENTITIES[e] ?? whole)
}
