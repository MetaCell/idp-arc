import type { DandisetMetadata } from '../core/dandisetLinks'
import type {
  DirectFinalizeInput,
  DirectInitResult,
  DraftStatus,
  IDandiDirectApi,
  OwnDandiset,
  PublishedVersion,
  RegisteredAsset,
} from '../core/ports/IDandiDirectApi'

/**
 * Whether IDP works with embargoed dandisets at all. Off for now: dandisets are created public and
 * only non-embargoed ones are listed. Turning it on creates them embargoed and lists embargoed ones
 * too (EMBER-DANDI leaves those out of `?user=me` unless asked, whoever owns them).
 */
export const ALLOW_EMBARGOED = false

/**
 * Talks to EMBER-DANDI's REST API directly from the browser, with the researcher's OAuth token.
 *
 *  1. OAuth tokens go in `Authorization: Bearer <token>`; API keys use `token <key>` instead, and
 *     the wrong scheme fails as a plain 401.
 *  2. The S3 CompleteMultipartUpload POST works from the browser, so the whole upload stays here.
 *
 * `baseUrl` is IDP's same-origin `/ember-proxy` (Vite in dev, nginx deployed); see
 * EMBER_FETCH_BASE in container.ts.
 */
export class EmberDandiDirectClient implements IDandiDirectApi {
  constructor(private readonly baseUrl: string) {}

  private headers(token: string, json = false): HeadersInit {
    return {
      Authorization: `Bearer ${token}`,
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    }
  }

  private async fail(res: Response, what: string): Promise<never> {
    const body = await res.text().catch(() => '')
    throw new Error(`EMBER ${what} failed (HTTP ${res.status}): ${body.slice(0, 300)}`)
  }

  async listOwnDandisets(token: string): Promise<OwnDandiset[]> {
    // `empty=true` keeps a dandiset that has no assets yet in the list; embargoed ones need
    // `embargoed=true` (see ALLOW_EMBARGOED).
    const embargoed = ALLOW_EMBARGOED ? '&embargoed=true' : ''
    const res = await fetch(
      `${this.baseUrl}/api/dandisets/?user=me${embargoed}&empty=true&page_size=100`,
      { headers: this.headers(token) },
    )
    if (!res.ok) await this.fail(res, 'dandiset list')
    const body = await res.json()
    return (body.results ?? []).map(
      (d: { identifier: string; draft_version?: { name?: string } }) => ({
        id: d.identifier,
        name: d.draft_version?.name ?? d.identifier,
      }),
    )
  }

