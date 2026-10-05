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
import { MockDandiApiClient } from '../infra/mocks/mockDandiApiClient'
import { MockObjectStore } from '../infra/mocks/mockObjectStore'
import { createRunProtocolUseCase } from '../core/use-cases/runProtocol'
import type { IObjectStore } from '../core/ports/IObjectStore'
import { createLoadWorkspacesUseCase } from '../core/use-cases/loadWorkspaces'
import { createCreateAndUploadToDandiUseCase } from '../core/use-cases/createAndUploadToDandi'

// ─── Mock infrastructure singletons ──────────────────────────────────────────

export const authClient = new MockAuthClient()

const workspaceApi = new MockWorkspaceApiClient()
const dandiApi     = new MockDandiApiClient()

export const objectStore: IObjectStore = new MockObjectStore()

// ─── Use-cases (same factory functions, different adapters) ───────────────────

export const loadWorkspaces = createLoadWorkspacesUseCase(authClient, workspaceApi)
export const runProtocol = createRunProtocolUseCase(authClient, workspaceApi, objectStore)
export const createAndUploadToDandi = createCreateAndUploadToDandiUseCase(authClient, dandiApi)

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getWorkspaceUrl(workspaceId: number): string {
  return `/mock/workspaces/${workspaceId}/jupyter`
}
