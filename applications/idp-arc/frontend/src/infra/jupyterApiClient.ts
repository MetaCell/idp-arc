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
  // Captured from the first successful contents probe; Nginx echoes the _xsrf
  // cookie value as X-XSRF-Token so we can read it even when the cookie path
  // makes it inaccessible via document.cookie.
  private xsrfToken = ''

  constructor(
    private readonly jupyterBase: string,  // e.g. "/jupyter-proxy"
    private readonly baseDomain: string,   // e.g. "v2dev.opensourcebrain.org"
  ) {}

  async triggerSpawn(token: string, userId: string, serverName: string, workspaceId: string): Promise<void> {
    // Production: set domain cookies so the browser sends them to lab.domain.
    document.cookie = `accessToken=${token};path=/;domain=.${this.baseDomain};SameSite=Lax;Secure`
    document.cookie = `workspaceId=${workspaceId};path=/;domain=.${this.baseDomain};SameSite=Lax;Secure`
    // Dev (localhost): set the same cookies without a domain restriction so the
    // browser sends them to localhost:5173, and the Vite proxy forwards them to
    // lab.v2dev.opensourcebrain.org in the Cookie header.
    // kc-access is the cookie name chkclogin checks first.
    document.cookie = `kc-access=${token};path=/;SameSite=Lax`
    document.cookie = `accessToken=${token};path=/;SameSite=Lax`
    document.cookie = `workspaceId=${workspaceId};path=/;SameSite=Lax`

    // Step 1: chkclogin — the accessToken URL param lets nginx inject it as a
    // Cookie even before the browser has stored it. Sets the hub session cookie.
    await fetch(
      `${this.jupyterBase}/hub/chkclogin?accessToken=${encodeURIComponent(token)}`,
      { credentials: 'include', redirect: 'manual' },
    ).catch(() => {})

    // Step 2: Spawn — NO accessToken URL param here. If it were present, nginx's
    // map $arg_accessToken $proxy_cookie would replace ALL browser cookies with
    // just "accessToken=…", dropping workspaceId. Without it, nginx forwards all
    // browser cookies (including workspaceId) so the spawner hook can mount the
    // correct workspace PVC.
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
    const labUrl = `${this.jupyterBase}/user/${userId}/${serverName}/lab`

    while (!abortRef.current && Date.now() < deadlineMs) {
      try {
        // First probe /lab via fetch to see its actual status (before iframe).
        // JupyterHub serves a 200 "spawning" page while the server starts, and
        // only 302→OAuth when the server is running but lacks a per-server cookie.
        const labProbe = await fetch(labUrl, {
          credentials: 'include',
          redirect: 'manual',
        })
        const labStatus = labProbe.status
        const labCT = labProbe.headers.get('content-type') ?? ''
        console.log('[waitUntilReady] /lab status:', labStatus, 'content-type:', labCT)

        if (labStatus === 0 || labStatus === 302 || labStatus === 303) {
          // Opaque redirect — JupyterLab is running but needs per-server OAuth.
          // Load in hidden iframe so each redirect stores its cookies properly.
          console.log('[waitUntilReady] /lab needs OAuth dance, loading in iframe…')
          await this.loadInHiddenFrame(labUrl)
          // Give the browser a moment to flush the Set-Cookie from the callback.
          await sleep(1_000)
        } else if (labStatus === 200 && labCT.includes('text/html')) {
          // Check if this is the spawn-pending page or actual JupyterLab.
          const body = await labProbe.text()
          const isSpawning = body.includes('spawn') || body.includes('Spawning') || !body.includes('JupyterLab')
          console.log('[waitUntilReady] /lab 200 HTML, isSpawning:', isSpawning)
          if (isSpawning) {
            // Still starting — probe contents will fail; just wait.
            await sleep(4_000)
            continue
          }
          // JupyterLab is up. The iframe-based OAuth may have already run in a
          // prior iteration. Now probe contents directly.
        }

        const probe = await fetch(contentsUrl, {
          credentials: 'include',
          redirect: 'follow',
          // jupyter_server ≥2 rejects cookie-authenticated API requests that lack
          // a matching _xsrf token — even GETs (cross-site hardening) — with a
          // bare 403 "Forbidden" (the real reason is logged server-side, not in
          // the body). Send the user-server _xsrf (readable at Path=/ after the
          // proxy cookie-path fix) as X-XSRFToken, same as the upload PUT does.
          headers: { 'X-XSRFToken': this.xsrfToken || getXsrfToken() },
        })

        console.log('[waitUntilReady] /api/contents/ status:', probe.status,
          'cookies visible:', document.cookie.split(';').map(c => c.trim().split('=')[0]).join(','))
        if (probe.ok) {
          if ((probe.headers.get('content-type') ?? '').includes('application/json')) {
            const xsrf = probe.headers.get('X-XSRF-Token') ?? getXsrfToken()
            if (xsrf) this.xsrfToken = xsrf
            return true
          }
          // HTML response = spawn-pending page, keep polling.
        } else if (probe.status === 403) {
          // Log WHY it's 403 — the body disambiguates XSRF ("'_xsrf' argument
          // missing" / "XSRF cookie does not match") from an origin/scope reject.
          const body403 = await probe.text().catch(() => '')
          console.log('[waitUntilReady] /api/contents/ 403 body:', body403.slice(0, 300))
          console.log('[waitUntilReady]   _xsrf cookie:', getXsrfToken().slice(0, 12),
            '| X-XSRF-Token hdr:', probe.headers.get('X-XSRF-Token'))
          await this.loadInHiddenFrame(labUrl)
          await sleep(1_000)
        } else if (probe.status !== 503 && probe.status !== 502 && probe.status !== 404) {
          break
        }
      } catch (e) {
        console.log('[waitUntilReady] error:', e)
      }
      await sleep(4_000)
    }

    return false
  }

  async uploadFile(token: string, userId: string, serverName: string, file: File): Promise<void> {
    const labUrl = `${this.jupyterBase}/user/${userId}/${serverName}/lab`
    const contentsUrl = `${this.jupyterBase}/user/${userId}/${serverName}/api/contents/${encodeURIComponent(file.name)}`
    const content = await readFileAsBase64(file)
    const uploadDeadline = Date.now() + 300_000 // 5 minutes to land a successful PUT

    while (Date.now() < uploadDeadline) {
      // Ensure the per-server session cookie is present before attempting the
      // PUT. Use a hidden iframe instead of fetch(redirect:'follow') — fetch
      // does not store cookies from intermediate redirect responses before
      // firing the next request in the chain, causing an infinite OAuth loop.
      await this.loadInHiddenFrame(labUrl)

      const xsrf = this.xsrfToken || getXsrfToken()
      console.log('[uploadFile] xsrf:', xsrf ? `"${xsrf.slice(0, 10)}…"` : '(empty)')
      console.log('[uploadFile] content length (chars):', content.length)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 120_000)

      try {
        const res = await fetch(contentsUrl, {
          method: 'PUT',
          credentials: 'include',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'X-XSRFToken': xsrf,
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: file.name,
            path: file.name,
            type: 'file',
            format: 'base64',
            content,
          }),
        })
        console.log('[uploadFile] response:', res.status, res.statusText)
        if (res.ok) return

        if (res.status === 405 || res.status === 502 || res.status === 503) {
          await sleep(10_000)
          continue
        }

        const body = await res.text().catch(() => '')
        throw new Error(`Upload failed: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ''}`)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw new Error('Upload timed out after 2 minutes — the JupyterLab server did not respond.')
        }
        throw err
      } finally {
        clearTimeout(timeoutId)
      }
    }

    throw new Error(
      'JupyterLab did not become ready for upload within 5 minutes. ' +
      'The workspace was created — you can open it and upload the file manually.',
    )
  }

  /**
   * Load a URL in a zero-size hidden iframe and resolve when the frame fires
   * its load or error event (or after timeoutMs, whichever comes first).
   *
   * This is used to complete the JupyterHub per-server OAuth dance. Unlike
   * fetch(redirect:'follow'), iframe navigation stores Set-Cookie headers from
   * each intermediate redirect response before making the next request, so the
   * per-server session cookie set by /oauth_callback is available when the
   * browser follows the final redirect to /lab.
   */
  private loadInHiddenFrame(url: string, timeoutMs = 8_000): Promise<void> {
    return new Promise((resolve) => {
      const frame = document.createElement('iframe')
      frame.style.cssText =
        'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:0;opacity:0;pointer-events:none;'
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try { frame.parentNode?.removeChild(frame) } catch {}
        resolve()
      }
      const timer = setTimeout(finish, timeoutMs)
      frame.addEventListener('load', finish)
      frame.addEventListener('error', finish)
      document.body.appendChild(frame)
      frame.src = url
    })
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
