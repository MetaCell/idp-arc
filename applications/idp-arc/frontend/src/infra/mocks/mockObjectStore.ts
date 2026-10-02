import type { IObjectStore, ObjectUploadInput, StoredObject } from '../../core/ports/IObjectStore'
import { objectKey } from '../publicBucketObjectStore'

/** MockObjectStore — in-memory stub for IObjectStore. Nothing leaves the browser. */
export class MockObjectStore implements IObjectStore {
  async put(input: ObjectUploadInput, onProgress?: (sentBytes: number, totalBytes: number) => void): Promise<StoredObject> {
    const { file } = input
    // Ten steps, so the mock dialog shows the same streaming progress as the real upload.
    for (let i = 1; i <= 10; i++) {
      await delay(80)
      onProgress?.(Math.round((file.size * i) / 10), file.size)
    }
    const key = objectKey(input.protocolId, input.userSub, `mock-${Date.now()}`, file.name)
    console.info(`[MockObjectStore] put(${key}, ${file.size}B)`)
    return { url: `https://storage.googleapis.com/mock-bucket/${key}`, key }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
