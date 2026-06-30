import type { IAuthClient } from '../ports/IAuthClient'
import type { IWorkspaceApi } from '../ports/IWorkspaceApi'
import type { IJupyterApi } from '../ports/IJupyterApi'
import type { UploadState } from '../types'
import { PHASE_LABELS } from '../types'

/** Callback the use-case calls at each phase transition; the UI uses it to drive React state. */
export type OnProgress = (state: UploadState) => void

export interface CreateAndUploadInput {
  workspaceName: string
  file: File
  /** Subject claim (`sub`) from the token payload — identifies the JupyterHub user. */
  userId: string
  /** When provided the workspace creation step is skipped and the file is uploaded to this workspace. */
  workspaceId?: number
  /**
   * Called synchronously the moment the workspace id is known (right after
   * Step 1, before the long PVC wait). Use this to open the workspace tab
   * while still inside the user-gesture async chain so the browser allows it.
   */
  onWorkspaceCreated?: (wsId: number) => void
}

/**
 * createAndUploadWorkspace use-case
 *
 * Owns the *sequence* and *error handling* of the 4-step workflow:
 *   1. Create workspace via REST API
 *   2. Trigger JupyterHub spawn
 *   3. Poll until JupyterLab is ready
 *   4. Upload file via JupyterLab Contents API
 *
 * DI: every side-effect (auth, HTTP, browser APIs) is injected through ports.
 * Testing: pass plain fake objects — no vi.mock() required.
 *
 * @example
 * const run = createCreateAndUploadUseCase(auth, workspaceApi, jupyterApi)
 * await run({ workspaceName: 'My WS', file, userId }, setUploadState, abortRef)
 */
export function createCreateAndUploadUseCase(
  auth: Pick<IAuthClient, 'getToken'>,
  workspaceApi: Pick<IWorkspaceApi, 'createWorkspace'>,
  jupyterApi: Pick<IJupyterApi, 'triggerSpawn' | 'waitUntilReady' | 'uploadFile'>,
  // JupyterHub named-server suffix: the subdomain appname of the JupyterHub
  // deployment. For lab.v2dev.opensourcebrain.org the server name is
  // "{workspaceId}lab" — i.e. the suffix is "lab".
  serverSuffix = '',
) {
  return async function createAndUpload(
    input: CreateAndUploadInput,
    onProgress: OnProgress,
    abortRef: { current: boolean },
  ): Promise<number | null> {
    const { workspaceName, file, userId, onWorkspaceCreated } = input

    try {
      const token = await auth.getToken(30)

      // ── Step 1: Create workspace (skipped when uploading to an existing one) ─
      let wsId: number
      if (input.workspaceId) {
        wsId = input.workspaceId
      } else {
        onProgress({ phase: 'creating', message: PHASE_LABELS.creating })
        wsId = await workspaceApi.createWorkspace(token, workspaceName)
        onWorkspaceCreated?.(wsId)
      }

      if (abortRef.current) return null

      // ── Step 2: Trigger JupyterHub spawn ──────────────────────────────────
      const serverName = `${wsId}${serverSuffix}`
      onProgress({ phase: 'spawning', message: PHASE_LABELS.spawning, workspaceId: wsId })

      const spawnToken = await auth.getToken(30)
      await jupyterApi.triggerSpawn(spawnToken, userId, serverName, `${wsId}`)

      // Wait 30 s for the PVC to initialise before polling
      for (let i = 30; i > 0; i--) {
        if (abortRef.current) return null
        onProgress({
          phase: 'spawning',
          message: `2 / 4 — Waiting for PVC to initialise… ${i}s`,
          workspaceId: wsId,
        })
        await sleep(1_000)
      }

      if (abortRef.current) return null

      // ── Step 3: Poll until JupyterLab is ready and per-server session is established ──
      onProgress({ phase: 'waiting', message: PHASE_LABELS.waiting, workspaceId: wsId })
      const deadline = Date.now() + 240_000
      const ready = await jupyterApi.waitUntilReady(userId, serverName, deadline, abortRef)
      if (!ready) { throw new Error('Could not reach JupyterLab within the timeout.') }

      // ── Step 4: Upload file ───────────────────────────────────────────────
      onProgress({ phase: 'uploading', message: PHASE_LABELS.uploading, workspaceId: wsId })
      const uploadToken = await auth.getToken(30)
      await jupyterApi.uploadFile(uploadToken, userId, serverName, file)

      onProgress({ phase: 'done', message: PHASE_LABELS.done, workspaceId: wsId })
      return wsId
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      onProgress({ phase: 'error', message: PHASE_LABELS.error, error: msg })
      return null
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
