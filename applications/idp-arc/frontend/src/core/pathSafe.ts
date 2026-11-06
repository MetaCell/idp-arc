/** One DANDI asset path segment: DANDI rejects `@` and the like, and `/` would add segments.
 *  Runs of other characters become one `-`; none is left dangling before the extension. */
export function pathSafe(value: string): string {
  return value
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/-+(\.[A-Za-z0-9]+)?$/, '$1')
    .replace(/^[-._]+|[-._]+$/g, '') || 'unknown'
}
