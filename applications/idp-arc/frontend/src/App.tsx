import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'

import { AppContext } from './AppContext'
import { authClient, EMBER_CALLBACK_PATH } from './app/container'
import { theme } from './theme/components'
import type { AuthState } from './core/types'
import Home from './pages/LandingPage'
import Workspaces from './pages/Workspaces'
import ProtocolsPage from './pages/ProtocolsPage'
import AboutPage from './pages/AboutPage'
import EmberCallback from './pages/EmberCallback'

/**
 * This window is OSB's (Keycloak) login popup, sent back here once the user has signed in. It only
 * finishes the sign-in, hands it to the main tab and closes; it never shows the app (it would
 * otherwise reopen the Login dialog: a popup starts with a copy of its opener's sessionStorage).
 * EMBER-DANDI's popup has no `window.opener` (COOP) and is handled on its callback route.
 */
const IN_OSB_LOGIN_POPUP = typeof window !== 'undefined' && !!window.opener
  && window.location.pathname !== EMBER_CALLBACK_PATH

/** What the OSB login popup shows while it finishes the sign-in and closes itself. */
function OsbLoginPopupScreen({ authState }: { authState: AuthState }) {
  const { t } = useTranslation('landingPage')
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, p: 4, textAlign: 'center' }}>
        {authState === 'loading' || authState === 'authenticated' ? (
          <>
            <CircularProgress size={28} />
            <Typography variant="body2" sx={{ opacity: 0.7 }}>{t('loginDialog.finishingSignIn')}</Typography>
          </>
        ) : (
          <Typography variant="body1">{t('loginDialog.closeWindow')}</Typography>
        )}
      </Box>
    </ThemeProvider>
  )
}

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/workspaces', element: <Workspaces /> },
  { path: '/protocols', element: <ProtocolsPage /> },
  { path: '/about', element: <AboutPage /> },
  { path: EMBER_CALLBACK_PATH, element: <EmberCallback /> },
])

function App() {
  const { t } = useTranslation()
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [tokenParsed, setTokenParsed] = useState<Record<string, unknown> | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return

    // Keycloak has no business on the EMBER-DANDI callback route: its check-sso can fall back to a
    // real top-level redirect, which would abort the EMBER token exchange running there. It
    // starts once the callback page has navigated back (router.subscribe: App renders the
    // RouterProvider, so it isn't inside it and can't useLocation).
    const tryInit = () => {
      if (initialized.current) return
      if (router.state.location.pathname === EMBER_CALLBACK_PATH) return
      initialized.current = true
      unsubscribe()
      startKeycloak()
    }
    const unsubscribe = router.subscribe(tryInit)
    tryInit()
    return () => unsubscribe()

    function startKeycloak() {
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
    }
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

  if (IN_OSB_LOGIN_POPUP) return <OsbLoginPopupScreen authState={authState} />

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
