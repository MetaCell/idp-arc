/**
 * Where a run's files go in the workspace: the only place these folder names are set. OSB uses the
 * paths it is given.
 *
 *   <protocol id>/run-<protocol id>-<UTC timestamp>/
 *     <repo>-<ref>/    the protocol's code, imported for this run and removed by the run task
 *     data/            the upload
 *     notebooks/       the executed notebooks      ┐
 *     outputs/         what the code wrote         ├ written by the run task, where these say
 *     run.log                                      ┘
 */
export function workspaceLayout(protocolId: string, startedAt: Date) {
  // No `:` (not allowed in file names on Windows or in macOS Finder); sorts in run order.
  const stamp = startedAt.toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-')
  const run = `${protocolId}/run-${protocolId}-${stamp}`
  return { run, data: `${run}/data`, notebooks: `${run}/notebooks`, outputs: `${run}/outputs`, log: `${run}/run.log` }
}
