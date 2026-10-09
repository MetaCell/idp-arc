/**
 * IEmberAuth — per-user authentication against EMBER-DANDI.
 *
 * Distinct from IAuthClient: that one authenticates the user to *this app* and OSB (Keycloak).
 * This one authorises the app to act against *EMBER-DANDI* as that user, so the researcher's own
 * copy of an upload lands in their own account.
 *
 * EMBER-DANDI runs django-oauth-toolkit and issues short-lived Bearer tokens
 * (24h, `read write` scope) via authorization-code + PKCE. Because it is a public client
 * there is no secret, so the whole flow runs in the browser and the token never reaches
 * our backend or OSB.
 *
 * connectInPopup() is the usual flow; connect() is a full-page redirect for when the popup is
 * blocked, so callers with UI state to preserve persist it first (components/loginReturn.ts).
 * Why the popup works the way it does: .vscode/knowledge-base/ember-oauth-popup-and-coop.md.
 */
export interface IEmberAuth {
  /** True when a usable (non-expired) access token is held. */
  isConnected(): boolean

  /**
   * Starts the authorization-code + PKCE flow by navigating to EMBER-DANDI.
   * `returnTo` is the path to send the user back to once the callback completes.
   * Returns a promise that never resolves — the page unloads.
   */
  connect(returnTo?: string): Promise<never>

  /**
   * Signs in in a popup, without leaving the page; `done` settles once this tab holds the
   * token. Throws when the browser blocks the popup: then fall back to connect().
   */
  connectInPopup(): { done: Promise<void>; cancel: () => void }

  /** On the callback page: true when it is a popup sign-in's, whose code it has handed to the
   *  main tab (that page then only asks to be closed); false for the redirect flow. */
  relayPopupCallback(): boolean

  /** The path passed to connect(), read once and then cleared. */
  takeReturnTo(): string | null

  /**
   * Completes the flow on the redirect back. Call this on the callback route.
   * Returns the access token, or null when the URL carries no authorization code.
   * Throws if EMBER returned an error or the token exchange failed.
   */
  handleCallback(): Promise<string | null>

  /** Identity EMBER-DANDI associates with the current token. Throws when not connected. */
  getAccount(): Promise<{ username: string; name: string | null }>

  /** Epoch ms at which the current token expires; 0 when not connected. */
  readonly expiresAt: number

  /** Current access token, or null when not connected. */
  getToken(): string | null

  /** Discards the token. Does not revoke it at EMBER. */
  disconnect(): void
}
