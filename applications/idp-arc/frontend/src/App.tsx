import { useEffect, useState } from 'react'
import Keycloak from 'keycloak-js'
import './App.css'

const keycloak = new Keycloak({
  url: 'https://accounts.v2dev.opensourcebrain.org',
  realm: 'osb2dev',
  clientId: 'idp-arc',
})

const WORKSPACES_URL =
  'https://www.v2dev.opensourcebrain.org/proxy/workspaces/api/workspace?page=1&per_page=24&q=&tags='

type AuthState = 'loading' | 'authenticated' | 'unauthenticated'

interface Workspace {
  id: string | number
  name: string
  description?: string
  timestamp_created?: string
  thumbnail?: string
}

function App() {
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [tokenParsed, setTokenParsed] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null)
  const [workspacesError, setWorkspacesError] = useState<string | null>(null)
  const [workspacesLoading, setWorkspacesLoading] = useState(false)

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

  useEffect(() => {
    if (authState !== 'authenticated') return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkspacesLoading(true)
    keycloak.updateToken(30)
      .then(() =>
        fetch(WORKSPACES_URL, {
          credentials: 'include', // sends kc-access, kc-state and any other v2dev cookies
          headers: { Authorization: `Bearer ${keycloak.token}` },
        })
      )
      .then((res) => {
        if (!res.ok) throw new Error(`API responded ${res.status} ${res.statusText}`)
        return res.json()
      })
      .then((data) => {
        // handle both a plain array and a wrapped { results: [], items: [], workspaces: [] }
        const list: Workspace[] = Array.isArray(data)
          ? data
          : (data.results ?? data.items ?? data.workspaces ?? [])
        setWorkspaces(list)
      })
      .catch((err: Error) => {
        console.error('Failed to fetch workspaces', err)
        setWorkspacesError(err.message)
      })
      .finally(() => setWorkspacesLoading(false))
  }, [authState])

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
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h1>IDP-ARC</h1>
        <p>Signed in as <strong>{username}</strong></p>
        <button onClick={() => keycloak.logout()}>Sign out</button>
      </div>

      <div className="card">
        <h2>OSB Workspaces</h2>
        {workspacesLoading && <p>Loading workspaces…</p>}
        {workspacesError && (
          <p style={{ color: 'red' }}>Error: {workspacesError}</p>
        )}
        {workspaces && workspaces.length === 0 && (
          <p>No workspaces found.</p>
        )}
        {workspaces && workspaces.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ccc', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>ID</th>
                <th style={{ padding: '0.5rem' }}>Name</th>
                <th style={{ padding: '0.5rem' }}>Description</th>
                <th style={{ padding: '0.5rem' }}>Created</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((ws) => (
                <tr key={ws.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem', color: '#888', fontSize: '0.8rem' }}>{ws.id}</td>
                  <td style={{ padding: '0.5rem' }}><strong>{ws.name}</strong></td>
                  <td style={{ padding: '0.5rem' }}>{ws.description ?? '—'}</td>
                  <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>
                    {ws.timestamp_created
                      ? new Date(ws.timestamp_created).toLocaleDateString()
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default App
