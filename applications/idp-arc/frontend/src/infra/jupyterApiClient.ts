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
    private readonly jupyterBase: string,  // e.g. "/jupyter-proxy"
  ) {}

  triggerSpawn(token: string, userId: string, serverName: string): void {
    // chkclogin reads 'kc-access' or 'accessToken' cookie. From a cross-domain origin
    // (e.g. metacell.us → opensourcebrain.org) the browser blocks cookie writes, so the
    // cookie approach fails silently. We pass the token as a URL param instead — the
    // Nginx reverse proxy injects it as a Cookie header before forwarding to JupyterHub.
    const next = encodeURIComponent(`/hub/spawn/${userId}/${serverName}`)
    void fetch(
      `${this.jupyterBase}/hub/chkclogin?accessToken=${encodeURIComponent(token)}&next=${next}`,
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
        const probe = await fetch(contentsUrl, {
          credentials: 'include',
          redirect: 'error',  // treat auth redirects as "not ready" rather than looping
        })
        if (probe.ok) return true
        // 404 = named server not yet registered in the proxy (transient during spawn)
        // 502/503 = server starting up; anything else is a definitive failure
        if (probe.status !== 503 && probe.status !== 502 && probe.status !== 404) break
      } catch {
        // Network / CORS error or redirect — keep retrying
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
