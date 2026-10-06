// Lets `node --test` load src/ modules that import each other without a file extension, the way
// Vite resolves them (`import … from '../dandisetWorkspaceLink'`). Registered via `--import` in
// the `test:unit` script. Relative specifiers without an extension get `.ts`, then `/index.ts`.
import { register } from 'node:module'

register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    try {
      return await next(specifier, context)
    } catch (err) {
      const relative = specifier.startsWith('./') || specifier.startsWith('../')
      const hasExt = /\\.[cm]?[jt]sx?$|\\.json$/.test(specifier)
      if (err?.code !== 'ERR_MODULE_NOT_FOUND' || !relative || hasExt) throw err
      for (const candidate of [specifier + '.ts', specifier + '/index.ts']) {
        try { return await next(candidate, context) } catch { /* try the next one */ }
      }
      throw err
    }
  }
`))
