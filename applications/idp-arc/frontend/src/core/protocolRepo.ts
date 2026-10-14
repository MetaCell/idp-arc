/**
 * A protocol's repository, from its `repoZipUrl` in protocols.json (GitHub's codeload archive), e.g.
 * `https://codeload.github.com/maracbaylis/four-choice-example/zip/refs/heads/main`.
 */
export interface ProtocolRepo {
  owner: string
  repo: string
  /** Branch, tag or commit. */
  ref: string
  /**
   * The archive's single top-level folder, which OSB's import unpacks the zip into:
   * `<repo>-<ref>`, GitHub dropping a tag's leading `v` (four-choice-example-main).
   */
  folder: string
}

const CODELOAD = /^https:\/\/codeload\.github\.com\/([^/]+)\/([^/]+)\/zip\/(?:refs\/(heads|tags)\/)?(.+)$/

/** The repository a `repoZipUrl` points at, or null if it isn't a GitHub codeload archive URL. */
export function parseRepoZipUrl(url: string | undefined): ProtocolRepo | null {
  const m = url ? CODELOAD.exec(url) : null
  if (!m) return null
  const [, owner, repo, kind, ref] = m
  const folderRef = kind === 'tags' && /^v\d/.test(ref) ? ref.slice(1) : ref
  return { owner, repo, ref, folder: `${repo}-${folderRef.replace(/\//g, '-')}` }
}

/** The repository's page on GitHub, for a `repoZipUrl`; undefined if it isn't a codeload URL. */
export function repoPage(url: string | undefined): string | undefined {
  const r = parseRepoZipUrl(url)
  return r ? `https://github.com/${r.owner}/${r.repo}` : undefined
}
