import type { IJupyterApi } from '../core/ports/IJupyterApi'

/**
 * JupyterApiClient — concrete IJupyterApi implementation.
 *
 * Owns ALL browser side-effects related to JupyterHub/JupyterLab:
 *   - setting the auth cookie
 *   - fire-and-forget spawn request
 *   - polling the Contents API
 *   - file upload via the Contents API
 *   - opening a browser tab
 *
 * Use-cases only see IJupyterApi — they have no idea these browser APIs exist.
 */
export class JupyterApiClient implements IJupyterApi {
  constructor(
    private readonly jupyterBase: string,  // e.g. "https://lab.v2dev.opensourcebrain.org"
    private readonly baseDomain: string,   // e.g. "v2dev.opensourcebrain.org"
  ) {}

  triggerSpawn(token: string, userId: string, serverName: string): void {
    // Set the session cookie so JupyterHub can authenticate the user
    document.cookie = `accessToken=${token};path=/;domain=.${this.baseDomain};SameSite=Lax`
    // Fire-and-forget — no-cors is intentional, we only need to trigger auth + spawn
    void fetch(
      `${this.jupyterBase}/hub/chlogin?next=%2Fhub%2Fspawn%2F${userId}%2F${serverName}`,
      { credentials: 'include', mode: 'no-cors' },
    )
  }

  async waitUntilReady(
    userId: string,
    serverName: string,
    deadlineMs: number,
    abortRef: { current: boolean },
  ): Promise<boolean> {
    const contentsUrl = `${this.jupyterBase}/user/${userId}/${serverName}/api/contents/`

    while (!abortRef.current && Date.now() < deadlineMs) {
      try {
        const probe = await fetch(contentsUrl, { credentials: 'include' })
        if (probe.ok) return true
        // Any non-502/503 response means the server replied and is not in a transient retry state — stop waiting
        if (probe.status !== 503 && probe.status !== 502) break
      } catch {
        // Network / CORS error — keep retrying
      }
      await sleep(4_000)
    }

    return false
  }

  async uploadFile(userId: string, serverName: string, file: File): Promise<void> {
    const content = await readFileAsBase64(file)
    const res = await fetch(
      `${this.jupyterBase}/user/${userId}/${serverName}/api/contents/${encodeURIComponent(file.name)}`,
      {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          path: file.name,
          type: 'file',
          format: 'base64',
          content,
        }),
      },
    )
    if (!res.ok) {
      throw new Error(`Upload failed: ${res.status} ${res.statusText}`)
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
  })
}
