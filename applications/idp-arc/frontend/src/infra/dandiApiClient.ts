import type { FinalizeUploadInput, IDandiApi, UploadFinalizeResult, UploadInitResult } from '../core/ports/IDandiApi'

/**
 * DandiApiClient — talks to idp-arc's OWN backend (same origin, `/api/dandi/...`), which is
 * what actually holds the EMBER-DANDI admin key and calls DANDI/OSB on the browser's behalf.
 */
export class DandiApiClient implements IDandiApi {
  constructor(private readonly baseApiUrl: string) {}

  async initUpload(token: string, taskId: string, filename: string, size: number, dandiEtag: string): Promise<UploadInitResult> {
    const res = await fetch(`${this.baseApiUrl}/dandi/upload/init`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, filename, size, dandi_etag: dandiEtag }),
    })
    if (!res.ok) {
      throw new Error(`Upload init failed: ${res.status} ${res.statusText} — ${await res.text().catch(() => '')}`)
    }
    const data = await res.json() as {
      upload_id?: string
      path: string
      parts: { part_number: number; url: string }[]
      blob_id?: string
    }
    return {
      uploadId: data.upload_id,
      path: data.path,
      blobId: data.blob_id,
      parts: (data.parts ?? []).map((p) => ({ partNumber: p.part_number, url: p.url })),
    }
  }

  async putPart(url: string, blob: Blob): Promise<string> {
    const res = await fetch(url, { method: 'PUT', body: blob })
    if (!res.ok) {
      throw new Error(`Part upload to S3 failed: ${res.status} ${res.statusText}`)
    }
    const etag = res.headers.get('ETag')
    if (!etag) {
      throw new Error(
        'S3 did not expose an ETag header on the part upload response — the bucket needs ' +
        'Access-Control-Expose-Headers: ETag in its CORS config.',
      )
    }
    return etag.replaceAll('"', '')
  }

  async finalizeUpload(token: string, input: FinalizeUploadInput): Promise<UploadFinalizeResult> {
    const { uploadId, path, parts, workspaceId, workspaceName, blobId, scriptUrl, scriptName } = input
    const res = await fetch(`${this.baseApiUrl}/dandi/upload/finalize`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path,
        ...(uploadId ? { upload_id: uploadId } : {}),
        ...(blobId ? { blob_id: blobId } : {}),
        parts: parts.map((p) => ({ part_number: p.partNumber, size: p.size, etag: p.etag })),
        ...(workspaceId !== undefined ? { workspace_id: workspaceId } : {}),
        ...(workspaceName ? { workspace_name: workspaceName } : {}),
        ...(scriptUrl ? { script_url: scriptUrl } : {}),
        ...(scriptName ? { script_name: scriptName } : {}),
      }),
    })
    if (!res.ok) {
      throw new Error(`Upload finalize failed: ${res.status} ${res.statusText} — ${await res.text().catch(() => '')}`)
    }
    const data = await res.json() as {
      asset_path: string
      dandiset_url: string
      workspace_id: number
      script_output?: string
    }
    return {
      assetPath: data.asset_path,
      dandisetUrl: data.dandiset_url,
      workspaceId: data.workspace_id,
      scriptOutput: data.script_output,
    }
  }
}
