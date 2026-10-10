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

// ─── Upload workflow ──────────────────────────────────────────────────────────

export type UploadPhase =
  | 'idle'
  | 'hashing'
  | 'initializing'
  | 'uploading'
  | 'registering'
  | 'done'
  | 'error'

export interface UploadState {
  phase: UploadPhase
  message: string
  error?: string
  workspaceId?: number
  scriptOutput?: string
}

/** Human-readable labels for each upload phase, used by both the use-case and the UI. */
export const PHASE_LABELS: Record<UploadPhase, string> = {
  idle: '',
  hashing: '1 / 4 — Computing checksum…',
  initializing: '2 / 4 — Preparing upload…',
  uploading: '3 / 4 — Uploading file…',
  // finalize also spawns the workspace and runs the protocol script synchronously — hence "can
  // take a few minutes" (see jupyter_kernel_client.py in OSBv2's workspaces app).
  registering: '4 / 4 — Registering asset, creating workspace & running script (can take a few minutes)…',
  done: 'Done!',
  error: 'Error',
}

// ─── Protocol run (upload, OSB imports, notebooks in an Argo task) ───────────

export type RunPhase =
  | 'uploading'
  | 'workspace'
  | 'importing'
  | 'running'
  /** Publishing the dandiset for its DOI. */
  | 'publishing'
  /** Still running in the workspace past the watch limit: no longer followed here. */
  | 'stillRunning'
  | 'succeeded'
  | 'failed'

export type StepState = 'pending' | 'running' | 'succeeded' | 'skipped' | 'failed'

/** One line of the run's checklist in the UI. */
export interface RunStep {
  id: string
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
  /** The DOI of the version published at the end of the run. */
  doi?: { doi: string; url?: string }
  error?: string
}
