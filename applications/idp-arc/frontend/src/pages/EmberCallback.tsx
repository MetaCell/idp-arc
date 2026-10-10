import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Button, CircularProgress, Typography } from '@mui/material'

import { emberAuth } from '../app/container'

/**
 * Where EMBER-DANDI's sign-in redirects back to (EMBER_CALLBACK_PATH).
 *
 * In the sign-in popup (the usual case): hands the code to the main tab, which finishes the
 * sign-in, and closes. EMBER's COOP header can stop a script closing the window, so it then asks
 * the user to close it.
 *
 * After the full-page redirect (when the popup was blocked): exchanges the code for the token,
 * then returns to the page the sign-in started from; PageLayout reopens the Login dialog there
 * (components/loginReturn.ts).
 */
export default function EmberCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  // Relayed once, at first render: the code is single-use.
  const [inPopup] = useState(() => emberAuth.relayPopupCallback())

  useEffect(() => {
    if (inPopup) {
      window.close()
      return
    }
    emberAuth
      .handleCallback()
      .then(() => navigate(emberAuth.takeReturnTo() ?? '/', { replace: true }))
      .catch((err: unknown) => {
        console.error('EMBER-DANDI sign-in failed', err)
        setError(err instanceof Error ? err.message : String(err))
      })
  }, [inPopup, navigate])

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, p: 4, textAlign: 'center' }}>
      {inPopup ? (
        <Typography variant="body1">You can close this window and go back to IDP.</Typography>
      ) : error ? (
        <>
          <Typography variant="body1" sx={{ color: 'error.main' }}>
            Signing in with EMBER-DANDI did not work. Please try again.
          </Typography>
          <Button variant="outlined" onClick={() => navigate(emberAuth.takeReturnTo() ?? '/', { replace: true })}>
            Back
          </Button>
        </>
      ) : (
        <>
          <CircularProgress size={28} />
          <Typography variant="body2" sx={{ opacity: 0.7 }}>Signing in with EMBER-DANDI…</Typography>
        </>
      )}
    </Box>
  )
}
