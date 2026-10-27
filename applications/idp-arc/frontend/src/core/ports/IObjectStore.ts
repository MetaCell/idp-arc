/**
 * Where a researcher's upload is stored before OSB imports it into the workspace: EMBER-DANDI
 * (emberObjectStore.ts) or a public bucket (publicBucketObjectStore.ts). The run doesn't know which.
 */

/** Where an interrupted upload got to, in the store's own terms: reported while it uploads, and
 *  passed back to pick up from there. The bucket has none (one request per file). */
export type UploadCheckpoint = Readonly<Record<string, unknown>>

export interface ObjectUploadInput {
  file: File
  /** The protocol's stable id (protocols.json): groups uploads by protocol. */
  protocolId: string
  /** The uploader's Keycloak id (`sub`): groups uploads by contributor. */
  userSub: string
  /** EMBER-DANDI only; the bucket ignores it. */
  dandisets?: {
    /** The researcher's own dandiset; created (named `newName`) when undefined. */
    user?: string
    newName?: string
    /** Recorded in the dandiset's metadata, with the workspace the run uses. */
    protocol?: { id: string; name: string; url?: string }
    /** The protocol's MAABCD dandiset (protocols.json `maabcdAggregateDandisetId`), uploaded to through OSB. */
    maabcd?: string
  }
  /** From an earlier, interrupted put of the same file: what it already did is not done again. */
  resume?: UploadCheckpoint
  /** Gets the checkpoint each time a part of the upload is done. */
  onCheckpoint?: (checkpoint: UploadCheckpoint) => void
}

/** An uploaded file, as plain data: kept with the run's checkpoint, which is saved across reloads. */
export interface StoredObject {
  /** Where OSB's workspace import fetches the file from (`workspaceresource` `origin.path`). */
  url: string
  /** The object's name in its store, for messages and logs. */
  key: string
  /** The uploaded file's name and size. */
  name: string
  size?: number
  /** EMBER-DANDI: the researcher's dandiset it went into (possibly created by this upload). */
  dandisetId?: string
  /** EMBER-DANDI: the file's DANDI etag, so the MAABCD copy needs no file. */
  etag?: string
}

export interface IObjectStore {
  /** Stores the file. `onProgress` gets the bytes sent so far, repeatedly while it uploads. */
  put(input: ObjectUploadInput, onProgress?: (sentBytes: number, totalBytes: number) => void): Promise<StoredObject>
  /** EMBER-DANDI: records the run's workspace in the upload's dandiset. */
  recordWorkspace?(stored: StoredObject, workspaceId: number, protocol: { id: string; name: string; url?: string }): Promise<void>
  /** EMBER-DANDI: copies the upload into `dandisetId` (MAABCD's), through OSB. `file` is needed only
   *  if EMBER doesn't already hold its bytes. */
  shareWithMaabcd?(stored: StoredObject, dandisetId: string, file?: File | null): Promise<void>
}
