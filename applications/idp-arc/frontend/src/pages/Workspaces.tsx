import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authClient, loadWorkspaces, createWorkspace } from '../app/container'
import type { Workspace } from '../core/types'
import { useAppContext } from '../AppContext'

export default function Workspaces() {
  const { t } = useTranslation()
  const { authState, authError, username } = useAppContext()
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null)
  const [workspacesError, setWorkspacesError] = useState<string | null>(null)
  const [workspacesLoading, setWorkspacesLoading] = useState(false)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [workspaceName, setWorkspaceName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

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
    setCreateError(null)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
  }

  async function handleCreate() {
    if (!workspaceName.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      await createWorkspace(workspaceName.trim())
      setModalOpen(false)
      loadWorkspaceList()
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
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

      {/* ── New workspace modal ───────────────────────────────────────────── */}
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
          <div className="card" style={{ width: '480px', maxWidth: '90vw', padding: '2rem', position: 'relative' }}>
            <h2 style={{ marginTop: 0 }}>{t('modal.title')}</h2>

            <label style={{ display: 'block', marginBottom: '1.5rem' }}>
              <span style={{ fontWeight: 600 }}>{t('modal.workspaceNameLabel')}</span>
              <input
                type="text"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                placeholder={t('modal.workspaceNamePlaceholder')}
                disabled={creating}
                style={{ display: 'block', width: '100%', marginTop: '0.25rem', padding: '0.4rem 0.6rem', boxSizing: 'border-box' }}
              />
            </label>

            {createError && (
              <p style={{ color: 'red', fontSize: '0.9rem' }}>
                {t('modal.creationFailed', { message: createError })}
              </p>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={closeModal} disabled={creating}>{t('modal.cancel')}</button>
              <button onClick={handleCreate} disabled={!workspaceName.trim() || creating}>
                {t('modal.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