  async createDandiset(token: string, name: string, metadata: DandisetMetadata = {}): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/dandisets/${ALLOW_EMBARGOED ? '?embargo=true' : ''}`, {
      method: 'POST',
      headers: this.headers(token, true),
      body: JSON.stringify({
        name,
        metadata: {
          description: 'Created by IDP to hold this researcher’s uploaded data.',
          ...metadata,
        },
      }),
    })
    if (!res.ok) await this.fail(res, 'dandiset create')
    return (await res.json()).identifier
  }

  async getDraftMetadata(token: string, dandisetId: string): Promise<DandisetMetadata> {
    const res = await fetch(`${this.baseUrl}/api/dandisets/${dandisetId}/versions/draft/`, {
      headers: this.headers(token),
    })
    if (!res.ok) await this.fail(res, 'draft metadata read')
    return (await res.json()) as DandisetMetadata
  }

  async updateDraftMetadata(token: string, dandisetId: string, metadata: DandisetMetadata): Promise<void> {
    // The PUT replaces the whole document and wants the name alongside it, so callers pass the
    // full metadata they read, with only their own change applied.
    const res = await fetch(`${this.baseUrl}/api/dandisets/${dandisetId}/versions/draft/`, {
      method: 'PUT',
      headers: this.headers(token, true),
      body: JSON.stringify({ name: metadata.name, metadata }),
    })
    if (!res.ok) await this.fail(res, 'draft metadata update')
  }

  async getDraftStatus(token: string, dandisetId: string): Promise<DraftStatus> {
    const res = await fetch(`${this.baseUrl}/api/dandisets/${dandisetId}/versions/draft/info/`, {
      headers: this.headers(token),
    })
    if (!res.ok) await this.fail(res, 'draft status read')
    type Problem = { field?: string; path?: string; message: string }
    const body = (await res.json()) as {
      status: string
      version_validation_errors?: Problem[]
      asset_validation_errors?: Problem[]
    }
    const errors = [...(body.version_validation_errors ?? []), ...(body.asset_validation_errors ?? [])]
      .map((e) => [e.path || e.field, e.message].filter(Boolean).join(': '))
    return { status: body.status, errors }
  }

  async publishDraft(token: string, dandisetId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/dandisets/${dandisetId}/versions/draft/publish/`, {
      method: 'POST',
      headers: this.headers(token),
    })
    if (!res.ok) await this.fail(res, 'publish')
  }

  async getLatestPublished(token: string, dandisetId: string): Promise<PublishedVersion | null> {
    const res = await fetch(`${this.baseUrl}/api/dandisets/${dandisetId}/`, { headers: this.headers(token) })
    if (!res.ok) await this.fail(res, 'dandiset read')
    const latest = (await res.json()) as { most_recent_published_version?: { version?: string } | null }
    const version = latest.most_recent_published_version?.version
    if (!version) return null
    // The DOI is in the version's own metadata.
    const info = await fetch(`${this.baseUrl}/api/dandisets/${dandisetId}/versions/${version}/info/`, {
      headers: this.headers(token),
    })
    if (!info.ok) await this.fail(info, 'published version read')
    const metadata = ((await info.json()) as { metadata?: { doi?: string; url?: string } }).metadata ?? {}
    return { version, doi: metadata.doi, url: metadata.url }
  }

  /** `POST /blobs/digest/`: the existing blob for this content, or null. */
  private async resolveBlobByDigest(token: string, dandiEtag: string): Promise<string | null> {
    const res = await fetch(`${this.baseUrl}/api/blobs/digest/`, {
      method: 'POST',
      headers: this.headers(token, true),
      body: JSON.stringify({ algorithm: 'dandi:dandi-etag', value: dandiEtag }),
    })
    // 404 is the expected "no such blob" answer, not an error.
    if (res.status === 404) return null
    if (!res.ok) return null // treat any refusal as "can't reuse" and fall back to uploading
    const body = await res.json().catch(() => null)
    return body?.blob_id ?? null
  }

  private async registerAsset(
    token: string,
    dandisetId: string,
    path: string,
    blobId: string,
  ): Promise<RegisteredAsset> {
    const res = await fetch(
      `${this.baseUrl}/api/dandisets/${dandisetId}/versions/draft/assets/`,
      {
        method: 'POST',
        headers: this.headers(token, true),
        body: JSON.stringify({
          // schemaKey and encodingFormat are the only fields dandi-schema requires beyond what
          // DANDI backfills itself; omitting either produces "'X' is a required property".
          metadata: { path, schemaKey: 'Asset', encodingFormat: guessContentType(path) },
          blob_id: blobId,
        }),
      },
    )
    // Already registered at this path: a re-upload of the same file. Reuse it.
    if (res.status === 409) {
      return { assetPath: path, assetId: await this.findDraftAssetId(token, dandisetId, path) }
    }
    if (!res.ok) await this.fail(res, 'register_asset')
    const body = await res.json()
    return { assetPath: body.path ?? path, assetId: body.asset_id }
  }

  /** The 409 above carries no asset id, so look the existing asset up by path. EMBER's `path`
   *  filter matches by prefix, hence the exact comparison. */
  private async findDraftAssetId(token: string, dandisetId: string, path: string): Promise<string> {
    const res = await fetch(
      `${this.baseUrl}/api/dandisets/${dandisetId}/versions/draft/assets/?path=${encodeURIComponent(path)}`,
      { headers: this.headers(token) },
    )
    if (!res.ok) await this.fail(res, 'asset lookup')
    const body = await res.json()
    const asset = (body.results ?? []).find((a: { path: string }) => a.path === path)
    if (!asset) throw new Error(`EMBER reported ${path} as already registered but has no such asset`)
    return asset.asset_id
  }

  async initUpload(
    token: string,
    dandisetId: string,
    size: number,
    dandiEtag: string,
  ): Promise<DirectInitResult> {
    const res = await fetch(`${this.baseUrl}/api/uploads/initialize/`, {
      method: 'POST',
      headers: this.headers(token, true),
      body: JSON.stringify({
        contentSize: size,
        dandiset: dandisetId,
        digest: { algorithm: 'dandi:dandi-etag', value: dandiEtag },
      }),
    })

    // 409 means EMBER already has this exact content, so there is nothing to transfer. Mirrors the
    // OSB adapter's handling of the same response.
    if (res.status === 409) {
      const blobId = await this.resolveBlobByDigest(token, dandiEtag)
      if (!blobId) await this.fail(res, 'initialize (409 but blob not resolvable)')
      return { parts: [], blobId: blobId ?? undefined }
    }
    if (!res.ok) await this.fail(res, 'initialize')

    const body = await res.json()
    return {
      uploadId: body.upload_id,
      parts: (body.parts ?? []).map((p: { part_number: number; size: number; upload_url: string }) => ({
        partNumber: p.part_number,
        size: p.size,
        url: p.upload_url,
      })),
    }
  }

  async putPart(url: string, blob: Blob): Promise<string> {
    const res = await fetch(url, { method: 'PUT', body: blob })
    if (!res.ok) throw new Error(`S3 part upload failed (HTTP ${res.status})`)
    const etag = res.headers.get('ETag')
    if (!etag) {
      throw new Error(
        'S3 did not expose an ETag header on the part upload; the bucket needs ' +
          'Access-Control-Expose-Headers: ETag in its CORS config.',
      )
    }
    return etag.replaceAll('"', '')
  }

  async finalizeUpload(
    token: string,
    input: DirectFinalizeInput,
  ): Promise<RegisteredAsset> {
    let blobId = input.blobId

    // Nothing was uploaded on the deduplicated path, so there is no session to complete.
    if (input.uploadId) {
      const complete = await fetch(
        `${this.baseUrl}/api/uploads/${input.uploadId}/complete/`,
        {
          method: 'POST',
          headers: this.headers(token, true),
          body: JSON.stringify({
            parts: input.parts.map((p) => ({
              part_number: p.partNumber,
              size: p.size,
              etag: p.etag,
            })),
          }),
        },
      )
      if (!complete.ok) await this.fail(complete, 'complete_upload')
      const completion = await complete.json()

      // DANDI hands back a presigned S3 CompleteMultipartUpload request for us to execute:
      // it can't do it itself, since only the uploader holds the part ETags.
      const s3 = await fetch(completion.complete_url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml' },
        body: completion.body,
      })
      if (!s3.ok) await this.fail(s3, 'S3 complete-multipart')

      const validate = await fetch(
        `${this.baseUrl}/api/uploads/${input.uploadId}/validate/`,
        { method: 'POST', headers: this.headers(token) },
      )
      if (!validate.ok) await this.fail(validate, 'validate_upload')
      blobId = (await validate.json()).blob_id
    }

    if (!blobId) throw new Error('No blob to register: neither an upload nor a dedup hit.')
    return this.registerAsset(token, input.dandisetId, input.path, blobId)
  }
}

/** Minimal extension→MIME mapping; DANDI requires encodingFormat on every asset. */
function guessContentType(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  const map: Record<string, string> = {
    csv: 'text/csv',
    tsv: 'text/tab-separated-values',
    json: 'application/json',
    nwb: 'application/x-nwb',
    txt: 'text/plain',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }
  return map[ext] ?? 'application/octet-stream'
}
