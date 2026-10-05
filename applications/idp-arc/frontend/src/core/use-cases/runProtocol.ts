import type { IAuthClient } from '../ports/IAuthClient'
import type { IObjectStore, StoredObject } from '../ports/IObjectStore'
import type { IWorkspaceApi } from '../ports/IWorkspaceApi'
import { formatBytes } from '../formatBytes'
import { inputFileProblem } from '../inputFormats'
import { parseRepoZipUrl, type ProtocolRepo } from '../protocolRepo'
import { RUN_SETTINGS } from '../runSettings'
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

const STEPS = [
  { id: 'upload', label: 'Upload your file' },
  { id: 'workspace', label: 'Get the workspace ready' },
  { id: 'repo', label: 'Import the analysis code' },
  { id: 'data', label: 'Import your data' },
  { id: 'imports', label: 'Wait for the imports to finish' },
  { id: 'run', label: 'Run the notebooks' },
]

/**
 * Runs a protocol on the researcher's data, per the MAABCD–OSB design (Scenario 1):
 *
 *   upload → workspace → repo import → data import → imports done → run → results
 *
 * The upload goes first (Gopal, 2 Oct; the design runs it in parallel with the workspace side):
 * nothing is created in OSB until the file is safely in the bucket, so a failed upload leaves no
 * empty workspace behind.
 *
 * - The upload goes browser → public bucket (IObjectStore); its URL is what OSB imports.
 * - The workspace is the selected one, or a new one tagged `maabcd:<protocol id>`.
 * - Both imports go through OSB (`POST /workspaceresource`) into this run's own folder,
 *   `idp/<upload id>/{repo,data}/`, so files of the same name never collide and a zip is
 *   unpacked in place. The repository goes in as soon as the workspace exists.
 * - No lab server is started: the imports and the run are OSB's own Argo workflows, and their
 *   affinity to the workspace is met by their own pods (verified 5 Oct on a never-opened workspace).
 * - Imports are done when `GET /workspace/{id}` lists no pending resource and no "Importing
 *   resources" placeholder. (Not "every resource is `a`": OSB's scan only indexes .nwb/.npjson/
 *   .ipynb, and drops other resources once copied.)
 * - The notebooks run in OSB's Argo task (`POST /workspace/{id}/run`); results go to
 *   `results/run-<protocol id>-<UTC timestamp>/` in the workspace (OSB names the folder).
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
      const { repo, userId } = checkBeforeStarting(input)
      const folder = `idp/${crypto.randomUUID()}`
      if (!file) {
        progress.skip('upload', 'No file selected; the notebooks use the repository\'s example data')
        progress.skip('data', 'No file to import')
      }
      progress.emit('Starting…')

      // 1. The upload, straight to the bucket. Nothing else starts until it has landed.
      const stored = file ? await inStep('upload', () => uploadFile(file, userId)) : null
      if (stopped()) return

      // 2. Workspace → repository import → data import.
      const workspaceId = await inStep('workspace', prepareWorkspace)
      if (stopped()) return
      await inStep('repo', () => importRepo(workspaceId, repo, folder))
      if (stored && file) await inStep('data', () => importData(workspaceId, file, stored, folder))
      if (stopped() || !(await inStep('imports', () => waitForImports(workspaceId)))) return

      await inStep('run', () => runNotebooks(workspaceId, repo, folder, !!stored))
    } catch (err) {
      progress.fail(err)
    }

    // ── The steps ────────────────────────────────────────────────────────────────────────

    /** Fails before anything moves: a file the protocol can't read would only fail minutes later. */
    function checkBeforeStarting({ protocol, file }: RunProtocolInput): { repo: ProtocolRepo; userId: string } {
      const repo = parseRepoZipUrl(protocol.repoZipUrl)
      if (!repo || !protocol.notebooksDir) throw new Error(`"${protocol.name}" has no analysis repository configured yet`)
      const fileProblem = file && inputFileProblem(file, protocol.name, protocol.inputFormats)
      if (fileProblem) throw new Error(fileProblem)
      // The upload reaches the notebooks only through this folder (OSB's run requires it).
      if (file && !protocol.inputDir) throw new Error(`"${protocol.name}" has no input folder configured yet`)
      const userId = auth.tokenParsed?.sub
      if (typeof userId !== 'string') throw new Error('Not signed in; please sign in again')
      return { repo, userId }
    }

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
      progress.done('upload', stored.key, 'Upload finished')
      return stored
    }

    async function prepareWorkspace(): Promise<number> {
      progress.start('workspace', 'workspace', 'Getting the workspace ready…')
      if (input.workspaceId !== undefined) {
        progress.done('workspace', `Using workspace #${input.workspaceId}`, 'Workspace ready')
        return input.workspaceId
      }
      const id = await workspaceApi.createWorkspace(await token(), input.workspaceName, [`maabcd:${protocol.id}`])
      progress.workspaceId = id
      progress.done('workspace', `Created ${input.workspaceName} (#${id})`, 'Workspace ready')
      return id
    }

    async function importRepo(workspaceId: number, repo: ProtocolRepo, folder: string) {
      progress.start('repo', 'importing', 'Importing the analysis code…')
      await workspaceApi.importResource(await token(), {
        workspaceId, name: repo.folder, url: protocol.repoZipUrl!, folder: `${folder}/repo`, resourceType: 'g',
      })
      progress.done('repo', `${repo.owner}/${repo.repo}@${repo.ref} → ${folder}/repo/`)
    }

    async function importData(workspaceId: number, file: File, stored: StoredObject, folder: string) {
      progress.start('data', 'importing', 'Importing your data…')
      await workspaceApi.importResource(await token(), {
        workspaceId, name: file.name, url: stored.url, folder: `${folder}/data`, resourceType: 'e',
      })
      progress.done('data', `→ ${folder}/data/`)
    }

    /** Returns false if the dialog was closed meanwhile. */
    async function waitForImports(workspaceId: number): Promise<boolean> {
      progress.start('imports', 'importing', 'Waiting for the imports to finish…', 'OSB is copying the files into the workspace')
      const ended = await pollUntil(async () => {
        const resources = await workspaceApi.getWorkspaceResources(await token(), workspaceId)
        const failed = resources.find((r) => r.status === 'e')
        if (failed) throw new Error(`OSB could not import ${failed.name}`)
        return !resources.some((r) => r.id === -1 || r.status === 'p')
      }, { everyMs: RUN_SETTINGS.importPollMs, timeoutMs: RUN_SETTINGS.importTimeoutMs, stopped })
      if (ended === 'timeout') throw new Error(`The imports did not finish within ${RUN_SETTINGS.importTimeoutMs / 60_000} minutes`)
      if (ended === 'done') progress.done('imports')
      return ended === 'done'
    }

    async function runNotebooks(workspaceId: number, repo: ProtocolRepo, folder: string, hasData: boolean) {
      progress.start('run', 'running', 'Starting the notebooks…', 'Submitting')
      const run = await workspaceApi.startRun(await token(), workspaceId, {
        notebooksDir: `${folder}/repo/${repo.folder}/${protocol.notebooksDir}`,
        inputPath: hasData ? `${folder}/data` : undefined,
        inputDir: hasData ? protocol.inputDir : undefined,
        outputDir: 'results',
        name: protocol.id,
      })
      progress.outputsDir = run.outputDir
      const ended = await pollUntil(async () => {
        const status = await workspaceApi.getRun(await token(), workspaceId, run.workflow)
        if (status.phase === 'Failed') throw new Error(status.message || 'The notebooks failed')
        if (status.phase === 'Pending') progress.update('run', 'Waiting for the run to be scheduled', 'Waiting to start the notebooks…')
        if (status.phase === 'Running') progress.update('run', 'Running the notebooks', 'Running the notebooks…')
        return status.phase === 'Succeeded'
      }, { everyMs: RUN_SETTINGS.runPollMs, timeoutMs: RUN_SETTINGS.runTimeoutMs, stopped })
      if (ended === 'timeout') progress.finish('Still running in the workspace; open it to follow the results', false)
      if (ended !== 'done') return
      progress.done('run', `Results in ${run.outputDir}/`)
      progress.finish('Analysis finished')
    }
  }
}
