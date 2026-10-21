import type { IAuthClient } from '../ports/IAuthClient'
import type { IWorkspaceApi } from '../ports/IWorkspaceApi'
import type { Workspace } from '../types'

/**
 * loadWorkspaces use-case
 *
 * Orchestrates: refresh token → fetch workspaces list.
 *
 * DI: all dependencies are injected — no direct imports of fetch or keycloak.
 * Testing: pass fake { getToken, listWorkspaces } plain objects; no mocking framework needed.
 *
 * @example
 * const load = createLoadWorkspacesUseCase(authClient, workspaceApi)
 * const workspaces = await load()
 */
export function createLoadWorkspacesUseCase(
  auth: Pick<IAuthClient, 'getToken'>,
  api: Pick<IWorkspaceApi, 'listWorkspaces'>,
) {
  return async function loadWorkspaces(): Promise<Workspace[]> {
    const token = await auth.getToken(30)
    return api.listWorkspaces(token)
  }
}
