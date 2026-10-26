import type { RunCheckpoint, RunStep } from '../core/types'
import { clearRun, loadRun, saveRun } from './runStorage'
import { createSessionStore } from './sessionStore'

/**
 * The upload dialog's state, kept outside the dialog: closing it (or moving to another page, which
 * remounts it) neither stops a run nor forgets it, and its run is saved, so a page reload doesn't
 * either. Its own module, as exporting non-components from a component file breaks Fast Refresh.
 */

export type DialogStep = 'select' | 'upload' | 'uploading' | 'success' | 'stillRunning' | 'failed'

export interface FormState {
  step: DialogStep
  protocol: string
  file: File | null
  isDragging: boolean
  uploadMessage: string
  /** ID of the workspace spawned in the current dialog session; drives retry behaviour. */
  spawnedWorkspaceId: number | undefined
  /** Where the last run's results are, relative to the workspace root. */
  outputsDir: string
  /** The DOI of the version published with "Publish dandiset". */
  doi?: { doi: string }
  /** That publish is under way, or failed (it can be retried). */
  publishing?: 'running' | 'failed'
  /** Why the publish failed, for the user. */
  publishError?: string
  /** The run's checklist (upload, imports, run), as last reported by the use-case. */
  runSteps: RunStep[]
  /** EMBER-DANDI only: the researcher's dandiset to upload into; empty creates a new one. */
  dandisetId: string
  /** Also upload into the protocol's MAABCD dandiset; on by default. */
  shareWithMaabcd: boolean
  /** What the last attempt got done: a retry carries on from there (the run checks it still applies). */
  checkpoint?: RunCheckpoint
  /** The finished run's result has been on screen: the next opening starts a new upload. */
  resultSeen?: boolean
}

export const INITIAL_FORM: FormState = {
  step: 'select',
  protocol: '',
  file: null,
  isDragging: false,
  uploadMessage: '',
  spawnedWorkspaceId: undefined,
  outputsDir: '',
  runSteps: [],
  dandisetId: '',
  shareWithMaabcd: true,
}

export const session = createSessionStore<FormState>(INITIAL_FORM)

/** What is saved across a reload: the run, not the form around it. */
type SavedRun = Pick<FormState, 'step' | 'protocol' | 'dandisetId' | 'spawnedWorkspaceId' | 'shareWithMaabcd'
  | 'checkpoint' | 'runSteps' | 'outputsDir' | 'uploadMessage'>

const RUN_INTERRUPTED = 'The page was reloaded during the run. Retry to carry on from where it stopped.'

/** The user whose run is saved, once known. */
let savingFor: string | null = null

session.subscribe(() => {
  if (!savingFor) return
  const { step, protocol, dandisetId, spawnedWorkspaceId, shareWithMaabcd, checkpoint, runSteps, outputsDir, uploadMessage, resultSeen } = session.get()
  if (!checkpoint || resultSeen) return clearRun(savingFor)
  const run: SavedRun = { step, protocol, dandisetId, spawnedWorkspaceId, shareWithMaabcd, checkpoint, runSteps, outputsDir, uploadMessage }
  saveRun(savingFor, run)
})

/** Once the user is known: brings back their run saved before a reload, unless one is open already. */
export function restoreSession(user: string): void {
  if (savingFor === user) return
  savingFor = user
  const run = loadRun<SavedRun>(user)
  if (!run || session.get().checkpoint) return
  // A run that was going when the page went is shown stopped, for Retry.
  const interrupted = run.step === 'uploading'
  session.set({
    ...INITIAL_FORM,
    ...run,
    ...(interrupted && {
      step: 'failed',
      uploadMessage: RUN_INTERRUPTED,
      runSteps: run.runSteps.map((s) => (s.state === 'running' ? { ...s, state: 'pending', detail: undefined } : s)),
    }),
  })
}
