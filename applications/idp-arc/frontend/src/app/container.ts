/**
 * Composition Root — src/app/container.ts
 *
 * The ONLY file allowed to import from both src/infra/ and src/core/use-cases/.
 * It creates concrete infrastructure instances and wires them into use-cases.
 *
 * Dependency graph (arrows = "depends on"):
 *
 *   App.tsx  ──►  container  ──►  use-cases  ──►  ports (interfaces)
 *                            ──►  infra      ──implements──►  ports
 *
 * Rules enforced by convention:
 *   • core/use-cases/  must NOT import from infra/
 *   • infra/           must NOT import from core/use-cases/
 *   • App.tsx          must NOT import from infra/ directly
 *   • Only container.ts crosses those layer boundaries.
 */

import { KeycloakAuthClient } from '../infra/keycloakAuthClient'
import { WorkspaceApiClient } from '../infra/workspaceApiClient'
import { DandiApiClient } from '../infra/dandiApiClient'
import { PublicBucketObjectStore } from '../infra/publicBucketObjectStore'
import { EmberOAuthClient, EMBER_CALLBACK_PATH } from '../infra/emberOAuthClient'
import { EmberDandiDirectClient } from '../infra/emberDandiDirectClient'
import { EmberUploadApiClient } from '../infra/emberUploadApiClient'
import { EMBER_API_ORIGIN_DEFAULT, EMBER_WEB_ORIGIN } from '../infra/emberUrls'
import type { IObjectStore } from '../core/ports/IObjectStore'
import { createEmberObjectStore } from '../core/use-cases/emberObjectStore'
import { createProtocolDandisetsUseCases, type ProtocolDandiset } from '../core/use-cases/protocolDandisets'
import { createLoadWorkspacesUseCase } from '../core/use-cases/loadWorkspaces'
import { createCreateAndUploadToDandiUseCase } from '../core/use-cases/createAndUploadToDandi'
import { createCreateWorkspaceUseCase } from '../core/use-cases/createWorkspace'
import { createRunProtocolUseCase } from '../core/use-cases/runProtocol'

// ─── Config ───────────────────────────────────────────────────────────────────
// All environment-specific URLs live here (or read from import.meta.env in Vite).

const OSB_DOMAIN     = import.meta.env.VITE_OSB_BASE_DOMAIN ?? 'v2dev.opensourcebrain.org'
const OSB_SCHEME     = import.meta.env.VITE_OSB_PROTOCOL ?? 'https'
const OSB_API_BASE   = import.meta.env.DEV ? '/api-proxy' : `${OSB_SCHEME}://www.${OSB_DOMAIN}`
const WORKSPACES_API = `${OSB_API_BASE}/proxy/workspaces/api`
const WORKSPACES_LIST_URL =
  `${OSB_API_BASE}/proxy/workspaces/api/workspace?page=1&per_page=24&q=&tags=`
const OSB_WEB_ORIGIN = `${OSB_SCHEME}://www.${OSB_DOMAIN}`

/** Where uploads go: `ember` (EMBER-DANDI) or `bucket` (the public bucket named by
 *  VITE_UPLOAD_BUCKET_URL). Change it here to switch. */
export const UPLOAD_BACKEND = 'ember' as 'bucket' | 'ember'
/** EMBER-DANDI's API origin: where the OAuth login goes, and what OSB downloads assets from. */
const EMBER_ORIGIN = (import.meta.env.VITE_EMBER_ORIGIN ?? EMBER_API_ORIGIN_DEFAULT).replace(/\/+$/, '')
/** Same-origin path for the browser's own EMBER calls (Vite proxy in dev, nginx deployed): EMBER's
 *  token response carries no CORS headers. */
const EMBER_FETCH_BASE = '/ember-proxy'

// ─── Infrastructure singletons ────────────────────────────────────────────────

export const authClient = new KeycloakAuthClient({
  url: import.meta.env.VITE_KEYCLOAK_URL ?? 'https://accounts.v2dev.opensourcebrain.org',
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? 'osb2dev',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'maabcd',
})

