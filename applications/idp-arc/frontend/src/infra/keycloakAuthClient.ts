import Keycloak from 'keycloak-js'
import type { IAuthClient } from '../core/ports/IAuthClient'

// In dev, keycloak-js AJAX calls (token exchange, discovery) are cross-origin
// and blocked by CORS. We intercept those fetches and route them through the
// Vite dev server proxy (/keycloak-proxy → accounts.v2dev.opensourcebrain.org)
// so they are same-origin. Browser navigations (login redirect) are unaffected
// because they don't go through fetch.
if (import.meta.env.DEV) {
  const _fetch = window.fetch
  window.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url.startsWith('https://accounts.v2dev.opensourcebrain.org/')) {
      const proxied = url.replace('https://accounts.v2dev.opensourcebrain.org', '/keycloak-proxy')
      return _fetch(input instanceof Request ? new Request(proxied, input) : proxied, init)
    }
    return _fetch(input, init)
  }
}

export class KeycloakAuthClient implements IAuthClient {
  private readonly kc: Keycloak

  constructor(config: { url: string; realm: string; clientId: string }) {
    this.kc = new Keycloak(config)
  }

  init(): Promise<boolean> {
    return this.kc.init({
      onLoad: 'check-sso',
      pkceMethod: 'S256',
      checkLoginIframe: false,
      scope: 'openid profile email administrator-scope',
    })
  }

  async getToken(minValidity = 30): Promise<string> {
    try {
      await this.kc.updateToken(minValidity)
    } catch {
      // No refresh token available (check-sso without offline session).
      // Fall through and use the current token if it still exists.
    }
    if (!this.kc.token) {
      throw new Error('No access token available. Please sign in again.')
    }
    return this.kc.token
  }

  login(): void {
    void this.kc.login()
  }

  logout(): void {
    void this.kc.logout({ redirectUri: window.location.origin + '/' })
  }

  get tokenParsed(): Record<string, unknown> | null {
    return (this.kc.tokenParsed as Record<string, unknown>) ?? null
  }
}
