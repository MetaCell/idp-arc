import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

// ─── DI: import ONLY from the composition root, never from infra directly ─────
import { authClient, loadWorkspaces, createAndUpload, getWorkspaceUrl } from './app/container'
import type { AuthState, Workspace, UploadState } from './core/types'

// App.tsx has one responsibility: React state + rendering.
// All business logic lives in use-cases; all side-effects live in infra.

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

    authClient
      .init()
      .then((authenticated: boolean) => {
        setAuthState(authenticated ? 'authenticated' : 'unauthenticated')
        if (authenticated && authClient.tokenParsed) {
          setTokenParsed(authClient.tokenParsed)
        }
      })
      .catch((err: Error) => {
        console.error('Keycloak init failed', err)
        setError('Failed to initialise authentication. See console for details.')
        setAuthState('unauthenticated')
      })
  }, [])

  // useCallback gives a stable reference so the useEffect below doesn't
  // re-run on every render, and allows imperative calls after upload.
  const loadWorkspaceList = useCallback(() => {
    setWorkspacesLoading(true)
    setWorkspacesError(null)
    loadWorkspaces()
      .then(setWorkspaces)
      .catch((err: Error) => {
        console.error('Failed to fetch workspaces', err)
        setWorkspacesError(err.message)
      })
      .finally(() => setWorkspacesLoading(false))
  }, [])

  useEffect(() => {
    if (authState !== 'authenticated') return
    // async IIFE keeps setState calls off the synchronous effect body
    void (async () => { loadWorkspaceList() })()
  }, [authState, loadWorkspaceList])

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
    abortRef.current = false

    await createAndUpload(
      {
        workspaceName: workspaceName.trim(),
        file: selectedFile,
        userId: tokenParsed?.sub as string,
        // Called right after the workspace is created — before the 30 s PVC
        // wait — so the browser still treats this as a user-gesture and allows
        // window.open() without triggering the popup blocker.
        onWorkspaceCreated: (wsId) => {
          window.open(getWorkspaceUrl(wsId), '_blank')
        },
      },
      setUploadState,
      abortRef,
    )

    loadWorkspaceList()
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
        <button onClick={() => authClient.login()}>Sign in with OSB</button>
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
        <button onClick={() => authClient.logout()}>Sign out</button>
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
                      href={getWorkspaceUrl(uploadState.workspaceId!)}
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
                      href={getWorkspaceUrl(uploadState.workspaceId!)}
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
