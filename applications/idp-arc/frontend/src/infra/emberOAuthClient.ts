import type { IEmberAuth } from '../core/ports/IEmberAuth'

/**
 * EMBER-DANDI OAuth via authorization-code + PKCE, run entirely in the browser.
 *
 * This is the ONLY file that knows EMBER's OAuth endpoints. Verified against the live service
 * 2026-09-17: /oauth/authorize/ and /oauth/token/ are django-oauth-toolkit, and tokens come back
 * as `Bearer` with `read write` scope and a 24h lifetime.
 *
 * Caveat found the hard way: the token endpoint's OPTIONS preflight returns CORS headers, but
 * the POST response does not, so a browser cannot read the exchange result cross-origin. Hence
 * the split between `authOrigin` and `apiBase` below: fetches go through IDP's own same-origin
 * `/ember-proxy` (Vite in dev, nginx deployed). Whether EMBER could fix this via the OAuth
 * application's `allowed_origins` is an open question for EMBER.
 *
 * The access token is held in memory and mirrored to sessionStorage so a page reload doesn't
 * force a re-login. The **refresh token is deliberately never stored**: it is the
 * long-lived credential, and persisting it in browser storage would hand durable account access
 * to any XSS. A 24h access token means re-connecting at most once a day.
 */

const VERIFIER_KEY = 'ember_pkce_verifier'
const TOKEN_KEY = 'ember_access_token'
const EXPIRY_KEY = 'ember_token_expiry'
const RETURN_KEY = 'ember_return_to'
const STATE_KEY = 'ember_oauth_state'

/** Same-origin channel the popup's callback page hands the code to the main tab on. */
const POPUP_CHANNEL = 'idp-ember-oauth'
/** `state` values starting with this mark a popup sign-in (see connectInPopup). */
const POPUP_STATE_PREFIX = 'popup.'
/** How long the main tab waits for the popup, including a first-time sign-up. */
const POPUP_TIMEOUT_MS = 15 * 60_000

/** The popup couldn't be opened (blocked by the browser): fall back to the full-page redirect. */
export class EmberPopupBlocked extends Error {}

/**
 * Route EMBER redirects back to, and the redirect URI registered on the OAuth application (one
 * per IDP origin). Also used by App.tsx, which skips Keycloak's own init() on this route.
 */
export const EMBER_CALLBACK_PATH = '/ember-callback'

/**
 * EMBER's callback params, snapshotted at module-evaluation time and removed from the URL.
 *
 * This has to happen before anything else reads the URL. keycloak-js treats `?code=`/`?state=`
 * as its OWN OAuth callback params: on init it tries to exchange them against Keycloak's token
 * endpoint and then strips them from the URL. Since it initialises on every route, it would
 * consume EMBER's authorization code before this client ever sees it (the symptom being a
 * silent "not connected" with a stray Keycloak token request in the network log).
 *
 * Module evaluation runs during import, before React renders and before any effect fires, so
 * capturing here reliably wins that race.
 */
const initialCallback: { code: string | null; error: string | null; state: string | null } | null = (() => {
  if (typeof window === 'undefined') return null
  if (window.location.pathname !== EMBER_CALLBACK_PATH) return null

  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const rawError = params.get('error')
  if (!code && !rawError) return null

  // Authorization codes are single-use, so there is nothing to retry: strip them at once.
  window.history.replaceState(null, '', window.location.pathname)

  return {
    code,
    error: rawError && `${rawError}: ${params.get('error_description') ?? ''}`,
    state: params.get('state'),
  }
})()

/** One popup sign-in's message from its callback page to the main tab. */
interface PopupResult { state: string; code: string | null; error: string | null }

function base64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function sha256(input: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
}

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch {
    /* private mode or blocked storage: the in-memory copy still works for this page load */
  }
}

export class EmberOAuthClient implements IEmberAuth {
  private token: string | null = null
  private callbackConsumed = false
  expiresAt = 0

