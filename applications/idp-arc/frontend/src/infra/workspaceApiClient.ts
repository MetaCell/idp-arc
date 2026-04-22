import type { IWorkspaceApi } from '../core/ports/IWorkspaceApi'
import type { Workspace } from '../core/types'

/**
 * WorkspaceApiClient — concrete IWorkspaceApi implementation.
 *
 * All fetch() calls to the OSB workspace REST API live here.
 * Use-cases never see fetch — only the IWorkspaceApi interface.
 */
export class WorkspaceApiClient implements IWorkspaceApi {
  constructor(
    private readonly baseApiUrl: string,  // e.g. "https://www.v2dev.opensourcebrain.org/proxy/workspaces/api"
    private readonly listUrl: string,     // full workspaces list URL with pagination params
  ) {}

  async listWorkspaces(token: string): Promise<Workspace[]> {
    const res = await fetch(this.listUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      throw new Error(`Workspace list API responded ${res.status} ${res.statusText}`)
    }
    const data: unknown = await res.json()
    if (Array.isArray(data)) return data as Workspace[]
    const obj = data as Record<string, unknown>
    return (obj.results ?? obj.items ?? obj.workspaces ?? []) as Workspace[]
  }

  async createWorkspace(token: string, name: string): Promise<number> {
    const res = await fetch(`${this.baseApiUrl}/workspace`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: name.trim(), description: name.trim() }),
    })
    if (!res.ok) {
      throw new Error(`Failed to create workspace: ${res.status} ${res.statusText}`)
    }
    const ws = (await res.json()) as { id: number }
    return ws.id
  }
}
