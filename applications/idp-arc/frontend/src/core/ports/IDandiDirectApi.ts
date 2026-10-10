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

/** The draft statuses IDP acts on. EMBER reports others (`Pending`, `Validating`) while it checks. */
export const DRAFT_STATUS = {
  valid: 'Valid',
  invalid: 'Invalid',
  /** Nothing changed since the last published version. */
  published: 'Published',
} as const

/** A draft's validation, as EMBER reports it after every change. */
export interface DraftStatus {
  /** One of DRAFT_STATUS once EMBER has checked it. */
  status: string
  /** Why it is invalid, one line per problem. */
  errors: string[]
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
  /** `GET /dandisets/?user=me`: every dandiset this account owns, empty ones included. */
  listOwnDandisets(token: string): Promise<OwnDandiset[]>

  /** `POST /dandisets/`: creates a public dandiset and returns its identifier. `metadata` is
   *  merged into the default (a description). */
  createDandiset(token: string, name: string, metadata?: DandisetMetadata): Promise<string>

  /** `GET /dandisets/{id}/versions/draft/`: the full draft metadata. */
  getDraftMetadata(token: string, dandisetId: string): Promise<DandisetMetadata>

  /** `PUT /dandisets/{id}/versions/draft/`: replaces the draft metadata. Only the draft is
   *  writable; a published version is a frozen snapshot of it. */
  updateDraftMetadata(token: string, dandisetId: string, metadata: DandisetMetadata): Promise<void>

  /** `GET /dandisets/{id}/versions/draft/info/`: whether the draft can be published. */
  getDraftStatus(token: string, dandisetId: string): Promise<DraftStatus>

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
