import { useState } from 'react'
import { Box, Button, CircularProgress, Dialog, Divider, IconButton, Stack, Typography } from '@mui/material'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import CloseIcon from '@mui/icons-material/Close'
import { useTranslation } from 'react-i18next'

import { emberAuth, EmberPopupBlocked, EmberSignInCancelled } from '../app/container'
import { markLoginDialogReturn } from './loginReturn'

export interface LoginDialogProps {
  open: boolean
  onClose: () => void
  /** Opens OSB's (Keycloak) login popup; `onEnded` when it closes without completing (completing
   *  reloads the page). Resolves to how to stop waiting, or null after a full-page redirect. */
  onOsbLogin: (onEnded: () => void) => Promise<{ cancel: () => void } | null>
  osbSignedIn: boolean
  /** EMBER-DANDI's sign-in finished in its popup (the page didn't reload). */
  onEmberSignedIn: () => void
}

/**
 * The two logins IDP needs, each with its own flow: EMBER-DANDI, where the researcher's data is
 * uploaded (a full-page OAuth redirect), and Open Source Brain, where it is analysed (the Keycloak
 * popup). Both leave or reload the page, so the dialog reopens on return (loginReturn.ts). A row
 * that is signed in shows a check instead of its number, and "Logged in" instead of its button.
 */
export default function LoginDialog({ open, onClose, onOsbLogin, osbSignedIn, onEmberSignedIn }: LoginDialogProps) {
  const { t } = useTranslation('landingPage')
  // The EMBER-DANDI popup being waited for; cancelling only stops waiting (the popup can't be
  // reached from here, see emberOAuthClient.ts).
  const [emberWait, setEmberWait] = useState<{ cancel: () => void } | null>(null)
  const [emberError, setEmberError] = useState('')
  const [osbWait, setOsbWait] = useState<{ cancel: () => void } | null>(null)

  const loginToOsb = async () => {
    markLoginDialogReturn()
    setOsbWait(await onOsbLogin(() => setOsbWait(null)))
  }

  const loginToEmber = () => {
    setEmberError('')
    let attempt: ReturnType<typeof emberAuth.connectInPopup>
    try {
      attempt = emberAuth.connectInPopup()
    } catch (err) {
      if (!(err instanceof EmberPopupBlocked)) throw err
      // Popups blocked: the full-page redirect, back to this dialog afterwards.
      markLoginDialogReturn()
      void emberAuth.connect(window.location.pathname)
      return
    }
    setEmberWait(attempt)
    attempt.done.then(
      () => { setEmberWait(null); onEmberSignedIn() },
      (err: unknown) => {
        setEmberWait(null)
        if (err instanceof EmberSignInCancelled) return
        console.error('EMBER-DANDI sign-in failed', err)
        setEmberError(err instanceof Error ? err.message : String(err))
      },
    )
  }

  const rows = [
    {
      n: '01', title: t('loginDialog.emberTitle'), description: t('loginDialog.emberDescription'),
      signedIn: emberAuth.isConnected(),
      login: loginToEmber,
      waiting: emberWait,
      waitingText: t('loginDialog.emberWaiting'),
      error: emberError,
    },
    {
      n: '02', title: t('loginDialog.osbTitle'), description: t('loginDialog.osbDescription'),
      signedIn: osbSignedIn,
      login: () => void loginToOsb(),
      waiting: osbWait,
      waitingText: t('loginDialog.osbWaiting'),
      error: '',
    },
  ]

  const text = { fontFamily: 'Inter, sans-serif', fontSize: '12px', lineHeight: '16px' }
  const button = { ...text, textTransform: 'none', borderRadius: 0, px: 1.25, py: 0.5, minWidth: 0, flexShrink: 0, gap: 0.5 }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      slotProps={{
        paper: {
          sx: {
            bgcolor: '#1F1F1F',
            backgroundImage: 'none',
            width: 550,
            maxWidth: 'calc(100vw - 32px)',
            p: '24px',
            m: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0px 14px 30px 0px #0000001A, 0px 54px 54px 0px #00000017',
          },
        },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
        <Stack sx={{ gap: 0.5 }}>
          <Typography component="h2" sx={{ fontFamily: '"Adriane Text", serif', fontSize: '20px', lineHeight: '28px', color: '#FFFFFF' }}>
            {t('loginDialog.title')}
          </Typography>
          <Typography sx={{ ...text, color: '#FFFFFF99' }}>{t('loginDialog.subtitle')}</Typography>
        </Stack>
        <IconButton aria-label={t('loginDialog.close')} onClick={onClose} size="small" sx={{ m: -0.5, color: '#FFFFFF99' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ borderLeft: '1px solid #6B3F38', bgcolor: '#FFFFFF05', px: 1.25, py: 1.5 }}>
        <Typography sx={{ ...text, color: '#FFFFFF' }}>{t('loginDialog.notice')}</Typography>
      </Box>

      <Stack divider={<Divider flexItem sx={{ borderColor: '#FFFFFF14' }} />}>
        {rows.map((row) => (
          <Stack key={row.n} direction="row" sx={{ py: 2, gap: 2, alignItems: 'flex-start' }}>
            <Box sx={{ width: 20, display: 'flex', justifyContent: 'center', pt: '1px' }}>
              {row.signedIn
                ? <CheckCircleOutlineIcon sx={{ fontSize: 14, color: 'success.main' }} aria-label={t('loginDialog.signedIn')} />
                : <Typography sx={{ ...text, color: '#FFFFFFB3' }}>{row.n}</Typography>}
            </Box>
            <Stack sx={{ flex: 1, gap: 1, minWidth: 0 }}>
              <Typography sx={{ ...text, fontWeight: 500, color: '#FFFFFF' }}>{row.title}</Typography>
              <Typography sx={{ ...text, color: '#FFFFFFB3' }}>{row.description}</Typography>
              {row.waiting && (
                <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={12} />
                  <Typography sx={{ ...text, color: '#FFFFFFB3' }}>{row.waitingText}</Typography>
                </Stack>
              )}
              {row.error && <Typography sx={{ ...text, color: 'error.main' }}>{row.error}</Typography>}
            </Stack>
            {row.signedIn ? (
              <Typography sx={{ ...text, color: '#FFFFFFB3', py: 0.5, flexShrink: 0 }}>{t('loginDialog.loggedIn')}</Typography>
            ) : row.waiting ? (
              <Button variant="outlined" onClick={row.waiting.cancel} sx={button}>{t('loginDialog.cancel')}</Button>
            ) : (
              <Button
                variant="contained"
                onClick={row.login}
                endIcon={<ArrowForwardIcon sx={{ fontSize: '14px !important' }} />}
                sx={button}
              >
                {t('loginDialog.login')}
              </Button>
            )}
          </Stack>
        ))}
      </Stack>
    </Dialog>
  )
}
