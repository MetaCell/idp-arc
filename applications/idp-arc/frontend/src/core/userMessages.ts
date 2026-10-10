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
  doi: 'Your data could not be published with a DOI. Please try again.',
}

/** Says the EMBER-DANDI session is missing or over. Deliberately not SIGN_IN_AGAIN's wording,
 *  which sends the user to the OSB (Keycloak) login instead. */
export const EMBER_SIGN_IN = 'Please sign in with EMBER-DANDI and try again.'

/** Says the session has ended; the dialog sends the user to sign in when the text contains it. */
export const SIGN_IN_AGAIN = 'sign in again'

/** The user's text for an error thrown during `step`. */
export function userMessage(err: unknown, step?: string): string {
  if (err instanceof UserFacingError) return err.message
  // The auth client's "Please sign in again." can come from any step that asks for a token: kept,
  // so the dialog can send the user to sign in instead of suggesting a retry that fails the same way.
  if (err instanceof Error && err.message.toLowerCase().includes(SIGN_IN_AGAIN)) {
    return `Your session has expired. Please ${SIGN_IN_AGAIN}.`
  }
  return (step && STEP_FAILED[step]) || 'Something went wrong. Please try again.'
}
