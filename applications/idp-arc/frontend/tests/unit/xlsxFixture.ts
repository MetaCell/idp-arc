// In-memory .xlsx workbooks for the unit tests (not a test file itself).
import { strToU8, zipSync } from 'fflate'

export type Row = (string | number | null | { formula: string })[]

/** A minimal .xlsx: strings go through the shared-string table, except `inline:` ones. */
export function xlsx(sheets: Record<string, Row[]>): Uint8Array {
  const shared: string[] = []
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  const col = (i: number) => String.fromCharCode(65 + i)
  const files: Record<string, Uint8Array> = {}
  const names = Object.keys(sheets)
  names.forEach((name, n) => {
    const rows = sheets[name].map((row, r) => `<row r="${r + 1}">${row.map((v, c) => {
      const ref = `${col(c)}${r + 1}`
      if (v === null) return `<c r="${ref}" s="1"/>`
      if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`
      if (typeof v === 'object') return `<c r="${ref}" t="str"><f>${esc(v.formula)}</f><v></v></c>`
      if (v.startsWith('inline:')) return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v.slice(7))}</t></is></c>`
      shared.push(v)
      return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`
    }).join('')}</row>`).join('')
    files[`xl/worksheets/sheet${n + 1}.xml`] = strToU8(`<worksheet><cols><col min="1" max="2"/></cols><sheetData>${rows}</sheetData></worksheet>`)
  })
  files['xl/workbook.xml'] = strToU8(`<workbook><sheets>${names.map((name, n) =>
    `<sheet name="${esc(name)}" sheetId="${n + 1}" r:id="rId${n + 1}"/>`).join('')}</sheets></workbook>`)
  files['xl/_rels/workbook.xml.rels'] = strToU8(`<Relationships>${names.map((_, n) =>
    `<Relationship Id="rId${n + 1}" Target="worksheets/sheet${n + 1}.xml"/>`).join('')}</Relationships>`)
  // The first shared string as rich-text runs, the way Excel writes formatted text.
  files['xl/sharedStrings.xml'] = strToU8(`<sst>${shared.map((s, i) => i === 0 && s.length > 1
    ? `<si><r><rPr><b/></rPr><t>${esc(s.slice(0, 1))}</t></r><r><t>${esc(s.slice(1))}</t></r></si>`
    : `<si><t>${esc(s)}</t></si>`).join('')}</sst>`)
  return zipSync(files)
}

/** A four-choice Reporting Sheet: METADATA, and DISC and REV with a date, a header row and two trials. */
export function reporting(id: string | null, sex: string | null = 'M'): Uint8Array {
  // One date written out, one as Excel stores dates (days since 1899-12-30): 2026-09-03.
  const trials = (rewarded: string, date: string | number): Row[] => [
    ['SECTION 6 — Testing'],
    ['Date:', date, 'Start time:', '09:02'],
    ['Trial Type:', 'Discrimination', null, 'Rewarded:', rewarded],
    ['Trial', 'Ramekin Order\n(NW, NE, SW, SE)', 'Correct?', 'Latency (s)', 'Notes'],
    [1, 'ABCD', { formula: 'IF(B5="A","Correct","Incorrect")' }, 29, null],
    [2, 'inline:BCDA', { formula: 'IF(B6="A","Correct","Incorrect")' }, 3.5, 'tab\there\r\nnext & <ok>'],
    [3, null, null, null, null], // numbered in the template, never filled
  ]
  return xlsx({
    METADATA: [['SECTION 1 — Animal Info'], ['Animal ID: (XXX001)', id, 'Strain', 'C57BL/6'], ['Sex (M/F)', sex]],
    DISC: trials('Anise', '2026-09-02'),
    REV: trials('Cinnamon', 46268),
  })
}

/** `zip` with `name`'s compression method set to one nothing can decompress. */
export function undecodable(zip: Uint8Array, name: string): Uint8Array {
  const out = zip.slice()
  const view = new DataView(out.buffer)
  const encoded = strToU8(name)
  for (let i = 0; i < out.length - encoded.length; i++) {
    if (!encoded.every((b, j) => out[i + j] === b)) continue
    if (i >= 30 && view.getUint32(i - 30, true) === 0x04034b50) view.setUint16(i - 30 + 8, 99, true)
    if (i >= 46 && view.getUint32(i - 46, true) === 0x02014b50) view.setUint16(i - 46 + 10, 99, true)
  }
  return out
}
