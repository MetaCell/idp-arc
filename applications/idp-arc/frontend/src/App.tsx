import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'

import { AppContext } from './AppContext'
import { authClient } from './app/container'
import { theme } from './theme/components'
import type { AuthState } from './core/types'
import Home from './pages/LandingPage'
import Workspaces from './pages/Workspaces'
import ProtocolsPage from './pages/ProtocolsPage'
import AboutPage from './pages/AboutPage'

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/workspaces', element: <Workspaces /> },
  { path: '/protocols', element: <ProtocolsPage /> },
  { path: '/about', element: <AboutPage /> },
])

function App() {
  const { t } = useTranslation()
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [tokenParsed, setTokenParsed] = useState<Record<string, unknown> | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    authClient
      .init()
      .then((authenticated: boolean) => {
        // If running inside the login popup, signal the parent and close.
        if (authenticated && window.opener) {
          window.opener.postMessage({ type: 'keycloak-login-complete' }, window.location.origin)
          window.close()
          return
        }
        setAuthState(authenticated ? 'authenticated' : 'unauthenticated')
        if (authenticated && authClient.tokenParsed) {
          setTokenParsed(authClient.tokenParsed)
        }
      })
      .catch((err: Error) => {
        // Clear stale auth fragment so a page refresh doesn't retry a failed token exchange.
        if (window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
        }
        console.error('Keycloak init failed', err)
        setAuthError(t('errors.authFailed'))
        setAuthState('unauthenticated')
      })
  }, [t])

  // Reload after popup login so check-sso picks up the new Keycloak session.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.data?.type === 'keycloak-login-complete') {
        window.location.reload()
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])

  const username =
    (tokenParsed?.preferred_username as string) ??
    (tokenParsed?.email as string) ??
    'Unknown user'

  const appContextValue = useMemo(
    () => ({ authState, tokenParsed, authError, username }),
    [authState, tokenParsed, authError, username],
  )

  return (
    <AppContext.Provider value={appContextValue}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <RouterProvider router={router} />
      </ThemeProvider>
    </AppContext.Provider>
  )
}

export default App
