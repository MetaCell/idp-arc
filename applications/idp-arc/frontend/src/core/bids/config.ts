/** The `bids` block of protocols.json, the result of a conversion, and the state it builds up. */
/** A column of the tables: what it means, for its JSON description. */
export interface ColumnInfo {
  Description?: string
  Units?: string
  /** What each value stands for, when there is a fixed set. */
  Levels?: Record<string, string>
}

/** The `bids` block of a protocol in protocols.json. */
export interface BidsConfig {
  /** BIDS task label, e.g. `fourchoice`. */
  task: string
  /** Where a workbook holds the subject ID: the cell to the right of the cell reading `label`. */
  subjectId: { sheet: string; label: string }
  /** Where a workbook holds the subject's sex, the same way; optional. */
  sex?: { sheet: string; label: string }
  /** Where each table's sheet holds its date (the cell to the right of `label`): the session. */
  sessionDate?: { label: string }
  /** Sheets that become behavioral tables: the header row is the row whose first cell is `header`.
   *  `filledBy`: the columns that show a row was recorded (a template may prefill others); default
   *  any column but the first. */
  tables: { sheet: string; acq: string; header: string; filledBy?: string[] }[]
  /** Cells above each table (next to `label`) written, under `key`, to a JSON beside it; `list`:
   *  every cell right of the label, each `A: Anise`. */
  tableInfo?: { key: string; label: string; type?: 'date' | 'time' | 'list' }[]
  /** Columns left out of every table, by the name they would get (`quadrant_chosen`). */
  skipColumns?: string[]
  /** Each column, by the name it gets in the tables (`latency_s`), the same in every stage. */
  columns?: Record<string, ColumnInfo>
  /** participants.tsv: one row per subject, its species and sex, and these cells (next to `label`). */
  participants?: { species?: string; fields: (Field & { sheet: string })[] }
  /** phenotype/<name>.tsv: one row per subject from a sheet laid out sideways: the row whose first
   *  cell is `header` names one record per column (`Day 0`), each later row is a field (`label`). */
  phenotype?: { name: string; sheet: string; header: string; description?: string; fields: Field[] }[]
}

/** A value written as one column: the cell next to (or, in a phenotype sheet, the row of) `label`. */
export interface Field {
  column: string
  label: string
  /** The column's name in the JSON sidecar; `label` when absent. */
  LongName?: string
  Description: string
  Units?: string
  /** Written as `2026-09-02` or `09:02:00`, however the sheet stores it. */
  type?: 'date' | 'time'
}

/** What describes the dataset as a whole. */
export interface DatasetInfo {
  name: string
  /** The protocol: its name, and what the task is. */
  protocol: { name: string; description?: string; url?: string }
  /** SPDX identifier, e.g. `CC-BY-4.0`. */
  license?: string
  /** Who made the dataset, one name each. */
  authors?: string[]
  /** Where the upload is in the dandiset, when it is known; else `sourcedata/<its name>`. */
  source?: string
}

/** A file to write into the dandiset. */
export interface OutputFile {
  /** Path in the dandiset, `/`-separated. */
  path: string
  /** The upload itself is its File, never read into memory. */
  content: string | Uint8Array | Blob
}

/** An output file's size in bytes. */
export function contentSize(content: OutputFile['content']): number {
  return typeof content === 'string' ? new TextEncoder().encode(content).length : content instanceof Blob ? content.size : content.length
}

/** Something wrong with the upload, shown to the researcher. */
export interface Problem {
  /** `error` stops the upload; `warning` is shown and the upload can go on. */
  level: 'error' | 'warning'
  message: string
}

/** One animal: a workbook with an Animal ID. */
export interface Subject {
  id: string
  /** As written on the sheet. */
  sex?: string
  /** The workbook it was read from. */
  source: string
}

/** What `convertToBids` returns. */
export interface BidsConversion {
  files: OutputFile[]
  subjects: Subject[]
  problems: Problem[]
}

/** Collects problems: only what stops the dataset being built (errors), or leaves part of it out. */
export interface Report {
  error(message: string): void
  warn(message: string): void
  failed(): boolean
}

/** What a conversion builds up, workbook by workbook. */
export interface Run {
  config: BidsConfig
  report: Report
  files: OutputFile[]
  subjects: Subject[]
  /** The protocol documents that came in a zip, kept together in logs/. */
  logs: OutputFile[]
  /** participants.tsv and each phenotype table, one row per subject. */
  participantRows: string[][]
  phenotypeRows: Map<string, { columns: string[]; rows: string[][] }>
  /** Each table's column descriptions: every workbook's columns, the first description of each. */
  columnsByAcq: Map<string, Record<string, { LongName: string; Units?: string }>>
}
