import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import http from 'node:http'
import https from 'node:https'

// Must use loadEnv(), not process.env — Vite doesn't load .env into process.env for this
// file, so process.env here silently falls back to the production domain.
const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '')
const BASE_DOMAIN = env.VITE_OSB_BASE_DOMAIN || 'v2dev.opensourcebrain.org'
const PROTOCOL    = env.VITE_OSB_PROTOCOL || 'https'

const WWW_ORIGIN = `${PROTOCOL}://www.${BASE_DOMAIN}`

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
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  }
})
