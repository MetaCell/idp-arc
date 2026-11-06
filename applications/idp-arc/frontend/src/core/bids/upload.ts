/** Step 1: the upload's workbooks and PDFs, from the file itself or from its zip. */
import { readZipEntries } from '../zipStream'
import type { Report } from './config'

/** A workbook or PDF from the upload, its name made path-safe. */
export interface InputFile {
  name: string
  bytes: Uint8Array
}

/** The files an upload is read for: workbooks are converted, PDFs go to logs/. */
export const CONVERTED = /\.(xlsx|pdf)$/i

/** The upload's workbooks and PDFs (itself, or a zip's), or null when it can't be opened. */
export async function openUpload(upload: File, report: Report): Promise<InputFile[] | null> {
  try {
    return await filesOf(upload)
  } catch {
    report.error(`${upload.name} could not be opened. Is it a valid ${upload.name.toLowerCase().endsWith('.zip') ? 'zip' : 'Excel'} file?`)
    return null
  }
}

/** The workbooks and PDFs: the uploaded file, or those in an uploaded zip (folders flattened,
 *  macOS metadata skipped). Nothing else is read, so a zip's videos never reach memory. */
export async function filesOf(upload: File): Promise<InputFile[]> {
  if (!upload.name.toLowerCase().endsWith('.zip')) {
    return CONVERTED.test(upload.name) ? [{ name: safeName(upload.name), bytes: new Uint8Array(await upload.arrayBuffer()) }] : []
  }
  const entries = await readZipEntries(upload, (path) =>
    CONVERTED.test(path) && !path.startsWith('__MACOSX/') && !baseName(path).startsWith('.'))
  const taken = new Set<string>()
  return entries.map(({ name: path, bytes }) => {
    let name = safeName(baseName(path))
    for (let n = 2; taken.has(name); n++) name = safeName(baseName(path)).replace(/(\.[^.]*)?$/, `-${n}$1`)
    taken.add(name)
    return { name, bytes }
  })
}

/** `a/b/c.xlsx` → `c.xlsx`. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** A file name that is safe as one DANDI path segment, keeping the extension. */
export function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._ -]+/g, '-').replace(/^[-. ]+/, '') || 'file'
}