  constructor(
    private readonly config: {
      /**
       * Real EMBER-DANDI origin. Used for the /oauth/authorize/ navigation, which must reach
       * EMBER directly: its login redirects out to GitHub, which returns to EMBER's own
       * domain, so this leg cannot go through a dev proxy.
       */
      authOrigin: string
      /**
       * Base for fetch() calls (token exchange and REST API): IDP's same-origin `/ember-proxy`,
       * because EMBER's token response carries no CORS headers.
       */
      apiBase: string
      clientId: string
      redirectUri: string
    },
  ) {
    this.token = read(TOKEN_KEY)
    this.expiresAt = Number(read(EXPIRY_KEY) ?? 0)
  }

  isConnected(): boolean {
    return this.getToken() !== null
  }

  getToken(): string | null {
    // Treat a token within 60s of expiry as gone, so a call can't start and then expire mid-flight.
    if (!this.token || Date.now() > this.expiresAt - 60_000) return null
    return this.token
  }

  /**
   * Builds the authorize URL and stashes the PKCE verifier and the `state` this tab expects back.
   * `state` also tells the callback page whether it is a popup: EMBER's COOP header nulls
   * `window.opener` there, so the page can't tell otherwise.
   */
  private async authorizeUrl(redirectUri: string, state: string): Promise<string> {
    if (!this.config.clientId) {
      throw new Error('VITE_EMBER_CLIENT_ID is not set; register a public OAuth client first.')
    }
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)).buffer)
    write(VERIFIER_KEY, verifier)
    write(STATE_KEY, state)

    const url = new URL(`${this.config.authOrigin}/oauth/authorize/`)
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      code_challenge: base64url(await sha256(verifier)),
      code_challenge_method: 'S256',
      state,
    }).toString()
    return url.toString()
  }

  /**
   * Full-page redirect to EMBER's authorize endpoint. `returnTo` is where handleCallback()
   * should send the user afterwards.
   *
   * The fallback for connectInPopup(), when the browser blocks the popup.
   *
   * The PKCE verifier survives the round trip because sessionStorage persists for the tab
   * across navigations, including cross-origin ones.
   */
  async connect(returnTo?: string): Promise<never> {
    if (returnTo) write(RETURN_KEY, returnTo)
    window.location.href = await this.authorizeUrl(this.config.redirectUri, `redirect.${nonce()}`)
    return new Promise<never>(() => {}) // page is unloading
  }

  /**
   * Signs in in a popup, without leaving the page. Users are expected to have an (approved)
   * EMBER-DANDI account already; IDP doesn't handle EMBER's sign-up or approval.
   *
   * EMBER's /oauth/authorize/ sends `Cross-Origin-Opener-Policy: same-origin`, which cuts the
   * popup off from this window both ways: `window.opener` is null in it, and `popup.closed` reads
   * true here even while it is open. So nothing here relies on that link
   * (.vscode/knowledge-base/ember-oauth-popup-and-coop.md). EMBER sends the popup back to
   * EMBER_CALLBACK_PATH on this origin; that page sees the popup `state` and hands the code over a
   * BroadcastChannel (relayPopupCallback). This tab, which holds the PKCE verifier, swaps it for the
   * token. It can't see the popup being closed, so `cancel()` and a timeout end the wait.
   *
   * The popup is opened synchronously, inside the click, so browsers don't block it; EMBER's URL
   * is set once the PKCE challenge is ready. Throws EmberPopupBlocked when it can't be opened.
   */
  connectInPopup(): { done: Promise<void>; cancel: () => void } {
    const popup = window.open('', 'ember-login', popupFeatures(520, 720))
    if (!popup) throw new EmberPopupBlocked('The EMBER-DANDI sign-in window was blocked')
    const state = `${POPUP_STATE_PREFIX}${nonce()}`
    const channel = new BroadcastChannel(POPUP_CHANNEL)
    let finish: (err?: Error) => void = () => {}
    const done = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Signing in with EMBER-DANDI took too long. Please try again.')), POPUP_TIMEOUT_MS)
      finish = (err) => {
        clearTimeout(timer)
        channel.close()
        if (err) reject(err); else resolve()
      }
      channel.onmessage = (event: MessageEvent<PopupResult>) => {
        const result = event.data
        if (!result || result.state !== state) return // another tab's sign-in
        if (result.error) return finish(new Error(`EMBER-DANDI refused authorization: ${result.error}`))
        if (!result.code) return finish(new Error('EMBER-DANDI returned no authorization code.'))
        this.exchange(result.code, state).then(() => finish(), (err: Error) => finish(err))
      }
    })
    this.authorizeUrl(this.config.redirectUri, state).then(
      (url) => { popup.location.href = url },
      (err: Error) => { popup.close(); finish(err) },
    )
    return { done, cancel: () => finish(new EmberSignInCancelled('Signing in with EMBER-DANDI was cancelled')) }
  }

  /**
   * On the callback page: when it is a popup sign-in's, hands the code (or error) to the main tab
   * and returns true; the page then just tells the user to close it. False for the redirect flow,
   * which goes on to handleCallback().
   */
  relayPopupCallback(): boolean {
    if (!initialCallback?.state?.startsWith(POPUP_STATE_PREFIX)) return false
    const channel = new BroadcastChannel(POPUP_CHANNEL)
    const result: PopupResult = { state: initialCallback.state, code: initialCallback.code, error: initialCallback.error }
    channel.postMessage(result)
    channel.close()
    return true
  }

  /** Path passed to connect(), consumed once. */
  takeReturnTo(): string | null {
    const value = read(RETURN_KEY)
    write(RETURN_KEY, null)
    return value
  }

  /** Identity EMBER-DANDI associates with the current token. */
  async getAccount(): Promise<{ username: string; name: string | null }> {
    const token = this.getToken()
    if (!token) throw new Error('Not connected to EMBER-DANDI.')
    const res = await fetch(`${this.config.apiBase}/api/users/me/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(`Could not read EMBER-DANDI account (HTTP ${res.status}).`)
    const body = await res.json()
    return { username: body.username, name: body.name ?? null }
  }

  async handleCallback(): Promise<string | null> {
    // Reads the module-load snapshot, not the live URL (see `initialCallback` above).
    // Consumed once: React invokes effects twice in dev, and the code is single-use.
    if (!initialCallback || this.callbackConsumed) return null
    this.callbackConsumed = true

    if (initialCallback.error) {
      throw new Error(`EMBER-DANDI refused authorization: ${initialCallback.error}`)
    }
    if (!initialCallback.code) return null
    return this.exchange(initialCallback.code, initialCallback.state)
  }

  /** Swaps an authorization code for an access token, if `state` is the one this tab sent. */
  private async exchange(code: string, state: string | null): Promise<string> {
    if (!state || state !== read(STATE_KEY)) {
      throw new Error('The EMBER-DANDI sign-in does not match the one started here; please try again.')
    }
    const verifier = read(VERIFIER_KEY)
    if (!verifier) {
      throw new Error('No PKCE verifier found: the login was started in a different browser session.')
    }

    const res = await fetch(`${this.config.apiBase}/oauth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.config.clientId,
        redirect_uri: this.config.redirectUri,
        code_verifier: verifier,
      }),
    })

    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      // A 400 here is almost always one of: the app's redirect URI list doesn't contain
      // `redirectUri` exactly (scheme included), or the code was already spent.
      throw new Error(`Token exchange failed (HTTP ${res.status}): ${JSON.stringify(body)}`)
    }

    write(VERIFIER_KEY, null)
    write(STATE_KEY, null)
    this.token = body.access_token as string
    this.expiresAt = Date.now() + Number(body.expires_in ?? 0) * 1000
    write(TOKEN_KEY, this.token)
    write(EXPIRY_KEY, String(this.expiresAt))
    return this.token
  }

  disconnect(): void {
    this.token = null
    this.expiresAt = 0
    write(TOKEN_KEY, null)
    write(EXPIRY_KEY, null)
    write(VERIFIER_KEY, null)
    write(STATE_KEY, null)
  }
}

/** The user closed the wait (Cancel); not an error to show. */
export class EmberSignInCancelled extends Error {}

function nonce(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(16)).buffer)
}

/** A centred popup of the given size. */
function popupFeatures(w: number, h: number): string {
  const left = Math.round((window.screen.width - w) / 2)
  const top = Math.round((window.screen.height - h) / 2)
  return `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`
}
