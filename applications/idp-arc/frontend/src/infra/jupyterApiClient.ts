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
  private jupyterToken: string | null = null

  constructor(
    private readonly jupyterBase: string,  // e.g. "/jupyter-proxy"
  ) {}

  async triggerSpawn(token: string, userId: string, serverName: string): Promise<void> {
    // Step 1: chkclogin — Nginx injects accessToken as Cookie header so JupyterHub
    // validates it and sets the jupyterhub-hub-login session cookie.
    // redirect:'manual' stops at the 302; the browser still stores Set-Cookie from it.
    await fetch(
      `${this.jupyterBase}/hub/chkclogin?accessToken=${encodeURIComponent(token)}`,
      { credentials: 'include', redirect: 'manual' },
    ).catch(() => {})

    // Step 2: Obtain a JupyterHub API token using the hub session cookie.
    // This token bypasses the per-server OAuth flow that cannot complete through the
    // proxy (Keycloak callback URL is hardcoded to lab.v2dev.opensourcebrain.org).
    try {
      const res = await fetch(
        `${this.jupyterBase}/hub/api/users/${userId}/tokens`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: 'idp-arc upload' }),
        },
      )
      if (res.ok) {
        const data = await res.json() as { token: string }
        this.jupyterToken = data.token
      }
    } catch {}

    // Step 3: Spawn the named server. redirect:'manual' stops before the
    // spawn-pending polling loop; waitUntilReady handles readiness independently.
    await fetch(
      `${this.jupyterBase}/hub/spawn/${userId}/${serverName}`,
      { credentials: 'include', redirect: 'manual' },
    ).catch(() => {})
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
          headers: this.authHeaders(),
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
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
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

  private authHeaders(): Record<string, string> {
    return this.jupyterToken ? { Authorization: `token ${this.jupyterToken}` } : {}
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
