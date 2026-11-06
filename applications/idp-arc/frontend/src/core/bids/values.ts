/** One cell as BIDS text (`n/a`, dates, times), and the text of a TSV or JSON file. */
import type { CellValue } from './xlsxReader'

/** A cell as one line of TSV-safe text: tabs and line breaks become spaces, 3.0 becomes 3. */
export function text(value: CellValue | undefined): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/[\t\r\n]+/g, ' ').trim()
}

/** A cell as TSV text; empty and any spelling of `N/A` become BIDS's `n/a`. */
export function tsvCell(value: CellValue | undefined): string {
  const t = text(value)
  return t === '' || /^n\/?a$/i.test(t) ? 'n/a' : t
}

/** A cell as TSV text, dates and times in a standard form; `n/a` when empty. */
export function formatted(value: CellValue, type?: 'date' | 'time', date1904?: boolean): string {
  if (type === 'date') {
    const date = sessionLabel(value, date1904)
    if (date) return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`
  }
  if (type === 'time' && typeof value === 'number' && value >= 0) {
    // The time of day only, whether or not the cell also holds a date.
    const seconds = Math.round((value - Math.floor(value)) * 86400) % 86400
    return [seconds / 3600, (seconds % 3600) / 60, seconds % 60].map((n) => String(Math.floor(n)).padStart(2, '0')).join(':')
  }
  return tsvCell(value)
}

/** The session label for a sheet's date: `20260902`, from an Excel date or written-out text. */
export function sessionLabel(value: CellValue, date1904?: boolean): string | null {
  let date: Date | null = null
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    // Excel's day count, from the workbook's date system; a time part is dropped.
    date = new Date((date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)) + Math.floor(value) * 86400000)
  } else if (typeof value === 'string') {
    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value.trim())
    const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim()) // the template's mm/dd/yyyy
    if (iso) date = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]))
    else if (us) date = new Date(Date.UTC(+us[3], +us[1] - 1, +us[2]))
  }
  if (!date || Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

/** A JSON file's text. */
export function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n'
}

/** A TSV file's text: the header, then one line per row. */
export function tsvOf(header: string[], rows: string[][]): string {
  return [header, ...rows].map((r) => r.join('\t')).join('\n') + '\n'
}
