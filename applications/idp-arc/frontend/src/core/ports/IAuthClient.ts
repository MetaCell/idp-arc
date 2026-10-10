/**
 * IAuthClient — abstraction over any authentication provider (Keycloak, Auth0, etc.)
 *
 * DIP rule: business logic (use-cases) imports ONLY this interface.
 * The concrete keycloak-js adapter lives in src/infra/ and is injected at
 * the composition root — the use-cases never know which provider is used.
 */
export interface IAuthClient {
  /** Initialises the auth provider. Returns true when the user is already authenticated. */
  init(): Promise<boolean>

  /** Returns the current bearer token, refreshing it if it will expire within `minValidity` seconds. */
  getToken(minValidity?: number): Promise<string>

  /** Returns the IdP login URL so callers can open it in a popup rather than redirecting. */
  getLoginUrl(redirectUri: string): Promise<string>

  /** Redirects the user to the IdP login page. */
  login(): void

  /** Logs the user out and clears the session. */
  logout(): void

  /** Calls `listener` when the session turns out to be over (its token can no longer be had), so
   *  the app stops showing the user as signed in. */
  onSessionEnded(listener: () => void): void

  /** Parsed payload of the current token, or null when unauthenticated. */
  readonly tokenParsed: Record<string, unknown> | null
}
