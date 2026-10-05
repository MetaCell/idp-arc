import type {
  ImportResourceInput,
  IWorkspaceApi,
  StartRunInput,
  WorkspaceResourceState,
} from '../../core/ports/IWorkspaceApi'
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

  async createWorkspace(_token: string, name: string, tags: string[] = []): Promise<number> {
    await delay(600)
    const id = nextId++
    this.workspaces.push({
      id,
      name,
      description: 'Created in mock mode',
      timestamp_created: new Date().toISOString(),
    })
    console.info(`[MockWorkspaceApiClient] createWorkspace("${name}", [${tags.join(', ')}]) → id=${id}`)
    return id
  }

  // Imports: pending for a few polls, then gone (as OSB's scan drops non-indexed files).
  private imports: { name: string; pendingPolls: number }[] = []
  /** What OSB's scan would list once the imports are done: the repository's notebooks. */
  private notebooks: WorkspaceResourceState[] = []
  /** Polls left showing a run as running (OSB's placeholder while its workflow runs). */
  private runPolls = 0
  private runCount = 0

  async getWorkspaceResources(_token: string, _workspaceId: number): Promise<WorkspaceResourceState[]> {
    await delay(200)
    this.imports.forEach((i) => { i.pendingPolls -= 1 })
    this.imports = this.imports.filter((i) => i.pendingPolls > 0)
    if (this.imports.length) {
      return [{ id: -1, name: 'Importing resources into workspace' }, ...this.imports.map((i, n) => ({ id: 100 + n, name: i.name, status: 'p' as const }))]
    }
    if (this.runPolls > 0) {
      this.runPolls -= 1
      return [{ id: -1, name: 'Refreshing resources' }, ...this.notebooks]
    }
    return this.notebooks
  }

  async importResource(_token: string, input: ImportResourceInput): Promise<void> {
    await delay(300)
    console.info(`[MockWorkspaceApiClient] importResource(${input.name} → ${input.folder}/)`)
    this.imports.push({ name: input.name, pendingPolls: 2 })
    if (input.resourceType === 'g') {
      this.notebooks = ['01_load.ipynb', '02_analysis.ipynb'].map((nb, n) => ({
        id: 200 + n, name: nb, status: 'a' as const, path: `${input.folder}/${input.name}/notebooks/${nb}`,
      }))
    }
  }

  async startRun(_token: string, workspaceId: number, input: StartRunInput): Promise<{ workflow: string }> {
    await delay(300)
    const workflow = `osb-run-notebooks-job-mock${++this.runCount}`
    this.runPolls = 3
    console.info(`[MockWorkspaceApiClient] startRun(#${workspaceId}, ${input.repo.dir}: ${input.notebooks.join(', ')}) → ${workflow}`)
    return { workflow }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
