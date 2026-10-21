import SparkMD5 from 'spark-md5'

/**
 * Part size DANDI splits uploads into. Must match theirs exactly or the ETag won't agree.
 *
 * DANDI validates AssetBlob.etag against `^[0-9a-f]{32}-\d{1,5}$`, so the multipart form is
 * required even for a single small part — it can't be skipped below the part size.
 */
export const DANDI_ETAG_PART_SIZE = 64 * 1024 * 1024 // 64 MiB

export interface PartPlan {
  partNumber: number
  start: number
  end: number
  size: number
}

/** Splits a file size into DANDI's fixed-size parts. Always returns at least one part, even for a 0-byte file. */
export function planParts(fileSize: number, partSize = DANDI_ETAG_PART_SIZE): PartPlan[] {
  const parts: PartPlan[] = []
  let start = 0
  let partNumber = 1
  while (start < fileSize) {
    const end = Math.min(start + partSize, fileSize)
    parts.push({ partNumber, start, end, size: end - start })
    start = end
    partNumber += 1
  }
  if (parts.length === 0) parts.push({ partNumber: 1, start: 0, end: 0, size: 0 })
  return parts
}

/**
 * Computes the dandi-etag: MD5 of each part, concatenate the raw (binary) digests, MD5 that
 * concatenation, hex-encode, append `-<part count>`. Standard S3 multipart ETag algorithm.
 */
export async function computeDandiEtag(
  file: File,
  partSize = DANDI_ETAG_PART_SIZE,
): Promise<{ etag: string; parts: PartPlan[] }> {
  const parts = planParts(file.size, partSize)
  let concatenatedRawDigests = ''

  for (const part of parts) {
    const buf = await file.slice(part.start, part.end).arrayBuffer()
    const hasher = new SparkMD5.ArrayBuffer()
    hasher.append(buf)
    concatenatedRawDigests += hasher.end(true) // raw binary string — 16 bytes per part
  }

  const outer = new SparkMD5()
  outer.appendBinary(concatenatedRawDigests)
  const etag = `${outer.end()}-${parts.length}`

  return { etag, parts }
}
