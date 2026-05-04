import Keycloak from 'keycloak-js'
import type { IAuthClient } from '../core/ports/IAuthClient'

/**
 * KeycloakAuthClient — concrete implementation of IAuthClient backed by keycloak-js.
 *
 * This is the ONLY file in the codebase that imports keycloak-js.
 * Replacing Keycloak with Auth0 means writing a new class here — nothing else changes.
 */
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
