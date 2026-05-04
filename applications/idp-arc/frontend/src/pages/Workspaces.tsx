import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authClient, loadWorkspaces, createAndUpload, getWorkspaceUrl } from '../app/container'
import type { Workspace, UploadState } from '../core/types'
import { useAppContext } from '../AppContext'

export default function Workspaces() {
  const { t } = useTranslation()
  const { authState, tokenParsed, authError, username } = useAppContext()
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null)
  const [workspacesError, setWorkspacesError] = useState<string | null>(null)
  const [workspacesLoading, setWorkspacesLoading] = useState(false)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>({ phase: 'idle', message: '' })
  const abortRef = useRef(false)

  const loadWorkspaceList = useCallback(() => {
    setWorkspacesLoading(true)
    setWorkspacesError(null)
    loadWorkspaces()
      .then((list) => {
        console.log('[IDP-ARC] Workspaces loaded:', list)
        setWorkspaces(list)
      })
      .catch((err: Error) => {
        console.error('Failed to fetch workspaces', err)
        setWorkspacesError(err.message)
      })
      .finally(() => setWorkspacesLoading(false))
  }, [])

  useEffect(() => {
    if (authState !== 'authenticated') return
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
    return <div className="card"><p>{t('auth.initialising')}</p></div>
  }

  if (authError) {
    return <div className="card"><p style={{ color: 'red' }}>{authError}</p></div>
  }

  if (authState === 'unauthenticated') {
    return (
      <div className="card">
        <h1>{t('app.title')}</h1>
        <p>{t('auth.notLoggedIn')}</p>
        <button onClick={() => authClient.login()}>{t('auth.signIn')}</button>
      </div>
    )
  }

  const isRunning = ['creating', 'spawning', 'waiting', 'uploading'].includes(uploadState.phase)

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h1>{t('app.title')}</h1>
        <p>{t('auth.signedInAs')} <strong>{username}</strong></p>
        <button onClick={() => authClient.logout()}>{t('auth.signOut')}</button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>{t('workspaces.title')}</h2>
          <button onClick={openModal}>{t('workspaces.newButton')}</button>
        </div>
        {workspacesLoading && <p>{t('workspaces.loading')}</p>}
        {workspacesError && (
          <p style={{ color: 'red' }}>{t('errors.workspacesLoad', { message: workspacesError })}</p>
        )}
        {workspaces && workspaces.length === 0 && (
          <p>{t('workspaces.empty')}</p>
        )}
        {workspaces && workspaces.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ccc', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>{t('workspaces.table.id')}</th>
                <th style={{ padding: '0.5rem' }}>{t('workspaces.table.name')}</th>
                <th style={{ padding: '0.5rem' }}>{t('workspaces.table.description')}</th>
                <th style={{ padding: '0.5rem' }}>{t('workspaces.table.created')}</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((ws) => (
                <tr key={ws.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.5rem', color: '#888', fontSize: '0.8rem' }}>{ws.id}</td>
                  <td style={{ padding: '0.5rem' }}><strong>{ws.name}</strong></td>
                  <td style={{ padding: '0.5rem' }}>{ws.description ?? t('workspaces.table.noDescription')}</td>
                  <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>
                    {ws.timestamp_created
                      ? new Date(ws.timestamp_created).toLocaleDateString()
                      : t('workspaces.table.noDate')}
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
            background: 'var(--mui-palette-black-200)',
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
            <h2 style={{ marginTop: 0 }}>{t('modal.title')}</h2>

            {uploadState.phase === 'idle' && (
              <>
                <label style={{ display: 'block', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 600 }}>{t('modal.workspaceNameLabel')}</span>
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    placeholder={t('modal.workspaceNamePlaceholder')}
                    style={{ display: 'block', width: '100%', marginTop: '0.25rem', padding: '0.4rem 0.6rem', boxSizing: 'border-box' }}
                  />
                </label>

                <label style={{ display: 'block', marginBottom: '1.5rem' }}>
                  <span style={{ fontWeight: 600 }}>{t('modal.fileLabel')}</span>
                  <input
                    type="file"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                    style={{ display: 'block', marginTop: '0.25rem' }}
                  />
                  {selectedFile && (
                    <span style={{ fontSize: '0.85rem', color: '#555' }}>
                      {t('modal.fileInfo', { name: selectedFile.name, size: (selectedFile.size / 1024).toFixed(1) })}
                    </span>
                  )}
                </label>

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                  <button onClick={closeModal}>{t('modal.cancel')}</button>
                  <button
                    onClick={handleCreateAndUpload}
                    disabled={!workspaceName.trim() || !selectedFile}
                  >
                    {t('modal.createAndUpload')}
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
                    {t('modal.workspaceId')}<strong>{uploadState.workspaceId}</strong>
                  </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <button onClick={closeModal}>{t('modal.cancel')}</button>
                </div>
              </div>
            )}

            {uploadState.phase === 'done' && (
              <div>
                <p style={{ color: 'green', fontWeight: 600 }}>{t('modal.uploadSuccess')}</p>
                {uploadState.workspaceId && (
                  <p>
                    <a
                      href={getWorkspaceUrl(uploadState.workspaceId!)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t('modal.openWorkspace')}
                    </a>
                  </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <button onClick={closeModal}>{t('modal.close')}</button>
                </div>
              </div>
            )}

            {uploadState.phase === 'error' && (
              <div>
                <p style={{ color: 'red', fontWeight: 600 }}>{t('modal.uploadFailed')}</p>
                <p style={{ fontSize: '0.9rem', color: '#555' }}>{uploadState.error}</p>
                {uploadState.workspaceId && (
                  <p style={{ fontSize: '0.9rem' }}>
                    {t('modal.workspaceCreated')}{' '}
                    <a
                      href={getWorkspaceUrl(uploadState.workspaceId!)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t('modal.uploadManually')}
                    </a>{' '}
                    {t('modal.uploadManuallyTrailing')}
                  </p>
                )}
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                  <button onClick={closeModal}>{t('modal.close')}</button>
                  <button onClick={handleCreateAndUpload}>{t('modal.retry')}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
