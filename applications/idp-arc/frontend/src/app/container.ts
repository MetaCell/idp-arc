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
import { JupyterApiClient } from '../infra/jupyterApiClient'
import { createLoadWorkspacesUseCase } from '../core/use-cases/loadWorkspaces'
import { createCreateAndUploadUseCase } from '../core/use-cases/createAndUploadWorkspace'

// ─── Config ───────────────────────────────────────────────────────────────────
// All environment-specific URLs live here (or read from import.meta.env in Vite).

const BASE_DOMAIN    = 'v2dev.opensourcebrain.org'
const WWW_BASE       = import.meta.env.DEV ? '/api-proxy' : `https://www.${BASE_DOMAIN}`
const WORKSPACES_API = `${WWW_BASE}/proxy/workspaces/api`
const WORKSPACES_LIST_URL =
  `${WWW_BASE}/proxy/workspaces/api/workspace?page=1&per_page=24&q=&tags=`
const JUPYTER_BASE   = `https://lab.${BASE_DOMAIN}`
const HUB_BASE       = `https://www.${BASE_DOMAIN}`
const FRONTEND_BASE  = `https://www.${BASE_DOMAIN}`

// ─── Infrastructure singletons ────────────────────────────────────────────────

export const authClient = new KeycloakAuthClient({
  url: 'https://accounts.v2dev.opensourcebrain.org',
  realm: 'osb2dev',
  clientId: 'idp-arc',
})

const workspaceApi = new WorkspaceApiClient(WORKSPACES_API, WORKSPACES_LIST_URL)
const jupyterApi   = new JupyterApiClient(JUPYTER_BASE, HUB_BASE, BASE_DOMAIN)

// ─── Use-cases (injected with their concrete dependencies) ────────────────────

/** Refreshes the token then returns the workspace list. */
export const loadWorkspaces = createLoadWorkspacesUseCase(authClient, workspaceApi)

/** Runs the 4-step create-workspace + file-upload workflow. */
export const createAndUpload = createCreateAndUploadUseCase(authClient, workspaceApi, jupyterApi)

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds the public URL for a given workspace id.
 * Centralised here so no component needs to know BASE_DOMAIN.
 */
export function getWorkspaceUrl(workspaceId: number): string {
  return `${FRONTEND_BASE}/workspaces/open/${workspaceId}/jupyter`
}
