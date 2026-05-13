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
    private readonly baseDomain: string,   // e.g. "v2dev.opensourcebrain.org"
  ) {}

  async triggerSpawn(token: string, userId: string, serverName: string): Promise<void> {
    // Set the session cookie so JupyterHub can authenticate the user
    document.cookie = `accessToken=${token};path=/;domain=.${this.baseDomain};SameSite=Lax;Secure`
    // Step 1: chkclogin — Nginx injects accessToken as Cookie header so JupyterHub
    // validates it and sets the jupyterhub-hub-login session cookie.
    // redirect:'manual' stops at the 302; the browser still stores Set-Cookie from it.
    await fetch(
      `${this.jupyterBase}/hub/chkclogin?accessToken=${encodeURIComponent(token)}`,
      { credentials: 'include', redirect: 'manual' },
    ).catch(() => {})

    // Step 2: Spawn the named server. redirect:'manual' stops before the
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
    // Non-API URL used to complete the per-server OAuth dance when the server is up
    // but the per-server cookie hasn't been established yet.
    const serverUrl = `${this.jupyterBase}/user/${userId}/${serverName}/`

    while (!abortRef.current && Date.now() < deadlineMs) {
      try {
        const probe = await fetch(contentsUrl, {
          credentials: 'include',
          redirect: 'error',  // treat auth redirects as "not ready" rather than looping
        })
        if (probe.ok) return true
        if (probe.status === 403) {
          // Server is running but the per-server OAuth cookie is missing.
          // Fetch the HTML endpoint with redirect:'follow': Nginx proxy_redirect rewrites
          // all OAuth redirects back through our proxy, so the per-server
          // jupyterhub-user-{name}-{server} cookie is stored for our host.
          await fetch(serverUrl, { credentials: 'include', redirect: 'follow' }).catch(() => {})
        } else if (probe.status !== 503 && probe.status !== 502 && probe.status !== 404) {
          // Definitive non-retryable failure
          break
        }
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
        headers: {
          'Content-Type': 'application/json',
          'X-XSRFToken': getXsrfToken(),
        },
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

function getXsrfToken(): string {
  const match = document.cookie.match(/(?:^|;)\s*_xsrf=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : ''
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
