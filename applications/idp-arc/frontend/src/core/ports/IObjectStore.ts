/**
 * Where a researcher's upload comes to rest before OSB imports it into the workspace (MAABCD–OSB
 * Integration design, "Upload port + adapter"). Scenario 1 is a public bucket; Scenario 2 swaps
 * in an EMBER-DANDI adapter behind this same port, so the upload flow doesn't change.
 */

export interface ObjectUploadInput {
  file: File
  /** The protocol's stable id (protocols.json): groups uploads by protocol. */
  protocolId: string
  /** The uploader's Keycloak id (`sub`): groups uploads by contributor. */
  userSub: string
  /** Scenario 2 (EMBER-DANDI) only; the bucket ignores it. */
  dandisets?: {
    /** The researcher's own dandiset; created (named `newName`) when undefined. */
    user?: string
    newName?: string
    /** Recorded in the dandiset's metadata, with the workspace the run uses. */
    protocol?: { id: string; name: string; url?: string }
    /** The protocol's MAABCD dandiset (protocols.json `maabcdDandisetId`), uploaded to through OSB. */
    maabcd?: string
  }
}

export interface StoredObject {
  /** Where OSB's workspace import fetches the file from (`workspaceresource` `origin.path`). */
  url: string
  /** The object's name in its store, for messages and logs. */
  key: string
  /** Scenario 2: the researcher's dandiset it went into (created by this upload, possibly). */
  dandisetId?: string
  /** Scenario 2: records the run's workspace with the upload (in the dandiset's metadata). */
  recordWorkspace?: (workspaceId: number) => Promise<void>
}

export interface IObjectStore {
  /** Stores the file. `onProgress` gets the bytes sent so far, repeatedly while it uploads. */
  put(input: ObjectUploadInput, onProgress?: (sentBytes: number, totalBytes: number) => void): Promise<StoredObject>
}
