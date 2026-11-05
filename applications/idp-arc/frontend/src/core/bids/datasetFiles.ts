/** Step 4: the files that describe the whole dataset, written once all workbooks are read. */
import type { BidsConfig, DatasetInfo, Field, OutputFile, Run } from './config'
import { splitColumn } from './sheet'
import { json, tsvOf } from './values'

/** The BIDS version the dataset follows (`dataset_description.json`). */
export const BIDS_VERSION = '1.10.0'

/** The dataset-level files: each table's column descriptions, participants, phenotype, the logs,
 *  dataset_description.json and the README. */
export function datasetFiles(run: Run, dataset: DatasetInfo): OutputFile[] {
  const { config } = run
  const out: OutputFile[] = []
  for (const [acq, columns] of run.columnsByAcq) {
    out.push({ path: `task-${config.task}_acq-${acq}_beh.json`, content: json({
      TaskName: config.task,
      ...(dataset.protocol.description ? { TaskDescription: dataset.protocol.description } : {}),
      ...describeColumns(columns, config.columns),
    }) })
  }
  if (config.participants && run.participantRows.length) {
    const fields = config.participants.fields
    const header = ['participant_id', ...(config.participants.species ? ['species'] : []), 'sex', ...fields.map((f) => f.column)]
    out.push({ path: 'participants.tsv', content: tsvOf(header, run.participantRows) })
    out.push({ path: 'participants.json', content: json({
      ...(config.participants.species ? { species: { Description: 'Species, as its binomial name (NCBI Taxonomy).' } } : {}),
      participant_id: { Description: `Animal ID from the ${config.subjectId.sheet} sheet ("${config.subjectId.label}"), letters and digits only.` },
      sex: { Description: 'Sex of the animal, as written on the sheet.' },
      ...describeFields(fields),
    }) })
  }
  for (const table of config.phenotype ?? []) {
    const found = run.phenotypeRows.get(table.name)
    if (!found) continue
    out.push({ path: `phenotype/${table.name}.tsv`, content: tsvOf(['participant_id', ...found.columns], found.rows) })
    out.push({ path: `phenotype/${table.name}.json`, content: json({
      ...(table.description ? { MeasurementToolMetadata: { Description: table.description } } : {}),
      ...Object.fromEntries(found.columns.map((c) => {
        const [record, field] = splitColumn(c, table.fields)
        return [c, { Description: `${record}: ${field.Description}`, ...(field.Units ? { Units: field.Units } : {}) }]
      })),
    }) })
  }
  out.push(...run.logs)
  out.push({ path: 'dataset_description.json', content: json(datasetDescription(dataset)) })
  out.push({ path: 'README.md', content: readme(dataset, config, run.logs.length > 0, run.participantRows.length > 0, [...run.phenotypeRows.keys()]) })
  return out
}

/** The header-derived description of each column, with what the protocol says about it on top. */
export function describeColumns(found: Record<string, { LongName: string; Units?: string }>, known: BidsConfig['columns']) {
  return Object.fromEntries(Object.entries(found).map(([name, column]) => {
    const info = known?.[name]
    const units = info?.Units ?? column.Units
    return [name, {
      LongName: column.LongName,
      ...(info?.Description ? { Description: info.Description } : {}),
      ...(units ? { Units: units } : {}),
      ...(info?.Levels ? { Levels: info.Levels } : {}),
    }]
  }))
}

/** dataset_description.json: name, version, license, authors, and what made it. */
export function datasetDescription({ name, protocol, license, authors }: DatasetInfo) {
  return {
    Name: name,
    BIDSVersion: BIDS_VERSION,
    DatasetType: 'raw',
    ...(license ? { License: license } : {}),
    ...(authors?.length ? { Authors: authors } : {}),
    ...(protocol.url ? { ReferencesAndLinks: [protocol.url] } : {}),
    GeneratedBy: [{
      Name: `MAABCD ${protocol.name} upload`,
      Description: 'Behavioral tables copied, unchanged, from the spreadsheets in sourcedata/, in the browser.',
    }],
  }
}

/** The dataset's README.md: the protocol, and what each part of the layout holds. */
export function readme({ name, protocol }: DatasetInfo, config: BidsConfig, hasLogs: boolean, hasParticipants: boolean, phenotypes: string[]): string {
  return [
    `# ${name}`,
    '',
    `Protocol: ${protocol.name}`,
    ...(protocol.url ? ['', `Analysis code: ${protocol.url}`] : []),
    '',
    ...(protocol.description ? [protocol.description, ''] : []),
    '## Layout',
    '',
    `- \`sub-<animal>/${config.sessionDate ? 'ses-<testing date>/' : ''}beh/\`: one table per animal and stage, rows as recorded.`,
    `- \`task-${config.task}_acq-<stage>_beh.json\`: what each column of that stage's tables is.`,
    ...(config.tableInfo?.length ? ['- Each table\'s own `.json`: the cells above the table on its sheet (' + config.tableInfo.map((f) => f.label.replace(/:$/, '')).join(', ') + ').'] : []),
    ...(hasParticipants ? ['- `participants.tsv`: one row per animal (species, sex, and its details from the sheet).'] : []),
    ...phenotypes.map((p) => `- \`phenotype/${p}.tsv\`: one row per animal, from the sheet's ${p} records.`),
    '- `sourcedata/upload-<UTC time>/`: each upload, zipped with a README that links this dandiset; every file in it is the researcher\'s, unchanged.',
    ...(hasLogs ? ['- `logs/`: the protocol documents that came with the upload.'] : []),
    '',
    'A later upload of the same animal replaces its rows in `participants.tsv` and `phenotype/`, and its tables for the same testing date and stage; every upload stays in `sourcedata/`.',
    '',
  ].join('\n')
}

/** The fields' column descriptions, for a JSON sidecar. */
export function describeFields(fields: Field[]) {
  return Object.fromEntries(fields.map((f) => [f.column, { LongName: f.LongName ?? f.label, Description: f.Description, ...(f.Units ? { Units: f.Units } : {}) }]))
}
