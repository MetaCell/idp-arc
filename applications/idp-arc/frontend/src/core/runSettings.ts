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
  importPollMs: 5_000,

  /** How long the imports may take (copy + scan for each resource). */
  importTimeoutMs: 10 * 60_000,

  // ─── The run ─────────────────────────────────────────────────────────────────

  /** How often `GET /workspace/{id}` is polled while the run runs, and while its results are checked. */
  runPollMs: 5_000,

  /** Stop watching if OSB hasn't shown the run as running by then (it may already be over). */
  runStartTimeoutMs: 2 * 60_000,

  /** Give up watching after this long. Above the run task's own 1 h deadline (OSB workflow.py). */
  runTimeoutMs: 70 * 60_000,

  /**
   * How long after the run's workflow has ended its scan may take to show in the listing (it
   * reports through an event queue). Neither notebooks/ nor notebooks.failed/ listed by then, the
   * run stopped before any notebook ran.
   */
  runResultTimeoutMs: 15_000,

  // ─── The DOI ─────────────────────────────────────────────────────────────────

  /** How often EMBER-DANDI is asked whether the draft is valid, and whether the version is out. */
  publishStatusPollMs: 5_000,

  /** How long EMBER may take to validate the draft (it checks every new file). */
  publishDraftValidationTimeoutMs: 15 * 60_000,

  /** How long EMBER may take to publish the version once asked. */
  publishVersionTimeoutMs: 10 * 60_000,
}
