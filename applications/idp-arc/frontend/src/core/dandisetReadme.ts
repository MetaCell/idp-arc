/**
 * The README that travels with an upload: it says which dandiset the data is in, so whoever opens
 * the OSB workspace can find it. It goes inside the uploaded zip, which OSB's import unpacks next to
 * the data; a plain file is zipped with it. Neither is loaded into memory, so any size works.
 *
 * The zip is the same bytes every time for the same file and README (its entries dated with the
 * file's own modified date, no clock in the text): a retry recomputes the DANDI etag, and the upload
 * checkpoint relies on it not changing.
 */
import { readZipIndex, withEntry, zipOf } from './zipStream'


export interface DandisetReadmeInput {
  /** The dandiset's own name. */
  name: string
  dandisetId: string
  /** The dandiset's page on the archive's website. */
  dandisetUrl: string
  protocol: { name: string; url?: string; description?: string }
  /** The name of the file the researcher uploaded. */
  originalName: string
  /** The dandiset folder the upload goes into, e.g. `sourcedata/upload-<UTC time>`. */
  folder: string
}

export function dandisetReadme({ name, dandisetId, dandisetUrl, protocol, originalName, folder }: DandisetReadmeInput): string {
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
    '## Where it is',
    '',
    `- Dandiset ${dandisetId}: ${dandisetUrl}`,
    `- This upload: \`${folder}/\` in that dandiset.`,
    '- The tables made from it: the dandiset\'s `sub-<animal>/` folders, described in its top-level `README.md`.',
    '',
    '## How to cite',
    '',
    `Cite a published version of dandiset ${dandisetId} by its DOI, listed on the dandiset's page. Uploads go to its draft, which has no DOI.`,
    '',
    ...(protocol.url ? ['## Analysis code', '', `- ${protocol.url}`, ''] : []),
  ].join('\n')
}

/** The file to upload: `file` with `readme` added (into it if it is a zip, else zipped together).
 *  A zip's own entries stay byte for byte, except a README.md of its own, which ours replaces. */
export async function withReadme(file: File, readme: string): Promise<File> {
  // Every entry is dated when the researcher last saved the file.
  const date = new Date(file.lastModified)
  const data = new TextEncoder().encode(readme)
  const index = file.name.toLowerCase().endsWith('.zip') ? await readZipIndex(file) : null
  if (index) {
    return new File([withEntry(file, index, { name: 'README.md', data, date })], file.name, { type: 'application/zip', lastModified: date.getTime() })
  }
  // A single file, or a .zip that can't be read: carried inside a new zip, as it is.
  const zipped = await zipOf([{ name: 'README.md', data, date }, { name: file.name, data: file, date }])
  const name = `${file.name.replace(/\.[^.]*$/, '') || file.name}.zip`
  return new File([zipped], name, { type: 'application/zip', lastModified: date.getTime() })
}
