import type { IAuthClient } from '../ports/IAuthClient'
import type { IObjectStore, StoredObject } from '../ports/IObjectStore'
import type { IWorkspaceApi, WorkspaceResourceState } from '../ports/IWorkspaceApi'
import { formatBytes } from '../formatBytes'
import { inputFileProblem } from '../inputFormats'
import { parseRepoZipUrl, type ProtocolRepo } from '../protocolRepo'
import { RUN_SETTINGS } from '../runSettings'
import { UserFacingError } from '../userMessages'
import { workspaceLayout } from '../workspaceLayout'
import { inStep, pollUntil, RunProgress, type OnRunState } from './runProgress'

export type { OnRunState } from './runProgress'

/** The protocols.json fields a run needs. */
export interface RunProtocolDefinition {
  /** Stable id: tags the workspace, names the upload's prefix and the results folder. */
  id: string
  name: string
  /** GitHub codeload archive of the protocol's repository. */
  repoZipUrl?: string
  /** Repository-relative folder of the notebooks. */
  notebooksDir?: string
  /** Repository-relative folder the notebooks read their input from (four-choice: example_data). */
  inputDir?: string
  /** Repository-relative folders whose contents are the run's results (four-choice: outputs). */
  outputs?: string[]
  /** Overrides REPOSITORY_SETUP's requirements file, PYTHONPATH folders and install candidates. */
  requirements?: string
  pythonPath?: string[]
  install?: string[]
  inputFormats?: string[]
}

export interface RunProtocolInput {
  protocol: RunProtocolDefinition
  /** The researcher's data; without it the notebooks run on the repository's example data. */
  file?: File | null
  /** Existing workspace to use; a new one, tagged with the protocol, is created when undefined. */
  workspaceId?: number
  /** Name for the workspace created when `workspaceId` is undefined. */
  workspaceName: string
}

/**
 * How a protocol repository sets up its environment, as agreed with the protocol authors (30 Sep):
 * a requirements file at the root, `scripts/` on PYTHONPATH, and `scripts/` installed by its
 * install.py, else as a package. OSB applies whichever of these the repository has; a protocol can
 * override each in protocols.json.
 */
const REPOSITORY_SETUP = {
  requirements: 'requirements.txt',
  pythonPath: ['scripts'],
  /** Candidates; OSB uses the first the repository has. */
  install: ['scripts/install.py', 'scripts/setup.py', 'scripts/pyproject.toml'],
}

const STEPS = [
  { id: 'upload', label: 'Upload your file' },
  { id: 'workspace', label: 'Get the workspace ready' },
  { id: 'repo', label: 'Import the analysis code' },
  { id: 'data', label: 'Import your data' },
  { id: 'imports', label: 'Wait for the imports to finish' },
  { id: 'run', label: 'Run the notebooks' },
]

/**
 * Runs a protocol on the researcher's data, per the MAABCD–OSB design (Scenario 1). Before anything
 * moves, the protocol and the file are checked; then, one step per entry in STEPS:
 *
 *   1. Upload: browser → public bucket (IObjectStore); its URL is what OSB imports. It goes first
 *      (the design runs it in parallel with the workspace side): nothing is created in OSB until
 *      the file is safely in the bucket, so a failed upload leaves no empty workspace.
 *   2. Workspace: the selected one, or a new one tagged `maabcd:<protocol id>`.
 *   3. Import the repository and
 *   4. import the data, both through OSB (`POST /workspaceresource`) into this run's own folder
 *      (workspaceLayout): the code fresh for every run, the upload in its data/ (a zip is unpacked
 *      there).
 *   5. Wait for the imports: done when `GET /workspace/{id}` lists no pending resource and no
 *      "Importing resources" placeholder. (Not "every resource is `a`": OSB's scan only indexes
 *      .nwb/.npjson/.ipynb, and drops other resources once copied.) They worked if the scan then
 *      lists notebooks in this run's notebooks folder; the data file isn't listed, so it can't be
 *      checked this way. Those notebooks, in byte order of their names, are what step 6 runs.
 *   6. Run the notebooks in OSB's Argo task (`POST /workspace/{id}/run`): IDP says which, in what
 *      order, where the input goes, how to set up the environment (REPOSITORY_SETUP) and which
 *      folders are the results; OSB only carries it out. The results go to the run's folder, and
 *      the run task removes the code once it has copied it (discard_repo).
 *
 * No lab server is started: the imports and the run are OSB's own Argo workflows, and their
 * affinity to the workspace is met by their own pods (verified 5 Oct on a never-opened workspace).
 */
