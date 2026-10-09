/**
 * Reopens the Login dialog after a login took the user away from the page: EMBER-DANDI's sign-in
 * is a full-page redirect (emberOAuthClient.ts's connect(); a popup can't work, see
 * .vscode/knowledge-base/ember-oauth-popup-and-coop.md), and the OSB popup's login reloads this
 * page when it completes (App.tsx). Either way the dialog is unmounted, so it is marked here and
 * reopened on arrival, showing what is still left to sign in to.
 *
 * Lives in its own module rather than in LoginDialog because exporting non-components from a
 * component file breaks React Fast Refresh.
 */

const KEY = 'idp_login_dialog_return'

export function markLoginDialogReturn(): void {
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    /* blocked storage — the login still works, the dialog just won't reopen by itself */
  }
}

/** True once after a login left the page from the Login dialog; clears the mark. */
export function takeLoginDialogReturn(): boolean {
  try {
    const marked = sessionStorage.getItem(KEY) !== null
    sessionStorage.removeItem(KEY)
    return marked
  } catch {
    return false
  }
}
