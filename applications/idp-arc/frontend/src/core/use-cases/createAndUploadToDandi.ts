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
 * createAndUploadToDandi use-case (Route A — see IDP-43 architecture notes)
 *
 * 1. Compute the dandi-etag client-side (bytes never reach idp-arc's backend)
 * 2. POST /dandi/upload/init — backend derives the path from the caller's token,
 *    brokers DANDI's `initialize` call with the admin key, returns presigned S3 part URLs
 * 3. PUT each part straight to S3 from the browser
 * 4. POST /dandi/upload/finalize — backend completes/validates/registers with DANDI,
 *    then creates/attaches the OSB workspace
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
      // ── Step 1: compute the etag ──────────────────────────────────────────
      onProgress({ phase: 'hashing', message: PHASE_LABELS.hashing })
      const { etag, parts: partPlan } = await computeDandiEtag(file)
      if (abortRef.current) return null

      // ── Step 2: initialize ────────────────────────────────────────────────
      onProgress({ phase: 'initializing', message: PHASE_LABELS.initializing })
      const initToken = await auth.getToken(30)
      const init = await dandiApi.initUpload(initToken, taskId, file.name, file.size, etag)
      if (abortRef.current) return null

      // ── Step 3: PUT each part straight to S3 ──────────────────────────────
      // Skipped entirely when DANDI already has this exact content (deduplicated): there are
      // no parts and no upload_id, just a blob_id to attach a new asset to.
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

      // ── Step 4: finalize — DANDI completion/validation, OSB attach, AND run the script ──
      // No Argo yet: the backend now blocks inside this one call through spawning the
      // workspace's JupyterLab server and executing the script in it — several minutes in the
      // worst case, not the few seconds finalize used to take. The token has to outlive the
      // WHOLE call (the backend uses it at the very end too, for the JupyterHub/kernel calls),
      // so a 30s validity floor is not enough. Asking for 600 forces the freshest possible
      // token right before the call — the best the frontend can do — but if Keycloak's realm
      // issues access tokens with a shorter total lifetime than the run takes, the token can
      // still expire mid-request; that residual risk needs a realm setting or backend-side
      // token refresh to close fully, not something fixable from here.
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
