/**
 * A researcher's upload (an .xlsx, or a zip of them) as a BIDS dataset, in the browser.
 *
 * 1. Open the upload: its workbooks and PDFs; nothing else in a zip is read (upload.ts).
 * 2. Each PDF goes to logs/; each workbook gives its animal, participants row, phenotype row and one table per stage (workbook.ts).
 * 3. Write the files describing the whole dataset: stage JSONs, participants, phenotype, description, README (datasetFiles.ts).
 * 4. Return every file, the upload itself first (sourcedata/), with the animals and the problems.
 *
 * What is read where is the protocol's `bids` block in protocols.json.
 */
import { pathSafe } from '../pathSafe'
import type { BidsConfig, BidsConversion, DatasetInfo, Problem, Report, Run } from './config'
import { openUpload } from './upload'
import { addWorkbook } from './workbook'
import { datasetFiles } from './datasetFiles'

export type { BidsConfig, BidsConversion, ColumnInfo, DatasetInfo, Field, OutputFile, Problem, Subject } from './config'
export { contentSize } from './config'
export type { InputFile } from './upload'
export { BIDS_VERSION } from './datasetFiles'

/** What a BIDS label (the task) may hold. */
const LABEL = /^[A-Za-z0-9]+$/

/** The upload as BIDS files, the animals found, and any problems: steps 1–4 above. */
export async function convertToBids(upload: File, config: BidsConfig, dataset: DatasetInfo): Promise<BidsConversion> {
  if (!LABEL.test(config.task)) throw new Error(`bids.task must be letters and digits, got "${config.task}"`)
  const problems: Problem[] = []
  const report: Report = {
    error: (message) => problems.push({ level: 'error', message }),
    warn: (message) => problems.push({ level: 'warning', message }),
    failed: () => problems.some((p) => p.level === 'error'),
  }

  // 1. Open the upload: its workbooks and PDFs (upload.ts).
  const inputs = await openUpload(upload, report)
  if (!inputs) return { files: [], subjects: [], problems }

  const source = dataset.source ?? `sourcedata/${pathSafe(upload.name)}`
  const run: Run = {
    config, report, files: [{ path: source, content: upload }], subjects: [], logs: [],
    participantRows: [], phenotypeRows: new Map(), columnsByAcq: new Map(),
  }
  // 2. Each PDF to logs/; each workbook to its animal, rows and tables (workbook.ts).
  for (const input of inputs) {
    if (input.name.toLowerCase().endsWith('.pdf')) run.logs.push({ path: `logs/${pathSafe(input.name)}`, content: input.bytes })
    if (input.name.toLowerCase().endsWith('.xlsx')) addWorkbook(run, input)
  }
  checkSomethingConverted(run, upload.name)
  // 3. The files describing the whole dataset (datasetFiles.ts).
  run.files.push(...datasetFiles(run, dataset))
  // 4. Everything made, the animals found, and the problems.
  return { files: run.files, subjects: run.subjects, problems }
}

/** An error when the upload held no subject, or subjects with no trial at all. */
function checkSomethingConverted(run: Run, uploadName: string) {
  const { config, report } = run
  if (report.failed()) return
  if (!run.subjects.length) {
    report.error(`No workbook with "${config.subjectId.label}" on a ${config.subjectId.sheet} sheet was found in ${uploadName}.`)
  } else if (!run.files.some((f) => f.path.startsWith('sub-'))) {
    report.error(`No trials are filled in: every ${config.tables.map((t) => t.sheet).join(', ')} sheet in ${uploadName} is empty or missing.`)
  }
}
