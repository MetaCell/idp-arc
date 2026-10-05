/**
 * What the user reads when a run fails: one plain sentence per step. Technical details (HTTP
 * errors, OSB's messages) go to the browser console; the run's own log is in its results folder.
 */

/** An error whose message is written for the user; `details` is for the console. */
export class UserFacingError extends Error {
  readonly details?: string
  constructor(message: string, details?: string) {
    super(message)
    this.details = details
  }
}

const STEP_FAILED: Record<string, string> = {
  upload: 'Your file could not be uploaded. Check your connection and try again.',
  workspace: 'The workspace could not be prepared. Please try again.',
  repo: 'The analysis code could not be added to the workspace. Please try again.',
  data: 'Your file could not be added to the workspace. Please try again.',
  imports: 'The files could not be copied into the workspace. Please try again.',
  run: 'The analysis did not finish. Open the workspace to see what happened.',
}

/** The user's text for an error thrown during `step`. */
export function userMessage(err: unknown, step?: string): string {
  if (err instanceof UserFacingError) return err.message
  return (step && STEP_FAILED[step]) || 'Something went wrong. Please try again.'
}