export function createRunProtocolUseCase(
  auth: Pick<IAuthClient, 'getToken' | 'tokenParsed'>,
  workspaceApi: IWorkspaceApi,
  objectStore: IObjectStore,
) {
  const token = (minValidity = 30) => auth.getToken(minValidity)

  return async function runProtocol(input: RunProtocolInput, report: OnRunState, abortRef?: { current: boolean }): Promise<void> {
    const { protocol, file } = input
    const progress = new RunProgress(report, STEPS, input.workspaceId)
    const stopped = () => !!abortRef?.current

    try {
      // Before anything moves: the protocol and the file.
      const { repo, userId } = checkBeforeStarting(input)
      // This run's folder in the workspace, and where the repository lands in it (the zip
      // unpacks to <repo>-<ref>/).
      const layout = workspaceLayout(protocol.id, new Date())
      const repoDir = `${layout.run}/${repo.folder}`
      if (!file) {
        progress.skip('upload')
        progress.skip('data')
      }
      progress.emit('Starting…')

      // 1. Upload the file straight to the bucket. Nothing else starts until it has landed.
      const stored = file ? await inStep('upload', () => uploadFile(file, userId)) : null
      if (stopped()) return

      // 2. Get the workspace: the selected one, or a new one.
      const workspaceId = await inStep('workspace', prepareWorkspace)
      if (stopped()) return

      // 3. Import the analysis code (the protocol's repository).
      await inStep('repo', () => importRepo(workspaceId, repo, layout.run))

      // 4. Import the uploaded data.
      if (stored && file) await inStep('data', () => importData(workspaceId, file, stored, layout.data))

      // 5. Wait for the imports, and find the notebooks to run.
      if (stopped()) return
      const notebooks = await inStep('imports', () => waitForImports(workspaceId, repoDir))
      if (!notebooks) return

      // 6. Run the notebooks.
      await inStep('run', () => runNotebooks(workspaceId, repoDir, notebooks, layout, !!stored))
    } catch (err) {
      progress.fail(err)
    }

    // ── The steps ────────────────────────────────────────────────────────────────────────

    /** Before anything moves: a file the protocol can't read would only fail minutes later. */
    function checkBeforeStarting({ protocol, file }: RunProtocolInput): { repo: ProtocolRepo; userId: string } {
      const repo = parseRepoZipUrl(protocol.repoZipUrl)
      if (!repo || !protocol.notebooksDir) throw new UserFacingError(`The analysis for "${protocol.name}" isn't available yet.`)
      const fileProblem = file && inputFileProblem(file, protocol.name, protocol.inputFormats)
      if (fileProblem) throw new UserFacingError(fileProblem)
      // The upload reaches the notebooks only through this folder (OSB's run requires it).
      if (file && !protocol.inputDir) throw new UserFacingError(`"${protocol.name}" can't take uploaded files yet.`)
      const userId = auth.tokenParsed?.sub
      if (typeof userId !== 'string') throw new UserFacingError('Not signed in; please sign in again')
      return { repo, userId }
    }

    /** Step 1. */
    async function uploadFile(file: File, userId: string): Promise<StoredObject> {
      const message = `Uploading ${file.name}…`
      progress.start('upload', 'uploading', message, `0 B of ${formatBytes(file.size)}`)
      let lastReport = 0
      const stored = await objectStore.put({ file, protocolId: protocol.id, userSub: userId }, (sent, total) => {
        if (Date.now() - lastReport < RUN_SETTINGS.uploadProgressMs && sent < total) return
        lastReport = Date.now()
        const pct = total ? Math.round((sent / total) * 100) : 100
        progress.update('upload', `${formatBytes(sent)} of ${formatBytes(total)} (${pct}%)`, message)
      })
      progress.done('upload', undefined, 'Upload finished')
      return stored
    }

    /** Step 2. */
    async function prepareWorkspace(): Promise<number> {
      progress.start('workspace', 'workspace', 'Getting the workspace ready…')
      if (input.workspaceId !== undefined) {
        progress.done('workspace', undefined, 'Workspace ready')
        return input.workspaceId
      }
      const id = await workspaceApi.createWorkspace(await token(), input.workspaceName, [`maabcd:${protocol.id}`])
      progress.workspaceId = id
      progress.done('workspace', undefined, 'Workspace ready')
      return id
    }

    /** Step 3. */
    async function importRepo(workspaceId: number, repo: ProtocolRepo, folder: string) {
      progress.start('repo', 'importing', 'Importing the analysis code…')
      await workspaceApi.importResource(await token(), {
        workspaceId, name: repo.folder, url: protocol.repoZipUrl!, folder, resourceType: 'g',
      })
      progress.done('repo')
    }

    /** Step 4. */
    async function importData(workspaceId: number, file: File, stored: StoredObject, folder: string) {
      progress.start('data', 'importing', 'Importing your data…')
      await workspaceApi.importResource(await token(), {
        workspaceId, name: file.name, url: stored.url, folder, resourceType: 'e',
      })
      progress.done('data')
    }

    /**
     * Step 5. Returns the notebooks to run, relative to the repository, in byte order of their
     * names (as the contract says: zero-padded prefixes); null if the dialog was closed meanwhile.
     */
    async function waitForImports(workspaceId: number, repoDir: string): Promise<string[] | null> {
      progress.start('imports', 'importing', 'Waiting for the imports to finish…')
      let resources: WorkspaceResourceState[] = []
      const ended = await pollUntil(async () => {
        resources = await workspaceApi.getWorkspaceResources(await token(), workspaceId)
        const failed = resources.find((r) => r.status === 'e')
        if (failed) throw new Error(`OSB could not import ${failed.name}`)
        return !resources.some((r) => r.id === -1 || r.status === 'p')
      }, { everyMs: RUN_SETTINGS.importPollMs, timeoutMs: RUN_SETTINGS.importTimeoutMs, stopped })
      if (ended === 'timeout') throw new UserFacingError('Copying the files into the workspace is taking too long. Please try again later.',
          `The imports did not finish within ${RUN_SETTINGS.importTimeoutMs / 60_000} minutes`)
      if (ended !== 'done') return null
      // The visible notebooks directly in the notebooks folder, relative to the repository.
      const folderInRepo = `${protocol.notebooksDir}/`
      const notebooks = resources
        .map((r) => (r.path?.startsWith(`${repoDir}/`) ? r.path.slice(repoDir.length + 1) : ''))
        .filter((path) => {
          const name = path.slice(folderInRepo.length)
          return path.startsWith(folderInRepo) && name.endsWith('.ipynb') && !name.includes('/') && !name.startsWith('.')
        })
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      if (!notebooks.length) throw new UserFacingError('The analysis code has no notebooks to run. Please let the protocol\'s maintainers know.',
        `No notebooks in ${repoDir}/${folderInRepo} after the import`)
      progress.done('imports')
      return notebooks
    }

    /** Step 6. */
    async function runNotebooks(workspaceId: number, repoDir: string, notebooks: string[],
      layout: ReturnType<typeof workspaceLayout>, hasData: boolean) {
      progress.start('run', 'running', 'Starting the notebooks…', 'Submitting')
      const run = await workspaceApi.startRun(await token(), workspaceId, {
        // Removed once copied: every run gets the repository as it is now.
        repo: { dir: repoDir, discard: true },
        setup: {
          requirements: protocol.requirements ?? REPOSITORY_SETUP.requirements,
          pythonPath: protocol.pythonPath ?? REPOSITORY_SETUP.pythonPath,
          install: protocol.install ?? REPOSITORY_SETUP.install,
        },
        notebooks,
        // The upload goes where the notebooks read; what they write is collected into the run's outputs/.
        inputs: hasData && protocol.inputDir ? [{ fromVolume: layout.data, toRepo: protocol.inputDir }] : [],
        outputs: (protocol.outputs ?? []).map((folder) => ({ fromRepo: folder, toVolume: layout.outputs })),
        results: { notebooks: layout.notebooks, log: layout.log },
      })
      progress.outputsDir = layout.run
      const ended = await pollUntil(async () => {
        const status = await workspaceApi.getRun(await token(), workspaceId, run.workflow)
        if (status.phase === 'Failed') throw new Error(status.message || 'The notebooks failed')
        if (status.phase === 'Pending') progress.update('run', 'Waiting for the run to be scheduled', 'Waiting to start the notebooks…')
        if (status.phase === 'Running') progress.update('run', 'Running the notebooks', 'Running the notebooks…')
        return status.phase === 'Succeeded'
      }, { everyMs: RUN_SETTINGS.runPollMs, timeoutMs: RUN_SETTINGS.runTimeoutMs, stopped })
      if (ended === 'timeout') progress.finish('Still running in the workspace; open it to follow the results', false)
      if (ended !== 'done') return
      progress.done('run', `Results in ${layout.run}/`)
      progress.finish('Analysis finished')
    }
  }
}
