/** Finding things on a sheet: a labelled cell, a table under its header row, a sideways sheet. */
import type { CellValue, Workbook } from './xlsxReader'
import type { BidsConfig, Field } from './config'
import { formatted, text, tsvCell } from './values'

/** Where the first cell reading exactly `label` is, top to bottom: [row, column]. */
export function findLabel(rows: CellValue[][], label: string): [number, number] | undefined {
  for (let r = 0; r < rows.length; r++) {
    const c = (rows[r] ?? []).findIndex((v) => text(v) === label)
    if (c !== -1) return [r, c]
  }
  return undefined
}

/** The cell right of `label` on `sheet`; null when absent or empty. */
export function labelValue(workbook: Workbook, at: { sheet: string; label: string }): CellValue {
  const rows = workbook.get(at.sheet) ?? []
  const found = findLabel(rows, at.label)
  if (!found) return null
  const value = rows[found[0]][found[1] + 1] ?? null
  return text(value) === '' ? null : value
}

/** The table under `headerRow`, and a description of each column from its header text. */
export function tableToTsv(rows: CellValue[][], headerRow: number, filledBy?: string[], skip: string[] = []): Table | null {
  const header = rows[headerRow]
  let width = header.findIndex((c) => text(c) === '')
  if (width === -1) width = header.length
  const headers = header.slice(0, width).map((c) => String(c ?? ''))
  const names = uniqueColumnNames(headers)
  // A row counts only if one of its `filledBy` columns is filled (default: any but the first, as
  // templates number every row).
  const marks = filledBy ? names.flatMap((n, i) => filledBy.includes(n) ? [i] : []) : names.map((_, i) => i).slice(1)
  const body = rows.slice(headerRow + 1).filter((cells) => cells && marks.some((i) => text(cells[i]) !== ''))
  if (!body.length) return null
  const kept = names.flatMap((n, i) => skip.includes(n) ? [] : [i])
  const line = (cells: string[]) => cells.join('\t')
  const tsv = [line(kept.map((i) => names[i])), ...body.map((cells) => line(kept.map((i) => tsvCell(cells[i]))))].join('\n') + '\n'
  const columns = Object.fromEntries(kept.map((i) => {
    const longName = text(headers[i])
    const units = UNITS[/\((s|sec|seconds|ms|g|mg|kg|cm|mm)\)/i.exec(headers[i].split('\n')[0])?.[1].toLowerCase() ?? '']
    return [names[i], { LongName: longName, ...(units ? { Units: units } : {}) }]
  }))
  return { tsv, columns }
}

/** A table read from a sheet: its TSV, and what its columns are. */
export interface Table {
  tsv: string
  columns: Record<string, { LongName: string; Units?: string }>
}

/** A unit written in a column header, as BIDS writes it. */
export const UNITS: Record<string, string> = { s: 's', sec: 's', seconds: 's', ms: 'ms', g: 'g', mg: 'mg', kg: 'kg', cm: 'cm', mm: 'mm' }

/** "Latency (s)" → `latency_s`; "Correct?" → `correct`; repeats get `_2`, `_3`. */
export function uniqueColumnNames(headers: string[]): string[] {
  const seen = new Map<string, number>()
  return headers.map((h, i) => {
    const base = h.split('\n')[0].toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `column_${i + 1}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}_${n}`
  })
}

/** One record per column of a sideways sheet, flattened into one row: `day_0_weight`, `day_1_weight`… */
export function sidewaysRow(rows: CellValue[][] | undefined, header: string, fields: Field[], date1904?: boolean): { columns: string[]; values: string[] } | null {
  const at = rows?.findIndex((r) => text(r?.[0]) === header) ?? -1
  if (!rows || at === -1) return null
  // Each record keeps its own column, so a blank header cell shifts nothing.
  const records = rows[at].map((c, col) => ({ name: text(c), col })).slice(1).filter((r) => r.name)
  const keys = uniqueColumnNames(records.map((r) => r.name))
  const columns: string[] = [], values: string[] = []
  keys.forEach((key, i) => {
    for (const field of fields) {
      const row = rows.slice(at + 1).find((r) => text(r?.[0]) === field.label)
      columns.push(`${key}_${field.column}`)
      values.push(formatted(row?.[records[i].col] ?? null, field.type, date1904))
    }
  })
  return { columns, values }
}

/** `day_0_weight` → ["Day 0"-like record key, the weight field]. */
export function splitColumn(column: string, fields: Field[]): [string, Field] {
  const field = fields.find((f) => column.endsWith(`_${f.column}`))!
  return [column.slice(0, -field.column.length - 1).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), field]
}

/** The `tableInfo` cells of a sheet, by key; a cell left empty is left out. */
export function tableInfo(rows: CellValue[][], fields: NonNullable<BidsConfig['tableInfo']>, date1904?: boolean): Record<string, unknown> {
  const info: Record<string, unknown> = {}
  for (const { key, label, type } of fields) {
    const found = findLabel(rows, label)
    if (!found) continue
    const [r, c] = found
    if (type === 'list') {
      const cells = (rows[r] ?? []).slice(c + 1).map((v) => text(v)).filter(Boolean)
      const pairs = cells.map((t) => /^([^:]+?)\s*:\s*(.+)$/.exec(t))
      if (cells.length) info[key] = pairs.every(Boolean) ? Object.fromEntries(pairs.map((m) => [m![1], m![2]])) : cells
    } else {
      const value = formatted(rows[r][c + 1] ?? null, type, date1904)
      if (value !== 'n/a') info[key] = value
    }
  }
  return info
}
