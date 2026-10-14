import type { StoredObject, UploadCheckpoint } from './ports/IObjectStore'

/**
 * Core domain types — shared by ports, use-cases, and the UI layer.
 *
 * Rule: nothing in this file may import from src/infra/, src/app/, or React.
 * These types represent the language of the problem domain, not the solution.
 */

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type AuthState = 'loading' | 'authenticated' | 'unauthenticated'

// ─── Workspace ────────────────────────────────────────────────────────────────

export interface Workspace {
  id: string | number
  name: string
  description?: string
  timestamp_created?: string
  thumbnail?: string
}

// ─── Protocol run (upload, OSB imports, notebooks in an Argo task) ───────────

export type RunPhase =
  | 'uploading'
  | 'workspace'
  | 'importing'
  | 'running'
  /** Still running in the workspace past the watch limit: no longer followed here. */
  | 'stillRunning'
  | 'succeeded'
  | 'failed'

/** The run's steps, in order: their ids in the checklist (runProtocol's STEPS). */
export const RUN_STEP = {
  upload: 'upload',
  workspace: 'workspace',
  repo: 'repo',
  data: 'data',
  imports: 'imports',
  run: 'run',
  doi: 'doi',
} as const

export type RunStepId = (typeof RUN_STEP)[keyof typeof RUN_STEP]

export type StepState = 'pending' | 'running' | 'succeeded' | 'skipped' | 'failed'

/** One line of the run's checklist in the UI. */
export interface RunStep {
  id: RunStepId
  label: string
  state: StepState
  detail?: string
}

export interface RunState {
  phase: RunPhase
  message: string
  /** Every step of the run, in order, for the checklist. */
  steps: RunStep[]
  workspaceId?: number
  /** The researcher's EMBER-DANDI dandiset the upload went into; a retry reuses it. */
  dandisetId?: string
  /** This run's results folder, relative to the workspace root. */
  outputsDir?: string
  error?: string
  /** What the run has done so far; given back on a retry, it carries on from there. */
  checkpoint?: RunCheckpoint
}

/**
 * What a run has done so far (runProtocol), kept by the dialog for a retry. It holds only for the
 * same protocol, file, dandiset choice and sharing choice (canResume); anything else starts over.
 */
export interface RunCheckpoint {
  protocolId: string
  /** The file it was for: name, size and last-modified time. */
  fileKey: string | null
  /** The dandiset picked when it started (undefined: a new one). */
  dandisetChoice?: string
  shareWithMaabcd: boolean
  /** The upload, part way: the store's own checkpoint. */
  upload?: UploadCheckpoint
  /** The upload, finished. */
  stored?: StoredObject
  workspaceId?: number
  /** The workspace is recorded with the upload (in the dandiset's metadata). */
  workspaceRecorded?: boolean
  /** When this run's folder was named (workspaceLayout); reused until the notebooks are submitted. */
  runFolderAt?: string
  repoImported?: boolean
  dataImported?: boolean
}
