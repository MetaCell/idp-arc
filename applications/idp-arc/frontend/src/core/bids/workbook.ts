/** Step 2: one workbook into its animal, its participants and phenotype rows, and a table per stage. */
import { readWorkbook, type Workbook } from './xlsxReader'
import type { BidsConfig, Run, Subject } from './config'
import type { InputFile } from './upload'
import { findLabel, labelValue, sidewaysRow, tableInfo, tableToTsv } from './sheet'
import { formatted, json, sessionLabel, text, tsvCell } from './values'

/** One workbook: its subject, participants row, phenotype rows and tables. */
export function addWorkbook(run: Run, input: InputFile) {
  let workbook: Workbook
  try {
    workbook = readWorkbook(input.bytes)
  } catch {
    run.report.error(`${input.name} could not be read as an Excel workbook.`)
    return
  }
  const { subjectId } = run.config
  // Other spreadsheets (a weight log, a blank template) travel in sourcedata/ only.
  if (!workbook.has(subjectId.sheet) || findLabel(workbook.get(subjectId.sheet)!, subjectId.label) === undefined) return
  const subject = readSubject(run, input.name, workbook)
  if (!subject) return
  run.subjects.push(subject)
  addParticipant(run, subject, workbook)
  addPhenotypes(run, input.name, subject.id, workbook)
  for (const table of run.config.tables) addTable(run, input.name, subject.id, workbook, table)
}

/** The workbook's subject: its ID (which must be new) and sex, with the metadata rules checked. */
export function readSubject(run: Run, file: string, workbook: Workbook): Subject | null {
  const { config, report } = run
  const rawId = labelValue(workbook, config.subjectId)
  if (rawId === null) {
    report.error(`${file}: "${config.subjectId.label}" on the ${config.subjectId.sheet} sheet is empty.`)
    return null
  }
  const id = String(rawId).replace(/[^A-Za-z0-9]/g, '')
  if (!id) {
    report.error(`${file}: Animal ID "${rawId}" has no letters or digits.`)
    return null
  }
  // BIDS labels must not differ only in case.
  const same = run.subjects.find((s) => s.id.toLowerCase() === id.toLowerCase())
  if (same) {
    report.error(same.id === id
      ? `${file} and ${same.source} both have Animal ID ${id}.`
      : `${file} (Animal ID ${id}) and ${same.source} (${same.id}) have the same Animal ID apart from upper/lower case.`)
    return null
  }

  const subject: Subject = { id, source: file }
  const sex = config.sex ? text(labelValue(workbook, config.sex)) : ''
  if (sex) subject.sex = sex
  return subject
}

/** The animal's participants.tsv row: species, sex, and the configured METADATA cells. */
export function addParticipant(run: Run, subject: Subject, workbook: Workbook) {
  const participants = run.config.participants
  if (!participants) return
  run.participantRows.push([`sub-${subject.id}`, ...(participants.species ? [participants.species] : []),
    tsvCell(subject.sex),
    ...participants.fields.map((f) => formatted(labelValue(workbook, f), f.type, workbook.date1904))])
}

/** The animal's row in each phenotype table, from its sideways sheet (WEIGHT). */
export function addPhenotypes(run: Run, file: string, id: string, workbook: Workbook) {
  for (const table of run.config.phenotype ?? []) {
    const read = sidewaysRow(workbook.get(table.sheet), table.header, table.fields, workbook.date1904)
    if (!read) {
      run.report.warn(`${file}, ${table.sheet} sheet: no "${table.header}" row; left out of phenotype/${table.name}.tsv.`)
      continue
    }
    // Columns are the union across workbooks; a column a workbook lacks is `n/a`.
    const found = run.phenotypeRows.get(table.name) ?? { columns: [], rows: [] }
    for (const column of read.columns) {
      if (found.columns.includes(column)) continue
      found.columns.push(column)
      for (const row of found.rows) row.push('n/a')
    }
    found.rows.push([`sub-${id}`, ...found.columns.map((c) => read.values[read.columns.indexOf(c)] ?? 'n/a')])
    run.phenotypeRows.set(table.name, found)
  }
}

/** One configured sheet as `sub-<id>/ses-<date>/beh/..._acq-<acq>_beh.tsv`, its cells as they are. */
export function addTable(run: Run, file: string, id: string, workbook: Workbook, table: BidsConfig['tables'][number]) {
  const { config, report } = run
  const rows = workbook.get(table.sheet)
  const where = `${file}, ${table.sheet} sheet`
  // A missing tab or header row is the researcher's to get right: that stage is simply left out.
  if (!rows) return
  const headerRow = rows.findIndex((r) => text(r[0]) === table.header)
  if (headerRow === -1) return
  const converted = tableToTsv(rows, headerRow, table.filledBy, config.skipColumns)
  if (!converted) return report.warn(`${where}: no rows filled in; left out.`)

  let ses = ''
  if (config.sessionDate) {
    const date = sessionLabel(labelValue(workbook, { sheet: table.sheet, label: config.sessionDate.label }), workbook.date1904)
    if (!date) return report.error(`${where}: "${config.sessionDate.label}" should be the testing date.`)
    ses = `ses-${date}`
  }
  const dir = ses ? `sub-${id}/${ses}/beh` : `sub-${id}/beh`
  const name = ['sub-' + id, ses, `task-${config.task}`, `acq-${table.acq}`, 'beh.tsv'].filter(Boolean).join('_')
  if (run.files.some((f) => f.path === `${dir}/${name}`)) return report.error(`${where}: a second ${table.acq} table for animal ${id} on the same date.`)
  run.files.push({ path: `${dir}/${name}`, content: converted.tsv })
  const info = tableInfo(rows, config.tableInfo ?? [], workbook.date1904)
  if (Object.keys(info).length) run.files.push({ path: `${dir}/${name.replace(/\.tsv$/, '.json')}`, content: json(info) })
  const known = run.columnsByAcq.get(table.acq) ?? {}
  run.columnsByAcq.set(table.acq, { ...known, ...Object.fromEntries(Object.entries(converted.columns).filter(([c]) => !(c in known))) })
}
