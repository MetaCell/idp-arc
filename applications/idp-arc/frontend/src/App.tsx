import { useEffect, useState } from 'react'
import Keycloak from 'keycloak-js'
import './App.css'

const keycloak = new Keycloak({
  url: 'https://accounts.v2dev.opensourcebrain.org/auth',
  realm: 'osb2dev',
  clientId: 'idp-arc',
})

type AuthState = 'loading' | 'authenticated' | 'unauthenticated'

function App() {
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [tokenParsed, setTokenParsed] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    keycloak
      .init({
        onLoad: 'check-sso',
        pkceMethod: 'S256',
        checkLoginIframe: false,
      })
      .then((authenticated) => {
        setAuthState(authenticated ? 'authenticated' : 'unauthenticated')
        if (authenticated && keycloak.tokenParsed) {
          setTokenParsed(keycloak.tokenParsed as Record<string, unknown>)
        }
      })
      .catch((err) => {
        console.error('Keycloak init failed', err)
        setError('Failed to initialise authentication. See console for details.')
        setAuthState('unauthenticated')
      })
  }, [])

  if (authState === 'loading') {
    return <div className="card"><p>Initialising authentication…</p></div>
  }

  if (error) {
    return <div className="card"><p style={{ color: 'red' }}>{error}</p></div>
  }

  if (authState === 'unauthenticated') {
    return (
      <div className="card">
        <h1>IDP-ARC</h1>
        <p>You are not logged in.</p>
        <button onClick={() => keycloak.login()}>Sign in with OSB</button>
      </div>
    )
  }

  const username =
    (tokenParsed?.preferred_username as string) ??
    (tokenParsed?.email as string) ??
    'Unknown user'

  return (
    <div className="card">
      <h1>IDP-ARC</h1>
      <p>Signed in as <strong>{username}</strong></p>
      <details style={{ textAlign: 'left', marginTop: '1rem' }}>
        <summary>Token claims</summary>
        <pre style={{ fontSize: '0.75rem', overflowX: 'auto' }}>
          {JSON.stringify(tokenParsed, null, 2)}
        </pre>
      </details>
      <button style={{ marginTop: '1rem' }} onClick={() => keycloak.logout()}>
        Sign out
      </button>
    </div>
  )
}

export default App
