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

export interface StartRunInput {
  /** The repository on the volume. */
  repoDir: string
  /** The notebooks to run, relative to repoDir, in the order to run them. */
  notebooks: string[]
  /** The imported data on the volume, if any. */
  inputPath?: string
  /** Repository-relative folder the notebooks read their input from; required with inputPath. */
  inputDir?: string
  /** Repository-relative folders whose contents are the run's results; emptied before the run. */
  outputs?: string[]
  /** Requirements file to pip-install first, if the repository has it. */
  requirements?: string
  /** Folders to put on PYTHONPATH, the ones the repository has. */
  pythonPath?: string[]
  /** Install candidates (a .py to run, or a setup.py / pyproject.toml); OSB uses the first it finds. */
  install?: string[]
  /** Results folder on the volume; the run adds its own folder, `run-[<name>-]<UTC timestamp>`. */
  outputDir?: string
  /** Short name for the run's folder (the protocol id): lowercase letters, digits and `-`. */
  name?: string
}

export interface RunStatusResult {
  phase: 'Pending' | 'Running' | 'Succeeded' | 'Failed'
  message?: string
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
  startRun(token: string, workspaceId: number, input: StartRunInput): Promise<{ workflow: string; outputDir: string }>

  /** A run's state (`GET /workspace/{id}/run/{workflow}`). */
  getRun(token: string, workspaceId: number, workflow: string): Promise<RunStatusResult>
}
