import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const useMocks = process.env.VITE_USE_MOCKS === 'true'

const containerPath   = path.resolve(__dirname, './src/app/container.ts')
const mockContainerPath = path.resolve(__dirname, './src/app/mockContainer.ts')

/**
 * When VITE_USE_MOCKS=true, redirect any resolved import of container.ts to
 * mockContainer.ts at the module-resolution level (before Vite caches it).
 */
function mockContainerPlugin(): Plugin {
  return {
    name: 'mock-container',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!useMocks || !importer) return
      const resolved = path.resolve(path.dirname(importer), id)
      if (resolved === containerPath || resolved === containerPath.replace('.ts', '')) {
        return mockContainerPath
      }
    },
  }
}

export default defineConfig({
  plugins: [mockContainerPlugin(), react()],
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
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  }
})
