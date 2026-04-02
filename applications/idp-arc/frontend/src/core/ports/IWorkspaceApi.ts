import type { Workspace } from '../types'

/**
 * IWorkspaceApi — abstraction over the OSB workspace REST API.
 *
 * DIP rule: use-cases depend on this interface, not on fetch() or any HTTP client.
 * The real HTTP implementation lives in src/infra/workspaceApiClient.ts.
 * In tests you pass a plain object that satisfies this shape — no vi.mock() needed.
 */
export interface IWorkspaceApi {
  /** Fetches the paginated list of workspaces for the current user. */
  listWorkspaces(token: string): Promise<Workspace[]>

  /**
   * Creates a new workspace and returns its numeric id.
   * @param token  Bearer token for authorisation.
   * @param name   Display name for the new workspace.
   */
  createWorkspace(token: string, name: string): Promise<number>
}
