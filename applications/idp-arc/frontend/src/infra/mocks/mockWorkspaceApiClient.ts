import type {
  ImportResourceInput,
  IWorkspaceApi,
  RunStatusResult,
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
  private runs = new Map<string, number>()

  async getWorkspaceResources(_token: string, _workspaceId: number): Promise<WorkspaceResourceState[]> {
    await delay(200)
    this.imports.forEach((i) => { i.pendingPolls -= 1 })
    this.imports = this.imports.filter((i) => i.pendingPolls > 0)
    return this.imports.length
      ? [{ id: -1, name: 'Importing resources into workspace' }, ...this.imports.map((i, n) => ({ id: 100 + n, name: i.name, status: 'p' as const }))]
      : []
  }

  async importResource(_token: string, input: ImportResourceInput): Promise<void> {
    await delay(300)
    console.info(`[MockWorkspaceApiClient] importResource(${input.name} → ${input.folder}/)`)
    this.imports.push({ name: input.name, pendingPolls: 2 })
  }

  async startRun(_token: string, workspaceId: number, input: StartRunInput): Promise<{ workflow: string; outputDir: string }> {
    await delay(300)
    const workflow = `osb-run-notebooks-job-mock${this.runs.size + 1}`
    this.runs.set(workflow, 0)
    console.info(`[MockWorkspaceApiClient] startRun(#${workspaceId}, ${input.notebooksDir}) → ${workflow}`)
    const stamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-')
    return { workflow, outputDir: `${input.outputDir ?? 'results'}/run-${input.name ? `${input.name}-` : ''}${stamp}` }
  }

  async getRun(_token: string, _workspaceId: number, workflow: string): Promise<RunStatusResult> {
    const polls = (this.runs.get(workflow) ?? 0) + 1
    this.runs.set(workflow, polls)
    return { phase: polls < 2 ? 'Pending' : polls < 4 ? 'Running' : 'Succeeded' }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
