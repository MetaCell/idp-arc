/**
 * Reopens the Login dialog after a login took the user away from the page: EMBER-DANDI's sign-in
 * redirects the whole page when its popup is blocked (emberOAuthClient.ts's connect()), and the OSB
 * popup's login reloads this page when it completes (App.tsx). Either way the dialog is unmounted,
 * so it is marked here and reopened on arrival, showing what is still left to sign in to.
 *
 * Lives in its own module rather than in LoginDialog because exporting non-components from a
 * component file breaks React Fast Refresh.
 */

const KEY = 'idp_login_dialog_return'

export function markLoginDialogReturn(): void {
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    /* blocked storage: the login still works, the dialog just won't reopen by itself */
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

/**
 * The window name PageLayout opens OSB's login popup with. It stays the window's name while the
 * popup goes to Keycloak and back, so App.tsx can tell it is that popup; `window.opener` can't
 * tell, since any tab opened by script without `noopener` (from an OSB page, say) has one too.
 */
export const OSB_LOGIN_POPUP_NAME = 'kc-login'

/** OSB's login couldn't start: Keycloak didn't answer. */
export class OsbUnreachable extends Error {
  constructor() {
    super("Open Source Brain's sign-in (Keycloak) could not be reached")
  }
}
