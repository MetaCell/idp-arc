import type { IAuthClient } from '../ports/IAuthClient'
import type { IObjectStore, StoredObject } from '../ports/IObjectStore'
import type { IWorkspaceApi, WorkspaceResourceState } from '../ports/IWorkspaceApi'
import { formatBytes } from '../formatBytes'
import { inputFileProblem } from '../inputFormats'
import { parseRepoZipUrl, repoPage } from '../protocolRepo'
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
  /** GitHub codeload zip of the protocol's repository. */
  repoZipUrl?: string
  /** Repository-relative folder of the notebooks. */
  notebooksDir?: string
  /** Overrides REPOSITORY_SETUP's requirements file, PYTHONPATH folders and install candidates. */
  requirements?: string
  pythonPath?: string[]
  install?: string[]
  inputFormats?: string[]
  /** The image the notebooks run in (their environment): an OSB application's name (e.g. `netpyne`)
   *  or an image reference from a registry OSB allows. Without it, OSB's default (JupyterLab). */
  image?: string
  /** The protocol's MAABCD dandiset on EMBER-DANDI, which each upload is also copied into
   *  (through OSB). Empty or absent: no MAABCD copy. */
  maabcdDandisetId?: string
}

export interface RunProtocolInput {
  protocol: RunProtocolDefinition
  /** The researcher's data; without it the notebooks run on the repository's example data. */
  file?: File | null
  /** Existing workspace to use; a new one, tagged with the protocol, is created when undefined. */
  workspaceId?: number
  /** Name for the workspace created when `workspaceId` is undefined. */
  workspaceName: string
  /** The researcher's EMBER-DANDI dandiset to upload into; undefined creates one. The bucket
   *  ignores it. */
  dandisetId?: string
  /** Also upload into the protocol's MAABCD dandiset, when it has one (the default). */
  shareWithMaabcd?: boolean
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
  { id: 'doi', label: 'Publish your data with a DOI' },
]

