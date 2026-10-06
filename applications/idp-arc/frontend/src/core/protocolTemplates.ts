/**
 * Where to download a protocol's templates archive (`templatesZipUrl` in protocols.json).
 *
 * A relative path points into public/ and is served under the app's base URL; an absolute URL is
 * used as-is. Returns null when the protocol has no archive, so its download buttons are disabled.
 */
export function templatesZipHref(protocol: object | undefined, baseUrl: string = import.meta.env.BASE_URL): string | null {
  if (!protocol || !('templatesZipUrl' in protocol)) return null
  const url = protocol.templatesZipUrl
  if (typeof url !== 'string' || !url) return null
  return /^[a-z]+:\/\//i.test(url) ? url : `${baseUrl.replace(/\/?$/, '/')}${url.replace(/^\//, '')}`
}

/** File name the browser saves the archive under (`<id>-templates.zip`). */
export function templatesZipFileName(protocol: { id: string }): string {
  return `${protocol.id}-templates.zip`
}
