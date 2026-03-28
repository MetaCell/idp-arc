import { useEffect, useRef, useState } from 'react'
import Keycloak from 'keycloak-js'
import './App.css'

const keycloak = new Keycloak({
  url: 'https://accounts.v2dev.opensourcebrain.org',
  realm: 'osb2dev',
  clientId: 'idp-arc',
})

const BASE_DOMAIN = 'v2dev.opensourcebrain.org'
const WORKSPACES_URL =
  `https://www.${BASE_DOMAIN}/proxy/workspaces/api/workspace?page=1&per_page=24&q=&tags=`
const WORKSPACES_API = `https://www.${BASE_DOMAIN}/proxy/workspaces/api`
const JUPYTER_BASE = `https://lab.${BASE_DOMAIN}`

/** Try to refresh the token; if no refresh token is available, silently proceed with the current one. */
async function safeUpdateToken(minValidity = 30) {
  try {
    await keycloak.updateToken(minValidity)
  } catch {
    // No refresh token available (e.g. check-sso without offline session).
    // Proceed with the current token as long as it hasn't expired.
    if (!keycloak.token) throw new Error('No access token available. Please sign in again.')
  }
}

type AuthState = 'loading' | 'authenticated' | 'unauthenticated'

interface Workspace {
  id: string | number
  name: string
  description?: string
  timestamp_created?: string
  thumbnail?: string
}

type UploadPhase = 'idle' | 'creating' | 'spawning' | 'waiting' | 'uploading' | 'done' | 'error'

interface UploadState {
  phase: UploadPhase
  message: string
  error?: string
  workspaceId?: number
}

const PHASE_LABELS: Record<UploadPhase, string> = {
  idle: '',
  creating: '1 / 4 — Creating workspace…',
  spawning: '2 / 4 — Starting JupyterLab server…',
  waiting: '3 / 4 — Waiting for JupyterLab to be ready…',
  uploading: '4 / 4 — Uploading file…',
  done: 'Done!',
  error: 'Error',
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
  })
}

