import type { IAuthClient } from '../ports/IAuthClient'
import type { IDandiApi } from '../ports/IDandiApi'
import type { UploadState } from '../types'
import { PHASE_LABELS } from '../types'
import { computeDandiEtag } from '../dandiEtag'

export type OnProgress = (state: UploadState) => void

export interface CreateAndUploadToDandiInput {
  taskId: string
  file: File
  /** Existing workspace to attach the asset to; omit to create a new one. */
  workspaceId?: number
  workspaceName?: string
  /** The selected protocol's analysis script, resolved from protocols.json by the caller.
   * Delivered into the workspace alongside the data so it is ready to run. */
  scriptUrl?: string
  scriptName?: string
}

/**
 * Uploads a file to DANDI and attaches it to an OSB workspace.
 *
 * 1. Hash the file in the browser into a dandi-etag — the content digest DANDI identifies a
 *    blob by. It has to be sent up front, before any bytes move, because DANDI answers with
 *    "already have this" and skips the upload entirely when the digest matches an existing blob.
 * 2. POST /dandi/upload/init — the backend calls DANDI with the admin key and passes back one
 *    presigned S3 URL per part. Each URL carries its own signature and expiry, which is what
 *    lets the browser write to a bucket it has no credentials for.
 * 3. PUT each part's bytes to its presigned URL — a plain unauthenticated PUT, browser straight
 *    to S3. The file never passes through OSB, so size costs the server nothing.
 * 4. POST /dandi/upload/finalize — registers the asset, attaches the workspace, runs the script
 */
export function createCreateAndUploadToDandiUseCase(
  auth: Pick<IAuthClient, 'getToken'>,
  dandiApi: IDandiApi,
) {
  return async function createAndUploadToDandi(
    input: CreateAndUploadToDandiInput,
    onProgress: OnProgress,
    abortRef: { current: boolean },
  ): Promise<number | null> {
    const { taskId, file, workspaceId, workspaceName, scriptUrl, scriptName } = input

    try {
      // ── Step 1: hash the file into DANDI's content digest ─────────────────
      onProgress({ phase: 'hashing', message: PHASE_LABELS.hashing })
      const { etag, parts: partPlan } = await computeDandiEtag(file)
      if (abortRef.current) return null

      // ── Step 2: initialize ────────────────────────────────────────────────
      onProgress({ phase: 'initializing', message: PHASE_LABELS.initializing })
      const initToken = await auth.getToken(30)
      const init = await dandiApi.initUpload(initToken, taskId, file.name, file.size, etag)
      if (abortRef.current) return null

      // ── Step 3: PUT each part to its presigned URL ────────────────────────
      // init returns no parts when DANDI already has this exact content — just a blob_id to
      // attach a new asset to, so there is nothing to upload.
      const uploadedParts = []
      if (init.parts.length > 0) {
        onProgress({ phase: 'uploading', message: PHASE_LABELS.uploading })
        for (const part of init.parts) {
          if (abortRef.current) return null
          const plan = partPlan.find((p) => p.partNumber === part.partNumber)
          if (!plan) throw new Error(`No local part plan for part ${part.partNumber}`)
          const blob = file.slice(plan.start, plan.end)
          const s3Etag = await dandiApi.putPart(part.url, blob)
          uploadedParts.push({ partNumber: part.partNumber, size: plan.size, etag: s3Etag })
        }
      } else {
        onProgress({ phase: 'uploading', message: 'Already in DANDI — skipping upload…' })
      }
      if (abortRef.current) return null

      // finalize also spawns the workspace and runs the script, so it can block for minutes.
      // The token is used at the very end of that too, so it must outlive the whole call —
      // hence 600s rather than the usual short floor.
      onProgress({ phase: 'registering', message: PHASE_LABELS.registering })
      const finalizeToken = await auth.getToken(600)
      const result = await dandiApi.finalizeUpload(finalizeToken, {
        uploadId: init.uploadId,
        path: init.path,
        parts: uploadedParts,
        workspaceId,
        workspaceName,
        blobId: init.blobId,
        scriptUrl,
        scriptName,
      })

      onProgress({
        phase: 'done',
        message: PHASE_LABELS.done,
        workspaceId: result.workspaceId,
        scriptOutput: result.scriptOutput,
      })
      return result.workspaceId
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      onProgress({ phase: 'error', message: PHASE_LABELS.error, error: msg })
      return null
    }
  }
}
