import type { RunPhase, RunState, RunStep, StepState } from '../types'
import { UserFacingError, userMessage } from '../userMessages'

export type OnRunState = (state: RunState) => void

/** A failure that belongs to one step, so only that row is marked failed. */
export class StepError extends Error {
  readonly step: string
  readonly original: unknown
  constructor(step: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.step = step
    this.original = cause
  }
}

/**
 * The run's  checklist: one row per step, reported in full after every change.
 * Each method updates a row and reports, so the run itself reads as a list of steps.
 */
export class RunProgress {
  private steps: RunStep[]
  private phase: RunPhase = 'uploading'
  private readonly report: OnRunState
  /** Set once the run has failed or finished: nothing reports over the outcome after that. */
  private ended = false
  workspaceId?: number
  dandisetId?: string
  outputsDir?: string
  doi?: { doi: string; url?: string }

  constructor(report: OnRunState, steps: { id: string; label: string }[], workspaceId?: number) {
    this.report = report
    this.steps = steps.map((s) => ({ ...s, state: 'pending' }))
    this.workspaceId = workspaceId
  }

  /** A step starts; `phase` is what the whole run is doing now. */
  start(id: string, phase: RunPhase, message: string, detail?: string) {
    if (this.ended) return
    this.phase = phase
    this.set(id, 'running', detail)
    this.emit(message)
  }

  /** A running step reports progress (upload bytes, run state). */
  update(id: string, detail: string, message: string) {
    if (this.ended) return
    this.set(id, 'running', detail)
    this.emit(message)
  }

  done(id: string, detail?: string, message?: string) {
    if (this.ended) return
    this.set(id, 'succeeded', detail)
    if (message) this.emit(message)
  }

  skip(id: string, detail?: string) {
    this.set(id, 'skipped', detail)
  }

  /** The run ends well. */
  finish(message: string) {
    if (this.ended) return
    this.ended = true
    this.phase = 'succeeded'
    this.emit(message)
  }

  /** Still running past the watch limit: stops following it; the run carries on in the workspace. */
  stopWatching(id: string, message: string) {
    if (this.ended) return
    this.ended = true
    this.phase = 'stillRunning'
    this.steps = this.steps.map((s) => (s.id === id ? { ...s, state: 'pending', detail: 'Still running in the workspace' } : s))
    this.emit(message)
  }

  /**
   * Marks the step that failed (a StepError's, else the one running) and reports the error in
   * words for the user; the technical error goes to the console.
   */
  fail(err: unknown) {
    if (this.ended) return
    this.ended = true
    const failed = err instanceof StepError ? err.step : this.steps.find((s) => s.state === 'running')?.id
    const cause = err instanceof StepError ? err.original : err
    console.error(cause instanceof UserFacingError && cause.details ? cause.details : cause)
    this.steps = this.steps.map((s) =>
      s.id === failed ? { ...s, state: 'failed' } : s.state === 'running' ? { ...s, state: 'pending', detail: undefined } : s)
    this.phase = 'failed'
    this.emit('The analysis did not complete', userMessage(cause, failed))
  }

  emit(message: string, error?: string) {
    const { phase, steps, workspaceId, dandisetId, outputsDir } = this
    this.report({ phase, message, steps, workspaceId, outputsDir, ...(dandisetId ? { dandisetId } : {}), ...(this.doi ? { doi: this.doi } : {}), ...(error ? { error } : {}) })
  }

  private set(id: string, state: StepState, detail?: string) {
    // A running step keeps its last detail unless given a new one.
    this.steps = this.steps.map((s) =>
      s.id === id ? { ...s, state, detail: detail ?? (state === 'running' ? s.detail : undefined) } : s)
  }
}

/** Runs one step, so a failure is attributed to that step's row (not to another one running in
 * parallel, like the upload). */
export async function inStep<T>(step: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    throw err instanceof StepError ? err : new StepError(step, err)
  }
}

/** Calls `check` until it returns true, every `everyMs`. Resolves to how it ended. */
export async function pollUntil(
  check: () => Promise<boolean>,
  { everyMs, timeoutMs, stopped }: { everyMs: number; timeoutMs: number; stopped: () => boolean },
): Promise<'done' | 'timeout' | 'stopped'> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (stopped()) return 'stopped'
    if (await check()) return 'done'
    if (Date.now() > deadline) return 'timeout'
    await new Promise((resolve) => setTimeout(resolve, everyMs))
  }
}
