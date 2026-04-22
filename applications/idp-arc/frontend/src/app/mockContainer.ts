/**
 * Mock Composition Root — src/app/mockContainer.ts
 *
 * Mirrors container.ts but wires in-memory mock implementations instead of
 * real HTTP/Keycloak adapters. Used when VITE_USE_MOCKS=true (i.e. `pnpm dev:mock`).
 *
 * Exported surface is intentionally identical to container.ts so App.tsx never
 * needs to know which container it is talking to.
 */

import { MockAuthClient } from '../infra/mocks/mockAuthClient'
import { MockWorkspaceApiClient } from '../infra/mocks/mockWorkspaceApiClient'
import { MockJupyterApiClient } from '../infra/mocks/mockJupyterApiClient'
import { createLoadWorkspacesUseCase } from '../core/use-cases/loadWorkspaces'
import { createCreateAndUploadUseCase } from '../core/use-cases/createAndUploadWorkspace'

// ─── Mock infrastructure singletons ──────────────────────────────────────────

export const authClient = new MockAuthClient()

const workspaceApi = new MockWorkspaceApiClient()
const jupyterApi   = new MockJupyterApiClient()

// ─── Use-cases (same factory functions, different adapters) ───────────────────

export const loadWorkspaces = createLoadWorkspacesUseCase(authClient, workspaceApi)
export const createAndUpload = createCreateAndUploadUseCase(authClient, workspaceApi, jupyterApi)

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getWorkspaceUrl(workspaceId: number): string {
  return `/mock/workspaces/${workspaceId}/jupyter`
}
