/**
 * Which files a protocol can take as input.
 *
 * Any file is accepted unless the protocol lists the extensions its analysis code actually reads
 * (`inputFormats` in protocols.json). There is no size cap here: the upload goes in chunks, so the
 * only limit is the space on the workspace's volume.
 */

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase()
}

/** The protocol's accepted extensions, or null when it takes any file. */
export function inputFormatsFor(protocolFormats?: string[]): string[] | null {
  return protocolFormats?.length ? protocolFormats.map((f) => f.toLowerCase()) : null
}

/** Why the protocol can't take this file, or null if it can. */
export function inputFileProblem(
  file: { name: string },
  protocolName: string,
  protocolFormats?: string[],
): string | null {
  const formats = inputFormatsFor(protocolFormats)
  const ext = extensionOf(file.name)
  if (formats && !formats.includes(ext)) {
    return `${protocolName} reads ${formats.join(', ')} files; ${file.name} (${ext || 'no extension'}) isn't one of them.`
  }
  return null
}
