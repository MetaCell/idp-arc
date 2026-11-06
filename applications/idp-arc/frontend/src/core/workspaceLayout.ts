/**
 * Where a run's files go in the workspace: the only place these folder names are set. OSB uses the
 * paths it is given.
 *
 *   <protocol id>/run-<protocol id>-<UTC timestamp>/
 *     <repo>-<ref>/    the protocol's code, imported for this run and removed by the run task
 *     inputs/          the upload; the notebooks' INPUT_DIR
 *     outputs/         what the notebooks write; their OUTPUT_DIR
 *     notebooks/       the executed notebooks, only if all passed ┐
 *                      (else notebooks.failed/)                   │ written by the run task
 *     run.log                                                     ┘
 */

/** The upload; passed to the notebooks as INPUT_DIR. */
const INPUTS_DIR = 'inputs'
/** What the notebooks write; passed to them as OUTPUT_DIR. */
const OUTPUTS_DIR = 'outputs'
/** The executed notebooks: the run task leaves them here only if every notebook passed. */
const NOTEBOOKS_DIR = 'notebooks'
/** Assumed from OSB's run task (run.sh): a failed run's executed notebooks are in `<NOTEBOOKS_DIR>.failed`. */
const FAILED_SUFFIX = '.failed'
/** The run task's log. */
const LOG_FILE = 'run.log'

/** A UTC time as a folder name: no `:` (not allowed on Windows or in macOS Finder); sorts in order. */
export function utcStamp(at: Date): string {
  return at.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-')
}

export function workspaceLayout(protocolId: string, startedAt: Date) {
  const run = `${protocolId}/run-${protocolId}-${utcStamp(startedAt)}`
  return {
    run,
    inputs: `${run}/${INPUTS_DIR}`,
    outputs: `${run}/${OUTPUTS_DIR}`,
    notebooks: `${run}/${NOTEBOOKS_DIR}`,
    failedNotebooks: `${run}/${NOTEBOOKS_DIR}${FAILED_SUFFIX}`,
    log: `${run}/${LOG_FILE}`,
  }
}
