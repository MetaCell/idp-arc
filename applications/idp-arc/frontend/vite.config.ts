import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import type { IncomingMessage } from 'node:http'

// The real JupyterHub host — matches production nginx proxy_pass target.
// www.v2dev.opensourcebrain.org blocks PUT on /jupyter-proxy/; lab. does not.
const LAB_ORIGIN = 'https://lab.v2dev.opensourcebrain.org'
const DEV_ORIGIN = 'http://localhost:5173'

// Mirrors the production nginx proxy_redirect rules (default.conf lines 71-72):
//   proxy_redirect https://lab.v2dev.opensourcebrain.org/ https://$host/jupyter-proxy/;
//   proxy_redirect / https://$host/jupyter-proxy/;
//
// Also strips Secure/SameSite from cookies (http://localhost needs this) and
// echoes _xsrf as X-XSRF-Token (mirrors production nginx add_header on line 36).
// Mirror production nginx proxy_cookie_path (default.conf lines 62-66):
//   proxy_cookie_path ~^/hub(/.*)?$                /jupyter-proxy/;   (hub cookies)
//   proxy_cookie_path ~^/(?!hub|jupyter-proxy)(.*)   /;               (everything else)
//
// Do NOT collapse every cookie to Path=/. JupyterHub sets a hub-side _xsrf
// (Path=/hub/) and JupyterLab sets a user-server _xsrf (Path=/user/<id>/<srv>/).
// Collapsing both to / makes them collide (same name+domain+path) so the last
// write wins — often the HUB's _xsrf, which the user-server rejects → 403 on
// /api/contents/. Keeping hub cookies at /jupyter-proxy/ and user-server cookies
// at / lets both coexist; the user-server's _xsrf (the one JupyterLab validates)
// is the one sent to /api/contents/.
function rewriteCookiePath(cookie: string): string {
  return cookie.replace(/;\s*Path=([^;]*)/i, (_full, rawPath: string) => {
    const p = rawPath.trim()
    if (/^\/hub(\/.*)?$/.test(p)) return '; Path=/jupyter-proxy/'
    return '; Path=/'
  })
}

function patchProxyResponse(proxyRes: IncomingMessage) {
  const loc = proxyRes.headers['location']
  if (typeof loc === 'string') {
    if (loc.startsWith(LAB_ORIGIN)) {
      // Absolute redirect from lab. → route back through /jupyter-proxy dev proxy
      proxyRes.headers['location'] = loc.replace(LAB_ORIGIN, `${DEV_ORIGIN}/jupyter-proxy`)
    } else if (loc.startsWith('/') && !loc.startsWith('/jupyter-proxy')) {
      // Relative redirect (e.g. /hub/oauth_login) → prefix so Vite proxy picks it up
      proxyRes.headers['location'] = '/jupyter-proxy' + loc
    }
  }

  const raw = proxyRes.headers['set-cookie']
  if (!raw) return
  const cookies = Array.isArray(raw) ? raw : [raw]

  // Echo _xsrf value as X-XSRF-Token (mirrors production nginx add_header on line 36)
  const xsrfCookie = cookies.find((c) => /^_xsrf=/.test(c))
  if (xsrfCookie) {
    const m = xsrfCookie.match(/^_xsrf=([^;]+)/)
    if (m) proxyRes.headers['x-xsrf-token'] = decodeURIComponent(m[1])
  }

  proxyRes.headers['set-cookie'] = cookies.map((c) =>
    rewriteCookiePath(
      c
        .replace(/;\s*Secure/gi, '')
        .replace(/;\s*SameSite=None/gi, '; SameSite=Lax'),
    ),
  )
}

export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true,
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: true
    },
    proxy: {
      '/api-proxy': {
        target: 'https://www.v2dev.opensourcebrain.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-proxy/, ''),
      },
      '/jupyter-proxy': {
        target: LAB_ORIGIN,
        changeOrigin: true,
        cookieDomainRewrite: '',
        rewrite: (path) => path.replace(/^\/jupyter-proxy/, ''),
        configure: (proxy) => {
          // Mirror nginx: map $arg_accessToken $proxy_cookie — inject accessToken
          // and workspaceId URL params as Cookie headers so the JupyterHub
          // chkclogin handler and spawner hook can read them even from localhost.
          proxy.on('proxyReq', (proxyReq, req) => {
            // Jupyter Server rejects API requests (e.g. /api/contents/) whose
            // Origin/Referer host is not in its allow_origin. The dev app runs on
            // http://localhost:5173, which JupyterHub does not trust, so the GET
            // probe 403s even with valid cookies. Rewrite both to the upstream
            // origin so the single-user server sees a same-origin request.
            // (Production serves the app from a trusted *.opensourcebrain.org
            // origin, so nginx has no equivalent rule.)
            proxyReq.setHeader('Origin', LAB_ORIGIN)
            proxyReq.setHeader('Referer', `${LAB_ORIGIN}/`)

            const url = req.url ?? ''
            const qIdx = url.indexOf('?')
            if (qIdx === -1) return
            const params = new URLSearchParams(url.slice(qIdx + 1))
            const additions: string[] = []
            const token = params.get('accessToken')
            const wsId  = params.get('workspaceId')
            if (token) additions.push(`accessToken=${token}`)
            if (wsId)  additions.push(`workspaceId=${wsId}`)
            if (additions.length === 0) return
            const existing = (proxyReq.getHeader('Cookie') as string) ?? ''
            proxyReq.setHeader(
              'Cookie',
              [existing, ...additions].filter(Boolean).join('; '),
            )
          })
          proxy.on('proxyRes', (proxyRes) => {
            patchProxyResponse(proxyRes)
          })
        },
      },
      // Required so the per-server JupyterHub OAuth dance can complete:
      // visiting /jupyter-proxy/user/.../serverName/ redirects through /oauth/authorize
      // and /oauth/callback — without proxying these the redirects hit Vite's SPA
      // fallback and the per-server cookie (needed for write access) is never set.
      '/oauth': {
        target: 'https://www.v2dev.opensourcebrain.org',
        changeOrigin: true,
        cookieDomainRewrite: '',
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            patchProxyResponse(proxyRes)
          })
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  }
})
