import SparkMD5 from 'spark-md5'

/**
 * S3/DANDI multipart-style content digest, computed entirely client-side since bytes never
 * reach our backend (see IDP-43 architecture notes — Route A). AssetBlob.etag on the real
 * EMBER-DANDI API is validated against `^[0-9a-f]{32}-\d{1,5}$`, so this format is required
 * even for a single-part file — it is not an optimisation that can be skipped at small sizes.
 *
 * Confirmed live against EMBER-DANDI on 2026-09-11: declaring a 150 MiB upload at
 * /uploads/initialize/ returned parts of exactly 64 MiB, 64 MiB, 22 MiB — this constant is
 * correct, not just recalled. The single-part algorithm itself is also confirmed: a real
 * 4-byte upload's S3 CompleteMultipartUpload ETag matched this exact computation independently
 * done in Python.
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
