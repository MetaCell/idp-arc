/**
 * The README that travels with an upload: it says which dandiset the data is in, so whoever opens
 * the OSB workspace can find it. It goes inside the uploaded zip, which OSB's import unpacks next to
 * the data; a plain file is zipped with it.
 *
 * The zip is the same bytes every time for the same file and README (fixed dates, no clock in the
 * text): a retry recomputes the DANDI etag, and the upload checkpoint relies on it not changing.
 */
import { strToU8, unzipSync, zipSync, type Zippable } from 'fflate'

/** Files bigger than this go up as they are, without a README: repacking reads them into memory. */
export const MAX_REPACK_BYTES = 200 * 1024 * 1024

/** A fixed entry date, so the zip's bytes don't depend on when it was built. */
const ENTRY_DATE = new Date(2000, 0, 1)

export interface DandisetReadmeInput {
  /** The dandiset's own name. */
  name: string
  dandisetId: string
  /** The dandiset's page on the archive's website. */
  dandisetUrl: string
  protocol: { name: string; url?: string; description?: string }
  /** The name of the file the researcher uploaded. */
  originalName: string
}

export function dandisetReadme({ name, dandisetId, dandisetUrl, protocol, originalName }: DandisetReadmeInput): string {
  return [
    `# ${name}`,
    '',
    `Behavioral data from the ${protocol.name}.`,
    '',
    ...(protocol.description ? [protocol.description, ''] : []),
    '## Files',
    '',
    `- \`${originalName}\`: the researcher's upload. Every file here except this README comes from it, unchanged.`,
    '',
    '## Links',
    '',
    `- Dandiset ${dandisetId}: ${dandisetUrl} (every published version, with its DOI)`,
    ...(protocol.url ? [`- Analysis code: ${protocol.url}`] : []),
    '',
  ].join('\n')
}

/** The file to upload: `file` with `readme` added (into it if it is a zip, else zipped together). */
export async function withReadme(file: File, readme: string): Promise<File> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let entries: Record<string, Uint8Array> | null = null
  if (file.name.toLowerCase().endsWith('.zip')) {
    try {
      entries = unzipSync(bytes)
    } catch {
      entries = null // not a readable zip: carried inside the new one, as it is
    }
  }
  const files = entries
    ? Object.entries(entries).filter(([path]) => !path.endsWith('/'))
    : [[file.name, bytes] as const]
  const readmeName = files.some(([path]) => path === 'README.md') ? 'README-dandiset.md' : 'README.md'

  const zippable: Zippable = { [readmeName]: [strToU8(readme), { mtime: ENTRY_DATE }] }
  for (const [path, data] of files) zippable[path] = [data, { mtime: ENTRY_DATE }]
  const name = entries ? file.name : `${file.name.replace(/\.[^.]*$/, '') || file.name}.zip`
  const zipped = zipSync(zippable, { level: 6 }) as Uint8Array<ArrayBuffer>
  return new File([zipped], name, { type: 'application/zip', lastModified: ENTRY_DATE.getTime() })
}
