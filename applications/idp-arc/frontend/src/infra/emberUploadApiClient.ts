import type {
  BrokeredAsset,
  BrokeredUpload,
  BrokeredUploadInput,
  BrokeredValidateInput,
  IEmberUploadApi,
} from '../core/ports/IEmberUploadApi'

/**
 * EmberUploadApiClient — OSB's `/ember/get_upload_urls` and `/ember/validate_upload`, on the same
 * workspaces API as every other OSB call, with the OSB (Keycloak) token. OSB answers in snake_case.
 *
 * `keyUsername`: the Keycloak user whose EMBER-DANDI key (attribute `EMBER_API_KEY`) OSB signs with.
 */
export class EmberUploadApiClient implements IEmberUploadApi {
  constructor(private readonly baseApiUrl: string, private readonly keyUsername: string) {}

  private async post<T>(token: string, path: string, body: unknown, what: string): Promise<T> {
    const res = await fetch(`${this.baseApiUrl}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`OSB ${what} failed (HTTP ${res.status}): ${text.slice(0, 300)}`)
    }
    return (await res.json()) as T
  }

  async getUploadUrls(token: string, input: BrokeredUploadInput): Promise<BrokeredUpload> {
    const body = await this.post<{
      dandiset_id: string
      path: string
      upload_id?: string | null
      parts?: { part_number: number; url: string }[]
      blob_id?: string | null
    }>(token, '/ember/get_upload_urls', {
      username: this.keyUsername,
      dandiset_id: input.dandisetId,
      filename: input.filename,
      size: input.size,
      dandi_etag: input.dandiEtag,
    }, 'get_upload_urls')
    return {
      dandisetId: body.dandiset_id,
      path: body.path,
      uploadId: body.upload_id ?? undefined,
      parts: (body.parts ?? []).map((p) => ({ partNumber: p.part_number, url: p.url })),
      blobId: body.blob_id ?? undefined,
    }
  }

  async validateUpload(token: string, input: BrokeredValidateInput): Promise<BrokeredAsset> {
    const body = await this.post<{ asset_id: string; asset_path: string; download_url: string }>(
      token, '/ember/validate_upload', {
        username: this.keyUsername,
        dandiset_id: input.dandisetId,
        path: input.path,
        ...(input.uploadId ? { upload_id: input.uploadId } : {}),
        ...(input.parts ? { parts: input.parts.map((p) => ({ part_number: p.partNumber, size: p.size, etag: p.etag })) } : {}),
        ...(input.blobId ? { blob_id: input.blobId } : {}),
      }, 'validate_upload')
    return { assetId: body.asset_id, assetPath: body.asset_path, downloadUrl: body.download_url }
  }
}
