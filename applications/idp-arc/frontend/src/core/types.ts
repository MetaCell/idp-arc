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
  | 'creating'
  | 'spawning'
  | 'waiting'
  | 'uploading'
  | 'done'
  | 'error'

export interface UploadState {
  phase: UploadPhase
  message: string
  error?: string
  workspaceId?: number
}

/** Human-readable labels for each phase, used both by use-cases and the UI. */
export const PHASE_LABELS: Record<UploadPhase, string> = {
  idle: '',
  creating: '1 / 4 — Creating workspace…',
  spawning: '2 / 4 — Starting JupyterLab server…',
  waiting: '3 / 4 — Waiting for JupyterLab to be ready…',
  uploading: '4 / 4 — Uploading file…',
  done: 'Done!',
  error: 'Error',
}
