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

/**
 * The window name alone is not enough: signing in to OSB through GitHub or ORCID takes the popup
 * through pages whose Cross-Origin-Opener-Policy moves it to a new browsing context group, which
 * clears `window.name` and nulls `window.opener` (and makes `popup.closed` read true in this tab).
 * So the main tab also records the `state` of the login URL it sent the popup to, in localStorage
 * (shared with the popup), and the popup recognises itself when Keycloak sends it back with that
 * state. It tells the main tab over a BroadcastChannel, which needs no opener.
 */
const OSB_POPUP_STATE_KEY = 'idp_osb_login_popup_state'
export const OSB_LOGIN_CHANNEL = 'idp-osb-login'
export const OSB_LOGIN_COMPLETE = 'keycloak-login-complete'

/** Whether this tab opened the OSB login popup now being waited for (it reopens the dialog on reload). */
let osbPopupOpenedHere = false
export const osbLoginPopupOpenedHere = () => osbPopupOpenedHere

/** In the main tab, as the popup is sent to Keycloak's `loginUrl`. */
export function markOsbLoginPopup(loginUrl: string): void {
  osbPopupOpenedHere = true
  try {
    const state = new URL(loginUrl).searchParams.get('state')
    if (state) localStorage.setItem(OSB_POPUP_STATE_KEY, state)
  } catch {
    /* blocked storage: the window name still tells the popup in most cases */
  }
}

/** In the main tab, when it stops waiting for the popup. */
export function clearOsbLoginPopup(): void {
  osbPopupOpenedHere = false
  try { localStorage.removeItem(OSB_POPUP_STATE_KEY) } catch { /* nothing to clear */ }
}

/**
 * Whether this window is the OSB login popup back from Keycloak: its window name, or the
 * callback's `state` matching the one recorded by the main tab. Read before Keycloak's init
 * strips the callback from the URL.
 */
export function isOsbLoginPopup(): boolean {
  if (window.name === OSB_LOGIN_POPUP_NAME) return true
  try {
    const expected = localStorage.getItem(OSB_POPUP_STATE_KEY)
    if (!expected) return false
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search)
    if (params.get('state') !== expected) return false
    localStorage.removeItem(OSB_POPUP_STATE_KEY)
    return true
  } catch {
    return false
  }
}

/** OSB's login couldn't start: Keycloak didn't answer. */
export class OsbUnreachable extends Error {
  constructor() {
    super("Open Source Brain's sign-in (Keycloak) could not be reached")
  }
}
