/**
 * A re-upload into a dandiset that already holds BIDS data: the files with one row per animal
 * (participants.tsv, phenotype/*.tsv) and their descriptions are merged with the draft's copies,
 * so animals from earlier uploads stay. An animal in both keeps the new row. The stage JSONs
 * (`task-<task>_acq-<stage>_beh.json`) are merged too, so columns only earlier uploads had stay described.
 */

/** The files merged with the draft's copy rather than replaced. */
export function isMergedFile(path: string): boolean {
  return /^(participants|phenotype\/[^/]+)\.(tsv|json)$/.test(path) || /^task-[^/]+_beh\.json$/.test(path)
}

/** `incoming` merged into `existing`: rows by their first column (`participant_id`), descriptions by key. */
export function mergeWithDraft(path: string, existing: string, incoming: string): string {
  return path.endsWith('.json') ? mergeJson(existing, incoming) : mergeTsv(existing, incoming)
}

/** Earlier rows keep their order and new ones follow; columns are the union, missing cells `n/a`. */
function mergeTsv(existing: string, incoming: string): string {
  const [oldHeader, ...oldRows] = lines(existing)
  const [newHeader, ...newRows] = lines(incoming)
  if (!oldHeader) return incoming
  const header = [...newHeader, ...oldHeader.filter((c) => !newHeader.includes(c))]
  const record = (columns: string[], row: string[]) => header.map((c) => (columns.includes(c) ? row[columns.indexOf(c)] ?? 'n/a' : 'n/a'))
  const rows = new Map(oldRows.map((r) => [r[0], record(oldHeader, r)]))
  for (const r of newRows) rows.set(r[0], record(newHeader, r))
  return [header, ...rows.values()].map((r) => r.join('\t')).join('\n') + '\n'
}

function mergeJson(existing: string, incoming: string): string {
  return JSON.stringify({ ...JSON.parse(existing), ...JSON.parse(incoming) }, null, 2) + '\n'
}

function lines(tsv: string): string[][] {
  return tsv.split('\n').filter((l) => l.trim() !== '').map((l) => l.split('\t'))
}
