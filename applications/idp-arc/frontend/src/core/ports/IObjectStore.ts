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
}

export interface StoredObject {
  /** Where OSB's workspace import fetches the file from (`workspaceresource` `origin.path`). */
  url: string
  /** The object's name in its store, for messages and logs. */
  key: string
}

export interface IObjectStore {
  /** Stores the file. `onProgress` gets the bytes sent so far, repeatedly while it uploads. */
  put(input: ObjectUploadInput, onProgress?: (sentBytes: number, totalBytes: number) => void): Promise<StoredObject>
}
