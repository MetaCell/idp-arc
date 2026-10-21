/** Abstraction over the OSB endpoints that broker the DANDI upload. */

export interface UploadPart {
  partNumber: number
  url: string
}

export interface UploadInitResult {
  /** Absent when the content was already in DANDI — nothing was uploaded. */
  uploadId?: string
  path: string
  /** Empty when deduplicated; the client then skips the S3 upload entirely. */
  parts: UploadPart[]
  /** Set only on the deduplicated path — the existing blob to attach a new asset to. */
  blobId?: string
}

export interface UploadedPart {
  partNumber: number
  size: number
  etag: string
}

export interface UploadFinalizeResult {
  assetPath: string
  dandisetUrl: string
  workspaceId: number
  /** Everything the protocol script printed, or why it didn't run. */
  scriptOutput?: string
}

export interface FinalizeUploadInput {
  /** Absent on the deduplicated path — nothing was uploaded, so there is nothing to complete. */
  uploadId?: string
  path: string
  parts: UploadedPart[]
  /** Existing workspace to attach to; omit to have the backend create one. */
  workspaceId?: number
  workspaceName?: string
  blobId?: string
  /** Analysis script to run. The backend fetches it, so it must be reachable from OSB's
   * cluster — not a local address. */
  scriptUrl?: string
  /** Filename the script should land under in the workspace. */
  scriptName?: string
}

export interface IDandiApi {
  initUpload(token: string, taskId: string, filename: string, size: number, dandiEtag: string): Promise<UploadInitResult>

  /** PUTs one part straight to S3 via its presigned URL. Returns S3's ETag for the part,
   * read from the response header — requires the bucket to expose it via CORS. */
  putPart(url: string, blob: Blob): Promise<string>

  finalizeUpload(token: string, input: FinalizeUploadInput): Promise<UploadFinalizeResult>
}
