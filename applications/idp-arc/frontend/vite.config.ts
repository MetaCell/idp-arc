import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'

// Must use loadEnv(), not process.env — Vite doesn't load .env into process.env for this
// file, so process.env here silently falls back to the production domain.
const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '')
const BASE_DOMAIN = env.VITE_OSB_BASE_DOMAIN || 'v2dev.opensourcebrain.org'
const PROTOCOL    = env.VITE_OSB_PROTOCOL || 'https'

const WWW_ORIGIN = `${PROTOCOL}://www.${BASE_DOMAIN}`
/**
 * Optional HTTPS for the dev server: EMBER-DANDI's OAuth application only accepts https://
 * redirect URIs, so its sign-in needs https://localhost:5173 (registered as
 * https://localhost:5173/ember-callback). Opt in with DEV_HTTPS=true in .env.local and a cert:
 *   openssl req -x509 -newkey rsa:2048 -keyout .certs/key.pem -out .certs/cert.pem \
 *     -days 365 -nodes -subj "/CN=localhost"
 */
function loadDevHttpsCerts(): { key: Buffer; cert: Buffer } | undefined {
  if (env.DEV_HTTPS !== 'true') return undefined
  const certDir = path.resolve(__dirname, '.certs')
  if (!fs.existsSync(`${certDir}/cert.pem`)) {
    console.warn('[vite] DEV_HTTPS=true but .certs/cert.pem is missing — falling back to http')
    return undefined
  }
  return { key: fs.readFileSync(`${certDir}/key.pem`), cert: fs.readFileSync(`${certDir}/cert.pem`) }
}
const devHttps = loadDevHttpsCerts()

// EMBER-DANDI's API: the browser's own EMBER calls go through /ember-proxy, because EMBER's
// OAuth token response carries no CORS headers. Deployed, nginx does the same (default.conf).
const EMBER_ORIGIN = env.VITE_EMBER_ORIGIN || 'https://api-dandi.emberarchive.org'

// eslint-disable-next-line no-console
console.log(`[vite] proxying OSB -> ${WWW_ORIGIN}`)

// IPv4 lookups and reused connections for every proxied call. macOS resolves `*.local` names
// (local minikube: `osb.local`) through multicast DNS first, and the IPv6 query only falls back
// to /etc/hosts after a 5 s timeout, which Node paid on each new upstream connection: every
// proxied request took 5 s or more (measured 30 Sep: 5018 ms default lookup vs 6 ms for IPv4).
const agentOptions = { keepAlive: true, family: 4 }
const upstreamAgent = PROTOCOL === 'https' ? new https.Agent(agentOptions) : new http.Agent(agentOptions)

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
    ...(devHttps ? { https: devHttps } : {}),
    watch: {
      usePolling: true
    },
    proxy: {
      '/api-proxy': {
        target: WWW_ORIGIN,
        agent: upstreamAgent,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-proxy/, ''),
      },
      '/ember-proxy': {
        target: EMBER_ORIGIN,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ember-proxy/, ''),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  }
})
