import type { IObjectStore, ObjectUploadInput, StoredObject } from '../core/ports/IObjectStore'

/**
 * PUTs straight from the browser to a bucket open for anonymous writes (VITE_UPLOAD_BUCKET_URL).
 * No Authorization header; the object is readable at the
 * same URL afterwards, which is what OSB's import fetches. The bucket's CORS must allow PUT from
 * MAABCD's origin.
 *
 * `allUsers` has object-create but not object-admin, so an upload can't overwrite an existing
 * object: a key collision comes back as 412. Keys carry a fresh upload id, so that's rare.
 *
 * XMLHttpRequest, not fetch, for upload progress. One request per file (GCS takes up to 5 TB).
 */
export class PublicBucketObjectStore implements IObjectStore {
  private readonly baseUrl: string

  /** `baseUrl`: the bucket's public URL (VITE_UPLOAD_BUCKET_URL). */
  constructor(baseUrl: string | undefined) {
    this.baseUrl = (baseUrl ?? '').replace(/\/+$/, '')
  }

  put(input: ObjectUploadInput, onProgress?: (sentBytes: number, totalBytes: number) => void): Promise<StoredObject> {
    if (!this.baseUrl) return Promise.reject(new Error('No upload bucket is configured (VITE_UPLOAD_BUCKET_URL)'))
    const key = objectKey(input.protocolId, input.userSub, crypto.randomUUID(), input.file.name)
    const url = `${this.baseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`
    const { file } = input
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', url)
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
      xhr.upload.onprogress = (e) => onProgress?.(e.loaded, file.size)
      xhr.onload = () => {
        if (xhr.status === 412) {
          reject(new Error(`An upload named ${key} already exists in the bucket; try again`))
        } else if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(`Upload to the bucket failed: ${xhr.status} ${xhr.statusText}`.trim()))
        } else {
          onProgress?.(file.size, file.size)
          resolve({ url, key })
        }
      }
      xhr.onerror = () => reject(new Error('Upload to the bucket failed: network error (check the bucket’s CORS)'))
      xhr.onabort = () => reject(new Error('Upload to the bucket was aborted'))
      xhr.send(file)
    })
  }
}

/** `uploads/<protocolId>/<userSub>/<uploadId>/<filename>` (design R1.4), every segment path-safe. */
export function objectKey(protocolId: string, userSub: string, uploadId: string, filename: string): string {
  return ['uploads', protocolId, userSub, uploadId, filename].map(pathSafe).join('/')
}

/** One path segment: no `/`, no `..`, no spaces. */
function pathSafe(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-._]+|[-._]+$/g, '') || 'unknown'
}