function App() {
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [tokenParsed, setTokenParsed] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null)
  const [workspacesError, setWorkspacesError] = useState<string | null>(null)
  const [workspacesLoading, setWorkspacesLoading] = useState(false)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>({ phase: 'idle', message: '' })
  const abortRef = useRef(false)
  const keycloakInitialized = useRef(false)

  useEffect(() => {
    if (keycloakInitialized.current) return
    keycloakInitialized.current = true

    keycloak
      .init({
        onLoad: 'check-sso',
        pkceMethod: 'S256',
        checkLoginIframe: false,
        scope: 'openid profile email administrator-scope',
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
    loadWorkspaces()
  }, [authState])

  function loadWorkspaces() {
    setWorkspacesLoading(true)
    setWorkspacesError(null)
    safeUpdateToken(30)
      .then(() =>
        fetch(WORKSPACES_URL, {
          headers: { Authorization: `Bearer ${keycloak.token}` },
        })
      )
      .then((res) => {
        if (!res.ok) throw new Error(`API responded ${res.status} ${res.statusText}`)
        return res.json()
      })
      .then((data) => {
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
  }

  function openModal() {
    setWorkspaceName('')
    setSelectedFile(null)
    setUploadState({ phase: 'idle', message: '' })
    abortRef.current = false
    setModalOpen(true)
  }

  function closeModal() {
    abortRef.current = true
    setModalOpen(false)
  }

  async function handleCreateAndUpload() {
    if (!workspaceName.trim() || !selectedFile) return

    const userId = tokenParsed?.sub as string
    abortRef.current = false

    try {
      // Step 1: Create workspace
      setUploadState({ phase: 'creating', message: PHASE_LABELS.creating })
      await safeUpdateToken(30)
      const createRes = await fetch(`${WORKSPACES_API}/workspace`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${keycloak.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: workspaceName.trim(), description: workspaceName.trim() }),
      })
      if (!createRes.ok) {
        throw new Error(`Failed to create workspace: ${createRes.status} ${createRes.statusText}`)
      }
      const ws = await createRes.json()
      const wsId: number = ws.id
      // JupyterHub named-server convention used by OSB: {workspaceId}lab
      const serverName = `${wsId}lab`
      const wsOpenUrl = `https://www.${BASE_DOMAIN}/workspaces/open/${wsId}/jupyter`

      // Open the new workspace in a background tab immediately after creation
      const newTab = window.open(wsOpenUrl, '_blank')
      if (newTab) window.focus()

      if (abortRef.current) return

      // Step 2: Set the accessToken cookie so JupyterHub can authenticate the user,
      // then trigger the server spawn via a no-cors GET to the hub spawn URL.
      setUploadState({ phase: 'spawning', message: PHASE_LABELS.spawning, workspaceId: wsId })
      document.cookie = `accessToken=${keycloak.token};path=/;domain=.${BASE_DOMAIN};SameSite=Lax`

      // Fire-and-forget: the hub login handler reads the cookie and creates a session.
      // no-cors is intentional — we don't need the response, just to trigger auth + spawn.
      void fetch(`${JUPYTER_BASE}/hub/chlogin?next=%2Fhub%2Fspawn%2F${userId}%2F${serverName}`, {
        credentials: 'include',
        mode: 'no-cors',
      })

      // Wait 30 s for the PVC to be provisioned before starting to poll
      for (let i = 30; i > 0; i--) {
        if (abortRef.current) return
        setUploadState({
          phase: 'spawning',
          message: `2 / 4 — Waiting for PVC to initialise… ${i}s`,
          workspaceId: wsId,
        })
        await new Promise((r) => setTimeout(r, 1_000))
      }

      if (abortRef.current) return

      // Step 3: Poll until JupyterLab Contents API responds (server is ready)
      setUploadState({ phase: 'waiting', message: PHASE_LABELS.waiting, workspaceId: wsId })
      const contentsBaseUrl = `${JUPYTER_BASE}/user/${userId}/${serverName}/api/contents/`
      const deadline = Date.now() + 240_000 // 2-minute timeout
      let serverReady = false

      while (!abortRef.current && Date.now() < deadline) {
        try {
          const probe = await fetch(contentsBaseUrl, { credentials: 'include' })
          if (probe.ok) {
            serverReady = true
            break
          }
          // 4xx other than 503 (not ready yet) usually means server is up but auth failed
          if (probe.status !== 503 && probe.status !== 502) break
        } catch {
          // network / CORS error — keep trying
        }
        await new Promise((r) => setTimeout(r, 4_000))
      }

      if (abortRef.current) return

      if (!serverReady) {
        throw new Error(
          'Could not reach the JupyterLab server within the timeout. ' +
          'This may be due to CORS restrictions or a slow cold-start. ' +
          'The workspace was created — you can open it in JupyterLab and upload the file manually.'
        )
      }

      // Step 4: Upload via JupyterLab Contents API
      setUploadState({ phase: 'uploading', message: PHASE_LABELS.uploading, workspaceId: wsId })
      const fileContent = await readFileAsBase64(selectedFile)
      const uploadRes = await fetch(
        `${JUPYTER_BASE}/user/${userId}/${serverName}/api/contents/${encodeURIComponent(selectedFile.name)}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: selectedFile.name,
            path: selectedFile.name,
            type: 'file',
            format: 'base64',
            content: fileContent,
          }),
        }
      )
      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.status} ${uploadRes.statusText}`)
      }

      setUploadState({ phase: 'done', message: PHASE_LABELS.done, workspaceId: wsId })
      // Refresh workspace list so the new workspace appears
      loadWorkspaces()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setUploadState((prev) => ({ ...prev, phase: 'error', error: msg }))
    }
  }

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

  const isRunning = ['creating', 'spawning', 'waiting', 'uploading'].includes(uploadState.phase)

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h1>IDP-ARC</h1>
        <p>Signed in as <strong>{username}</strong></p>
        <button onClick={() => keycloak.logout()}>Sign out</button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>OSB Workspaces</h2>
          <button onClick={openModal}>+ New workspace &amp; upload file</button>
        </div>
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

      {/* ── Upload modal ──────────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div
            className="card"
            style={{ width: '480px', maxWidth: '90vw', padding: '2rem', position: 'relative' }}
          >
            <h2 style={{ marginTop: 0 }}>New workspace &amp; upload file</h2>

            {uploadState.phase === 'idle' && (
              <>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600 }}>Workspace name</span>
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    placeholder="My new workspace"
                    style={{ display: 'block', width: '100%', marginTop: '0.25rem', padding: '0.4rem 0.6rem', boxSizing: 'border-box' }}
                  />
                </label>

                <label style={{ display: 'block', marginBottom: '1.5rem' }}>
                  <span style={{ fontWeight: 600 }}>File to upload</span>
                  <input
                    type="file"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    style={{ display: 'block', marginTop: '0.25rem' }}
                  />
                  {selectedFile && (
                    <span style={{ fontSize: '0.85rem', color: '#555' }}>
                      {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </span>
                  )}
                </label>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button onClick={closeModal}>Cancel</button>
                  <button
                    onClick={handleCreateAndUpload}
                    disabled={!workspaceName.trim() || !selectedFile}
                  >
                    Create &amp; upload
                  </button>
                </div>
              </>
            )}

            {isRunning && (
              <div>
                <p style={{ fontStyle: 'italic' }}>{uploadState.message}</p>
                <progress style={{ width: '100%' }} />
                {uploadState.workspaceId && (
                  <p style={{ fontSize: '0.85rem', color: '#555' }}>
                    Workspace ID: <strong>{uploadState.workspaceId}</strong>
                  </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <button onClick={closeModal}>Cancel</button>
                </div>
              </div>
            )}

            {uploadState.phase === 'done' && (
              <div>
                <p style={{ color: 'green', fontWeight: 600 }}>✓ File uploaded successfully!</p>
                {uploadState.workspaceId && (
                  <p>
                    <a
                      href={`https://www.${BASE_DOMAIN}/workspaces/open/${uploadState.workspaceId}/jupyter`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open workspace in JupyterLab ↗
                    </a>
                  </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <button onClick={closeModal}>Close</button>
                </div>
              </div>
            )}

            {uploadState.phase === 'error' && (
              <div>
                <p style={{ color: 'red', fontWeight: 600 }}>Upload failed</p>
                <p style={{ fontSize: '0.9rem', color: '#555' }}>{uploadState.error}</p>
                {uploadState.workspaceId && (
                  <p style={{ fontSize: '0.9rem' }}>
                    The workspace was created.{' '}
                    <a
                      href={`https://www.${BASE_DOMAIN}/workspaces/open/${uploadState.workspaceId}/jupyter`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open it in JupyterLab ↗
                    </a>{' '}
                    to upload the file manually.
                  </p>
                )}
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <button onClick={closeModal}>Close</button>
                  <button onClick={handleCreateAndUpload}>Retry upload</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
