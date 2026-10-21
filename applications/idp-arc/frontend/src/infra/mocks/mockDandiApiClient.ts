import type { FinalizeUploadInput, IDandiApi, UploadFinalizeResult, UploadInitResult } from '../../core/ports/IDandiApi'

let nextWorkspaceId = 900
let nextUploadId = 1

/** MockDandiApiClient — in-memory stub for IDandiApi. No real DANDI/OSB calls. */
export class MockDandiApiClient implements IDandiApi {
  async initUpload(_token: string, taskId: string, filename: string, size: number, _dandiEtag: string): Promise<UploadInitResult> {
    await delay(400)
    const uploadId = `mock-upload-${nextUploadId++}`
    const path = `task-${taskId}/sub-mockuser/${filename}`
    console.info(`[MockDandiApiClient] initUpload(${filename}, ${size}B) → ${uploadId} @ ${path}`)
    return { uploadId, path, parts: [{ partNumber: 1, url: `blob:mock-part-url` }] }
  }

  async putPart(_url: string, _blob: Blob): Promise<string> {
    await delay(500)
    return 'mock-s3-etag'
  }

  async finalizeUpload(_token: string, input: FinalizeUploadInput): Promise<UploadFinalizeResult> {
    const { uploadId, path, workspaceId, workspaceName, scriptUrl, scriptName } = input
    // The real backend blocks here for as long as spawning + running the script takes — mimic
    // that shape (a longer delay) rather than resolving instantly, so this feels representative.
    await delay(scriptUrl ? 1500 : 500)
    const wsId = workspaceId ?? nextWorkspaceId++
    console.info(
      `[MockDandiApiClient] finalizeUpload(${uploadId}) → workspace ${wsId} ` +
      `(${workspaceName ?? 'existing'}), script ${scriptName ?? 'none'}`,
    )
    return {
      assetPath: path,
      dandisetUrl: 'https://dandi.emberarchive.org/dandiset/000533/draft',
      workspaceId: wsId,
      scriptOutput: scriptUrl
        ? 'Fetched 1818 bytes from DANDI\n\nProtocol : two-arm-bandit\nTrials   : 20\nReward   : 13/20 (65%)\n\nWrote ./cumulative_reward.png\n'
        : undefined,
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
