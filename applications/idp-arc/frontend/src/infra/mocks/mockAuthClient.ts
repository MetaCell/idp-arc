import type { IAuthClient } from '../../core/ports/IAuthClient'

/**
 * MockAuthClient — in-memory stub for IAuthClient.
 *
 * • init()     resolves immediately as "authenticated"
 * • getToken() returns a static fake JWT payload
 * • login/logout do nothing (or log to console)
 * • tokenParsed returns a fake user payload
 */
export class MockAuthClient implements IAuthClient {
  readonly tokenParsed: Record<string, unknown> | null = {
    sub: 'mock-user-id',
    preferred_username: 'mock-user',
    email: 'mock@example.com',
    given_name: 'Mock',
    family_name: 'User',
  }

  async init(): Promise<boolean> {
    console.info('[MockAuthClient] init() → authenticated')
    return true
  }

  async getToken(_minValidity?: number): Promise<string> {
    return 'mock-access-token'
  }

  login(): void {
    console.info('[MockAuthClient] login() called — no-op in mock mode')
  }

  logout(): void {
    console.info('[MockAuthClient] logout() called — no-op in mock mode')
  }
}
