/**
 * EMBER-DANDI's two public domains — the API (`api-dandi...`) and the web UI a human browses
 * (`dandi...`, no `api-` prefix). Shared here so the real client's env-driven origin
 * (`EMBER_ORIGIN` in container.ts) and the mock client's fake dandiset links build off the same
 * values instead of each hardcoding their own copy.
 */
export const EMBER_API_ORIGIN_DEFAULT = 'https://api-dandi.emberarchive.org'
export const EMBER_WEB_ORIGIN = 'https://dandi.emberarchive.org'

/** A dandiset's page on EMBER's own web UI — e.g. for a "view on DANDI" link. */
export function emberDandisetUrl(dandisetId: string, version: string = 'draft'): string {
  return `${EMBER_WEB_ORIGIN}/dandiset/${dandisetId}/${version}`
}
