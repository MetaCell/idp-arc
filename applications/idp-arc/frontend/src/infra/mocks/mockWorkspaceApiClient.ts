import type { IWorkspaceApi } from '../../core/ports/IWorkspaceApi'
import type { Workspace } from '../../core/types'

const MOCK_WORKSPACES: Workspace[] = [
  {
    id: 1,
    name: 'Mock Workspace Alpha',
    description: 'A sample workspace for local development',
    timestamp_created: '2024-01-15T10:00:00Z',
    thumbnail: undefined,
  },
  {
    id: 2,
    name: 'Mock Workspace Beta',
    description: 'Another workspace with a longer description to test truncation',
    timestamp_created: '2024-02-20T14:30:00Z',
    thumbnail: undefined,
  },
  {
    id: 3,
    name: 'Neuroscience Project',
    description: 'Simulated neuroscience data workspace',
    timestamp_created: '2024-03-05T09:15:00Z',
    thumbnail: undefined,
  },
]

let nextId = 4

/**
 * MockWorkspaceApiClient — in-memory stub for IWorkspaceApi.
 *
 * • listWorkspaces() returns the static MOCK_WORKSPACES list after a short delay
 * • createWorkspace() appends a new workspace and returns its id
 */
export class MockWorkspaceApiClient implements IWorkspaceApi {
  private workspaces: Workspace[] = [...MOCK_WORKSPACES]

  async listWorkspaces(_token: string): Promise<Workspace[]> {
    await delay(400)
    console.info('[MockWorkspaceApiClient] listWorkspaces()', this.workspaces)
    return [...this.workspaces]
  }

  async createWorkspace(_token: string, name: string): Promise<number> {
    await delay(600)
    const id = nextId++
    this.workspaces.push({
      id,
      name,
      description: 'Created in mock mode',
      timestamp_created: new Date().toISOString(),
    })
    console.info(`[MockWorkspaceApiClient] createWorkspace("${name}") → id=${id}`)
    return id
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
