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
import { createLoadWorkspacesUseCase } from '../core/use-cases/loadWorkspaces'
import { createCreateAndUploadToDandiUseCase } from '../core/use-cases/createAndUploadToDandi'

// ─── Config ───────────────────────────────────────────────────────────────────
// All environment-specific URLs live here (or read from import.meta.env in Vite).

// Target environment. Defaults to the shared dev deployment; override in .env.local to point
// at a local minikube OSB (see .vscode/plans/osb-local-deployment.md):
//   VITE_OSB_BASE_DOMAIN=osb.local
//   VITE_OSB_PROTOCOL=http          # local is deployed with -dtls, so no TLS
//   VITE_KEYCLOAK_URL=http://accounts.osb.local
//   VITE_KEYCLOAK_REALM=ch          # local realm is `ch`, the dev one is `osb2dev`
const BASE_DOMAIN    = import.meta.env.VITE_OSB_BASE_DOMAIN ?? 'v2dev.opensourcebrain.org'
const PROTOCOL       = import.meta.env.VITE_OSB_PROTOCOL ?? 'https'
const WWW_BASE       = import.meta.env.DEV ? '/api-proxy' : `${PROTOCOL}://www.${BASE_DOMAIN}`
const WORKSPACES_API = `${WWW_BASE}/proxy/workspaces/api`
const WORKSPACES_LIST_URL =
  `${WWW_BASE}/proxy/workspaces/api/workspace?page=1&per_page=24&q=&tags=`
const FRONTEND_BASE  = `${PROTOCOL}://www.${BASE_DOMAIN}`

// ─── Infrastructure singletons ────────────────────────────────────────────────

export const authClient = new KeycloakAuthClient({
  url: import.meta.env.VITE_KEYCLOAK_URL ?? 'https://accounts.v2dev.opensourcebrain.org',
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? 'osb2dev',
  clientId: 'idp-arc',
})

const workspaceApi = new WorkspaceApiClient(WORKSPACES_API, WORKSPACES_LIST_URL)
// DANDI upload endpoints live in OSB's `workspaces` app (the admin key has to sit wherever
// they run, per Dario) — same API base as every other workspace call.
const dandiApi     = new DandiApiClient(WORKSPACES_API)

// ─── Use-cases (injected with their concrete dependencies) ────────────────────

/** Refreshes the token then returns the workspace list. */
export const loadWorkspaces = createLoadWorkspacesUseCase(authClient, workspaceApi)

/** DANDI-backed upload (Route A, see IDP-43 notes); `finalize` also runs the selected
 * protocol's script server-side (jupyter_kernel_client.py in OSBv2's workspaces app). */
export const createAndUploadToDandi = createCreateAndUploadToDandiUseCase(authClient, dandiApi)

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds the public URL for a given workspace id.
 * Centralised here so no component needs to know BASE_DOMAIN.
 */
export function getWorkspaceUrl(workspaceId: number): string {
  return `${FRONTEND_BASE}/workspaces/open/${workspaceId}/jupyter`
}
