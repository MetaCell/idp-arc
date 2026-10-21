import type { Workspace } from '../types'

/** A resource of a workspace as `GET /workspace/{id}` lists it (only what the run needs). */
export interface WorkspaceResourceState {
  /** -1 for OSB's "Importing resources" placeholder, listed while an import is still running. */
  id: number
  name: string
  /** `p` pending (being imported), `a` available, `e` error. */
  status?: 'p' | 'a' | 'e'
  /** Where it is on the volume, e.g. `idp/<upload id>/repo/<repo>/notebooks/01_load.ipynb`. */
  path?: string
}

export interface ImportResourceInput {
  workspaceId: number
  /** Shown in OSB. */
  name: string
  /** Where OSB's import task fetches it from. */
  url: string
  /** Volume folder it lands in (a zip is unpacked there), e.g. `idp/<upload id>/data`. */
  folder: string
  /** OSB resource type: `e` data, `g` a repository. */
  resourceType: 'e' | 'g'
}

/** POST /workspace/{id}/run: what to run, how to set it up, and where its files go (all paths relative). */
export interface StartRunInput {
  /** The repository on the volume; `discard` removes it once the run has copied it. */
  repo: { dir: string; discard?: boolean }
  /** Set-up paths in the repository; OSB skips the ones it doesn't have. */
  setup?: { requirements?: string; pythonPath?: string[]; install?: string[] }
  /** The notebooks to run, relative to repo.dir, in this order. */
  notebooks: string[]
  /** The notebooks' INPUT_DIR parameter: the run's input on the volume. */
  inputDir?: string
  /** The notebooks' OUTPUT_DIR parameter: where they write their results on the volume. */
  outputDir: string
  /** Where the executed notebooks and the log go on the volume. */
  results: { notebooks: string; log: string }
  /** The image the notebooks run in: an OSB application's name or an image reference. OSB's JupyterLab without it. */
  image?: string
}

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
   * Creates a new workspace and returns its numeric id (its volume exists when this returns).
   * @param token  Bearer token for authorisation.
   * @param name   Display name for the new workspace.
   * @param tags   OSB tags, e.g. `maabcd:<protocolId>` so the protocol's workspace can be found again.
   */
  createWorkspace(token: string, name: string, tags?: string[]): Promise<number>

  /** The workspace's resources (`GET /workspace/{id}`). */
  getWorkspaceResources(token: string, workspaceId: number): Promise<WorkspaceResourceState[]>

  /** Imports a URL into the workspace (`POST /workspaceresource`); OSB copies it asynchronously. */
  importResource(token: string, input: ImportResourceInput): Promise<void>

  /** Runs notebooks in the workspace (`POST /workspace/{id}/run`); returns at once. */
  startRun(token: string, workspaceId: number, input: StartRunInput): Promise<{ workflow: string }>
}