const workspaceApi = new WorkspaceApiClient(WORKSPACES_API, WORKSPACES_LIST_URL)
// DANDI upload endpoints live in OSB's `workspaces` app (the admin key has to sit wherever
// they run) — same API base as every other workspace call.
const dandiApi     = new DandiApiClient(WORKSPACES_API)

/** Signs the researcher in to EMBER-DANDI (OAuth in a popup, a full-page redirect if it is blocked);
 *  their token stays in the browser. */
export const emberAuth = new EmberOAuthClient({
  authOrigin: EMBER_ORIGIN,
  apiBase: EMBER_FETCH_BASE,
  clientId: import.meta.env.VITE_EMBER_CLIENT_ID ?? '',
  redirectUri: `${window.location.origin}${EMBER_CALLBACK_PATH}`,
})
export { EMBER_CALLBACK_PATH }
export { EmberPopupBlocked, EmberSignInCancelled } from '../infra/emberOAuthClient'
const emberDirect = new EmberDandiDirectClient(EMBER_FETCH_BASE)
/** The researcher's dandisets by protocol, and the workspace each runs in (dandiset metadata). */
const protocolDandisets = createProtocolDandisetsUseCases({
  emberAuth, direct: emberDirect, osbDomain: OSB_DOMAIN, workspaceUrl: (id) => getWorkspaceUrl(id),
})

/** Where uploads go before OSB imports them: the public bucket (Scenario 1), or EMBER-DANDI
 *  (Scenario 2: the researcher's own dandiset, plus the protocol's MAABCD dandiset through OSB). */
export const objectStore: IObjectStore = UPLOAD_BACKEND === 'ember'
  ? createEmberObjectStore(authClient, emberAuth, emberDirect, new EmberUploadApiClient(WORKSPACES_API), protocolDandisets, EMBER_ORIGIN)
  : new PublicBucketObjectStore(import.meta.env.VITE_UPLOAD_BUCKET_URL)

// ─── Use-cases (injected with their concrete dependencies) ────────────────────

/** Refreshes the token then returns the workspace list. */
export const loadWorkspaces = createLoadWorkspacesUseCase(authClient, workspaceApi)

/** Creates a new, empty workspace with the given name. */
export const createWorkspace = createCreateWorkspaceUseCase(authClient, workspaceApi)

/** Uploads the researcher's file, imports it and the protocol's repository into the workspace
 * through OSB, and runs the notebooks in OSB's Argo task (MAABCD–OSB design). */
export const runProtocol = createRunProtocolUseCase(authClient, workspaceApi, objectStore)

/** DANDI-backed upload (Route A, see IDP-43 notes); `finalize` also runs the selected
 * protocol's script server-side (jupyter_kernel_client.py in OSBv2's workspaces app). */
export const createAndUploadToDandi = createCreateAndUploadToDandiUseCase(authClient, dandiApi)

/** The researcher's EMBER-DANDI dandisets for a protocol, each with the workspace it runs in when
 *  they still have it: what the upload dialog offers once a protocol is chosen. */
export async function listProtocolDandisets(protocolId: string): Promise<ProtocolDandiset[]> {
  const ownWorkspaceIds = (await loadWorkspaces()).map((w) => Number(w.id))
  return protocolDandisets.listForProtocol(protocolId, ownWorkspaceIds)
}
export type { ProtocolDandiset }

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** The researcher's workspaces on OSB ("My workspaces"). */
export const OSB_WORKSPACES_URL = `${OSB_WEB_ORIGIN}/`

/** The signed-in researcher's own dandisets on EMBER-DANDI's website. */
export const MY_DANDISETS_URL = `${EMBER_WEB_ORIGIN}/dandiset/my`

/**
 * Builds the public URL for a given workspace id.
 * Centralised here so no component needs to know OSB_DOMAIN.
 */
export function getWorkspaceUrl(workspaceId: number): string {
  return `${OSB_WEB_ORIGIN}/workspaces/open/${workspaceId}/jupyter`
}