/**
 * Runs a protocol on the researcher's data. Before anything moves, the protocol and the file are
 * checked; then, one step per entry in STEPS:
 *
 *   1. Upload through IObjectStore (EMBER-DANDI or the public bucket); OSB imports from the URL
 *      it returns. It goes first, so a failed upload leaves no empty workspace behind.
 *   2. Workspace: the selected one, or a new one tagged `maabcd:<protocol id>`.
 *   3. Import the repository and
 *   4. import the data, both through OSB (`POST /workspaceresource`) into this run's own folder
 *      (workspaceLayout): the code fresh for every run, the upload in its data/ (a zip is unpacked
 *      there).
 *   5. Wait for the imports: done when `GET /workspace/{id}` lists no pending resource in this
 *      run's folder and no "Importing resources" placeholder. (Not "every resource is `a`": OSB's scan only indexes
 *      .nwb/.npjson/.ipynb, and drops other resources once copied.) They worked if the scan then
 *      lists notebooks in this run's notebooks folder; the data file isn't listed, so it can't be
 *      checked this way. Those notebooks, in byte order of their names, are what step 6 runs.
 *   6. Run the notebooks in OSB's Argo task (`POST /workspace/{id}/run`): IDP says which, in what
 *      order, where the input goes, how to set up the environment (REPOSITORY_SETUP) and which
 *      folders are the results; OSB only carries it out. The results go to the run's folder, and
 *      the run task removes the code once it has copied it (discard_repo). It is followed, like the
 *      imports, through `GET /workspace/{id}`'s placeholder: that shows when it ends. Whether it
 *      succeeded is in which folder its executed notebooks are then listed.
 *   7. Publish the researcher's dandiset as a new version (EMBER-DANDI only): its DOI cites this
 *      data. Skipped by the bucket, and without a file.
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
        progress.skip('doi')
      }
      progress.emit('Starting…')

      // 1. Upload the file straight to the bucket. Nothing else starts until it has landed.
      const stored = file ? await inStep('upload', () => uploadFile(file, userId)) : null
      if (stopped()) return

      // 2. Get the workspace: the selected one, or a new one, recorded in the dandiset's metadata so
      // the next upload for this protocol finds both.
      const workspaceId = await inStep('workspace', async () => {
        const id = await prepareWorkspace()
        await stored?.recordWorkspace?.(id)
        return id
      })
      if (stopped()) return

      // 3. Import the analysis code (the protocol's repository).
      await inStep('repo', () => importRepo(workspaceId, repo, layout.run))

      // 4. Import the uploaded data.
      if (stored && file) await inStep('data', () => importData(workspaceId, file, stored, layout.inputs))

      // 5. Wait for the imports, and find the notebooks to run.
      if (stopped()) return
      const notebooks = await inStep('imports', () => waitForImports(workspaceId, layout.run, repoDir))
      if (!notebooks) return

      // 6. Run the notebooks.
      const ran = await inStep('run', () => runNotebooks(workspaceId, repoDir, notebooks, layout, !!stored))
      if (!ran) return

      // 7. Publish the dandiset, for a DOI.
      if (stored?.publish) {
        const publish = stored.publish
        if (!(await inStep('doi', () => publishForDoi(publish)))) return
      } else progress.skip('doi')
      progress.finish('The analysis has finished')
    } catch (err) {
      progress.fail(err)
    }

    // ── The steps ────────────────────────────────────────────────────────────────────────

    /** Before anything moves: a file the protocol can't read would only fail minutes later. */
    function checkBeforeStarting({ protocol, file }: RunProtocolInput): { repo: { folder: string }; userId: string } {
      const folder = parseRepoZipUrl(protocol.repoZipUrl)?.folder
      if (!protocol.repoZipUrl || !folder || !protocol.notebooksDir) {
        throw new UserFacingError(`The analysis for "${protocol.name}" isn't available yet.`)
      }
      const repo = { folder }
      const fileProblem = file && inputFileProblem(file, protocol.name, protocol.inputFormats)
      if (fileProblem) throw new UserFacingError(fileProblem)
      const userId = auth.tokenParsed?.sub
      if (typeof userId !== 'string') throw new UserFacingError('Not signed in; please sign in again')
      return { repo, userId }
    }

    /** Step 1. */
    async function uploadFile(file: File, userId: string): Promise<StoredObject> {
      const message = `Uploading ${file.name}…`
      progress.start('upload', 'uploading', message, `0 B of ${formatBytes(file.size)}`)
      let lastReport = 0
      const stored = await objectStore.put({
        file, protocolId: protocol.id, userSub: userId,
        dandisets: {
          user: input.dandisetId,
          newName: `${protocol.name} (IDP)`,
          protocol: { id: protocol.id, name: protocol.name, url: repoPage(protocol.repoZipUrl) },
          maabcd: input.shareWithMaabcd === false ? undefined : protocol.maabcdDandisetId,
        },
      }, (sent, total) => {
        if (Date.now() - lastReport < RUN_SETTINGS.uploadProgressMs && sent < total) return
        lastReport = Date.now()
        const pct = total ? Math.round((sent / total) * 100) : 100
        progress.update('upload', `${formatBytes(sent)} of ${formatBytes(total)} (${pct}%)`, message)
      })
      // Kept by the dialog, so a retry uploads into the same dandiset rather than creating another.
      if (stored.dandisetId) progress.dandisetId = stored.dandisetId
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
    async function importRepo(workspaceId: number, repo: { folder: string }, folder: string) {
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
    async function waitForImports(workspaceId: number, runDir: string, repoDir: string): Promise<string[] | null> {
      progress.start('imports', 'importing', 'Waiting for the imports to finish…')
      let resources: WorkspaceResourceState[] = []
      // Only this run's imports count: a reused workspace can hold older resources that failed or
      // never finished, and those must not fail or stall every later run.
      const ours = (r: WorkspaceResourceState) => !!r.path?.startsWith(`${runDir}/`)
      const ended = await pollUntil(async () => {
        resources = await workspaceApi.getWorkspaceResources(await token(), workspaceId)
        const failed = resources.find((r) => ours(r) && r.status === 'e')
        if (failed) throw new Error(`OSB could not import ${failed.name}`)
        return !resources.some((r) => r.id === -1 || (ours(r) && r.status === 'p'))
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
    /** Step 6. True once the notebooks have all run; false if it stopped watching first. */
    async function runNotebooks(workspaceId: number, repoDir: string, notebooks: string[],
      layout: ReturnType<typeof workspaceLayout>, hasData: boolean): Promise<boolean> {
      progress.start('run', 'running', 'Starting the notebooks…', 'Submitting')
      await workspaceApi.startRun(await token(), workspaceId, {
        // Removed once copied: every run gets the repository as it is now.
        repo: { dir: repoDir, discard: true },
        setup: {
          requirements: protocol.requirements ?? REPOSITORY_SETUP.requirements,
          pythonPath: protocol.pythonPath ?? REPOSITORY_SETUP.pythonPath,
          install: protocol.install ?? REPOSITORY_SETUP.install,
        },
        notebooks,
        // The notebooks' INPUT_DIR and OUTPUT_DIR parameters: they read the upload and write their
        // results in the run's folder. Without an upload they use their own example data.
        inputDir: hasData ? layout.inputs : undefined,
        outputDir: layout.outputs,
        results: { notebooks: layout.notebooks, log: layout.log },
        ...(protocol.image ? { image: protocol.image } : {}),
      })
      progress.outputsDir = layout.run
      // Followed through `GET /workspace/{id}`, as the imports are: while a workflow for the
      // workspace runs, OSB lists a placeholder resource (id -1). Seen, then gone: the run is over.
      let seen = false
      const submitted = Date.now()
      const ended = await pollUntil(async () => {
        const running = (await workspaceApi.getWorkspaceResources(await token(), workspaceId)).some((r) => r.id === -1)
        if (running && !seen) progress.update('run', 'Running the notebooks', 'Running the notebooks…')
        seen ||= running
        // Never seen: a run that ends within seconds can finish between two polls.
        return seen ? !running : Date.now() - submitted > RUN_SETTINGS.runStartTimeoutMs
      }, { everyMs: RUN_SETTINGS.runPollMs, timeoutMs: RUN_SETTINGS.runTimeoutMs, stopped })
      if (ended === 'timeout') progress.stopWatching('run', 'Still running in the workspace; open it to follow the results')
      if (ended !== 'done') return false

      // Whether it succeeded. The run task leaves the executed notebooks in notebooks/ if every one
      // passed, else in notebooks.failed/ (the failed one last), and its workflow ends with a scan
      // either way, so one of the two is listed once the placeholder is gone (after a short lag:
      // the scan reports through an event queue).
      const executed = notebooks.map((nb) => `${layout.notebooks}/${nb.split('/').pop()}`)
      const failedDir = `${layout.failedNotebooks}/`
      let failedAt: string | undefined
      const listed = await pollUntil(async () => {
        const paths = (await workspaceApi.getWorkspaceResources(await token(), workspaceId)).flatMap((r) => r.path ?? [])
        failedAt = paths.filter((path) => path.startsWith(failedDir)).sort().pop()
        return !!failedAt || executed.every((path) => paths.includes(path))
      }, { everyMs: RUN_SETTINGS.runPollMs, timeoutMs: RUN_SETTINGS.runResultTimeoutMs, stopped })
      if (listed === 'stopped') return false
      // The user reads the run step's plain sentence; which notebook failed goes to the console.
      if (failedAt) throw new Error(`${failedAt} failed; see ${layout.log}`)
      // Neither: it stopped before any notebook ran (e.g. installing the requirements).
      if (listed === 'timeout') throw new Error(`The run ended with no executed notebooks in ${layout.notebooks}/ or ${failedDir}; see ${layout.log}`)
      progress.done('run', `Results in ${layout.run}/`)
      return true
    }

    /** Step 7. The published version's DOI; null if the dialog was closed meanwhile. */
    async function publishForDoi(publish: NonNullable<StoredObject['publish']>) {
      progress.start('doi', 'publishing', 'Publishing your data…', 'Waiting for EMBER-DANDI to check it')
      const published = await publish(stopped)
      if (!published) return null
      progress.doi = published
      progress.done('doi', published.doi)
      return published
    }
  }
}
