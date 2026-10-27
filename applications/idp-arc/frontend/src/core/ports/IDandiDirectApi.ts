import type { DandisetMetadata } from '../dandisetLinks'

/**
 * IDandiDirectApi: EMBER-DANDI operations performed straight from the browser, authenticated with
 * the researcher's own OAuth token (IEmberAuth). Used for the researcher's own copy of an upload;
 * the MAABCD copy goes through OSB instead (IEmberUploadApi), since only OSB holds that key.
 */

/** One part of a multipart upload, as EMBER hands it back from `initialize`. */
export interface DirectUploadPart {
  partNumber: number
  size: number
  url: string
}

export interface DirectInitResult {
  /** Absent when EMBER already holds this content: nothing to upload. */
  uploadId?: string
  /** Empty when deduplicated; the caller then skips S3 entirely. */
  parts: DirectUploadPart[]
  /** Set only on the deduplicated path: the existing blob to attach an asset to. */
  blobId?: string
}

export interface DirectUploadedPart {
  partNumber: number
  size: number
  etag: string
}

export interface DirectFinalizeInput {
  /** Absent on the deduplicated path: there is no upload session to complete. */
  uploadId?: string
  dandisetId: string
  path: string
  parts: DirectUploadedPart[]
  blobId?: string
}

/** An asset as registered in a dandiset's draft. */
export interface RegisteredAsset {
  assetPath: string
  assetId: string
}

/** A dandiset the connected EMBER account owns, as listed for the upload dialog's picker. */
export interface OwnDandiset {
  id: string
  name: string
}

/**
 * DANDI's status of a dandiset version (its `status` field), exactly as EMBER's API defines it.
 * The draft is a version (`draft`), as is each published one (`0.YYMMDD.HHMM`). The draft:
 * - starts `Pending`, and goes back to `Pending` after every change (an upload, a metadata edit);
 * - is checked by EMBER in the background: `Pending` → `Validating` → `Valid` or `Invalid`;
 * - can be published only when `Valid` and every file in it has been checked: `Publishing`, then
 *   `Published` (identical to the version that publish created, until the next change).
 */
export const VERSION_STATUS = {
  pending: 'Pending',
  validating: 'Validating',
  valid: 'Valid',
  /** Can't be published as it is; `errors` says why. */
  invalid: 'Invalid',
  publishing: 'Publishing',
  /** For the draft: unchanged since the last published version, so nothing new to publish. */
  published: 'Published',
} as const

/** A version's state: one of VERSION_STATUS. */
export type VersionStatus = (typeof VERSION_STATUS)[keyof typeof VERSION_STATUS]

/** A version of a dandiset, as EMBER reports it: which one, its state, and what stops it from
 *  being published. */
export interface DandisetVersion {
  /** `draft`, or a published version (`0.YYMMDD.HHMM`). */
  version: string
  status: VersionStatus
  /** Why it can't be published, one line per problem: the dandiset's metadata, or a file's. */
  errors: string[]
  /** Files EMBER hasn't checked yet. Publishing needs every file checked, even on a `Valid` draft. */
  filesBeingChecked: number
}

/** A published (frozen) version of a dandiset. */
export interface PublishedVersion {
  version: string
  /** Its DOI, e.g. `10.60533/ember-dandi.000542/0.260924.1156`. */
  doi?: string
  /** Its page on EMBER-DANDI. */
  url?: string
}

export interface IDandiDirectApi {
  /** `GET /dandisets/?user=me`: every dandiset this account owns, empty ones included; with
   *  `search`, only those EMBER's search matches (it also looks in the metadata). */
  listOwnDandisets(token: string, search?: string): Promise<OwnDandiset[]>

  /** `POST /dandisets/`: creates a public dandiset and returns its identifier. `metadata` is
   *  merged into the default (a description). */
  createDandiset(token: string, name: string, metadata?: DandisetMetadata): Promise<string>

  /** `GET /dandisets/{id}/versions/draft/`: the full draft metadata. */
  getDraftMetadata(token: string, dandisetId: string): Promise<DandisetMetadata>

  /** `PUT /dandisets/{id}/versions/draft/`: replaces the draft metadata. Only the draft is
   *  writable; a published version is a frozen snapshot of it. */
  updateDraftMetadata(token: string, dandisetId: string, metadata: DandisetMetadata): Promise<void>

  /** `GET /dandisets/{id}/versions/{version}/info/`: the version (`draft`, or a published one) and
   *  its state. */
  getVersionInfo(token: string, dandisetId: string, version: string): Promise<DandisetVersion>

  /** `POST /dandisets/{id}/versions/draft/publish/`: starts publishing the draft as a new
   *  version. EMBER finishes it in the background. */
  publishDraft(token: string, dandisetId: string): Promise<void>

  /** The most recent published version, with its DOI; null when there is none yet. */
  getLatestPublished(token: string, dandisetId: string): Promise<PublishedVersion | null>

  /** `POST /uploads/initialize/`. A 409 (content already present) comes back as
   *  `{ parts: [], blobId }` rather than an error. */
  initUpload(token: string, dandisetId: string, size: number, dandiEtag: string): Promise<DirectInitResult>

  /** PUTs one part straight to S3 via its presigned URL, returning S3's ETag for that part.
   *  Presigned URLs carry no EMBER credential, so this also serves the uploads OSB signs. */
  putPart(url: string, blob: Blob): Promise<string>

  /** complete → validate → register the asset, all direct to EMBER. */
  finalizeUpload(token: string, input: DirectFinalizeInput): Promise<RegisteredAsset>
}
