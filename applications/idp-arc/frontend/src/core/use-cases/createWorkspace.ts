import type { IAuthClient } from '../ports/IAuthClient'
import type { IWorkspaceApi } from '../ports/IWorkspaceApi'

/** Creates a new, empty workspace with the given name and returns its id. */
export function createCreateWorkspaceUseCase(
  auth: Pick<IAuthClient, 'getToken'>,
  workspaceApi: Pick<IWorkspaceApi, 'createWorkspace'>,
) {
  return async function createWorkspace(name: string): Promise<number> {
    const token = await auth.getToken(30)
    return workspaceApi.createWorkspace(token, name)
  }
}
