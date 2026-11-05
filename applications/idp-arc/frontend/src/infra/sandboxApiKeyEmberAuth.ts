import type { IEmberAuth } from '../core/ports/IEmberAuth'

/** Sent instead of a token; the dev proxy replaces it with the DANDI_SANDBOX_API_KEY it holds. */
const PLACEHOLDER_TOKEN = 'sandbox-proxy-api-key'

/**
 * Local development only: always "signed in", as the owner of DANDI_SANDBOX_API_KEY. The key stays in
 * the Vite dev server, which sets `Authorization: token <key>` on every proxied DANDI call
 * (vite.config.ts); the browser never sees it. For DANDI's sandbox, which has no OAuth app for us.
 */
export class SandboxApiKeyEmberAuth implements IEmberAuth {
  readonly expiresAt = Number.MAX_SAFE_INTEGER
  private readonly apiBase: string

  constructor(apiBase: string) {
    this.apiBase = apiBase
  }

  isConnected(): boolean {
    return true
  }

  getToken(): string {
    return PLACEHOLDER_TOKEN
  }

  async getAccount(): Promise<{ username: string; name: string | null }> {
    const res = await fetch(`${this.apiBase}/api/users/me/`, { headers: { Authorization: `Bearer ${PLACEHOLDER_TOKEN}` } })
    if (!res.ok) throw new Error(`Could not read the DANDI account of DANDI_SANDBOX_API_KEY (HTTP ${res.status}).`)
    const body = await res.json()
    return { username: body.username, name: body.name ?? null }
  }

  connect(): Promise<never> {
    return Promise.reject(new Error('Signed in through DANDI_SANDBOX_API_KEY; there is no sign-in flow.'))
  }

  connectInPopup(): { done: Promise<void>; cancel: () => void } {
    return { done: Promise.resolve(), cancel: () => {} }
  }

  relayPopupCallback(): boolean {
    return false
  }

  takeReturnTo(): string | null {
    return null
  }

  async handleCallback(): Promise<string | null> {
    return null
  }

  disconnect(): void {}
}
