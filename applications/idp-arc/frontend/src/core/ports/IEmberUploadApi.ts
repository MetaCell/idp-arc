/**
 * IEmberUploadApi — OSB's two EMBER-DANDI endpoints (`/ember/get_upload_urls`,
 * `/ember/validate_upload`), authenticated with the OSB (Keycloak) token. OSB signs the upload
 * with the EMBER-DANDI key held on a Keycloak user (the adapter names it), which never reaches the
 * browser; the browser still PUTs the bytes.
 *
 * OSB doesn't know what the dandiset is for: IDP names it (the protocol's MAABCD dandiset, from
 * protocols.json). OSB builds the asset path itself, under the caller's own id.
 */

export interface BrokeredUploadInput {
  dandisetId: string
  filename: string
  size: number
  dandiEtag: string
}

export interface BrokeredUpload {
  dandisetId: string
  /** Asset path OSB chose (`<caller id>/<upload id>/<filename>`); echoed back to validateUpload. */
  path: string
  /** Absent when EMBER already held this content. */
  uploadId?: string
  /** Presigned S3 part URLs; empty when deduplicated. */
  parts: { partNumber: number; url: string }[]
  /** Set only when deduplicated. */
  blobId?: string
}

export interface BrokeredValidateInput {
  dandisetId: string
  path: string
  uploadId?: string
  parts?: { partNumber: number; size: number; etag: string }[]
  blobId?: string
}

export interface BrokeredAsset {
  assetId: string
  assetPath: string
  downloadUrl: string
}

export interface IEmberUploadApi {
  getUploadUrls(token: string, input: BrokeredUploadInput): Promise<BrokeredUpload>
  validateUpload(token: string, input: BrokeredValidateInput): Promise<BrokeredAsset>
}
