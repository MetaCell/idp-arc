/**
 * Every tunable number of a protocol run, in one place.
 *
 * Used by the run (core/use-cases/runProtocol.ts). Change a value here and nowhere else.
 */
export const RUN_SETTINGS = {
  // ─── Uploading and importing ─────────────────────────────────────────────────

  /** At most how often upload progress is reported (the browser reports it many times a second). */
  uploadProgressMs: 250,

  /** How often `GET /workspace/{id}` is polled while OSB's imports run. */
  importPollMs: 3_000,

  /** How long the imports may take (copy + scan for each resource). */
  importTimeoutMs: 10 * 60_000,

  // ─── The run ─────────────────────────────────────────────────────────────────

  /** How often the run's state is polled. */
  runPollMs: 5_000,

  /** Give up watching after this long. Above the run task's own 1 h deadline (OSB workflow.py). */
  runTimeoutMs: 70 * 60_000,
}
