import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import CloseIcon from '@mui/icons-material/Close'
import MenuIcon from '@mui/icons-material/Menu'
import {
  AppBar,
  Box,
  Button,
  Container,
  Drawer,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Toolbar,
  Typography,
  useScrollTrigger,
} from '@mui/material'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { authClient, emberAuth, MY_DANDISETS_URL, OSB_WORKSPACES_URL, UPLOAD_BACKEND } from '../app/container'
import { useAppContext } from '../AppContext'
import { Logo } from '../Icons'
import DataUploadDialog from './DataUploadDialog'
import { registerUploadOpener } from './UploadContext'
import LoginDialog from './LoginDialog'
import { OSB_LOGIN_POPUP_NAME, OsbUnreachable, takeLoginDialogReturn } from './loginReturn'
import { clearAllRuns, loadRun } from './runStorage'
import type { RunStep } from '../core/types'
import { SIGN_IN_AGAIN } from '../core/userMessages'

const ArrowIcon = () => <ArrowForwardIcon sx={{ fontSize: '1rem !important' }} />

export interface PageLayoutProps {
  children: ReactNode
  title: ReactNode
  image?: string
  height?: number
  cta?: ReactNode
  showDivider?: boolean
}

/** Read once per page load: a login started in the Login dialog left or reloaded the page. */
let pendingLoginReturn = takeLoginDialogReturn()
/** Once per page load: a run saved before the reload reopens the upload dialog. */
let savedRunOffered = false

export default function PageLayout({
  children,
  title,
  image,
  height = 477,
  cta,
}: PageLayoutProps) {
  const { t } = useTranslation('landingPage')
  const scrolled = useScrollTrigger({ disableHysteresis: true, threshold: 50 })
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [avatarAnchor, setAvatarAnchor] = useState<HTMLElement | null>(null)
  const avatarMenuOpen = Boolean(avatarAnchor)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  /** The protocol the upload dialog opens on (e.g. from a protocol's page). */
  const [uploadProtocol, setUploadProtocol] = useState<string | undefined>()
  // Back from a login started in the Login dialog (EMBER's redirect, or the reload after OSB's
  // popup): it opens again, showing what is left, until it is closed.
  const [loginDialogOpen, setLoginDialogOpen] = useState(() => pendingLoginReturn)
  const closeLoginDialog = () => {
    pendingLoginReturn = false
    setLoginDialogOpen(false)
  }

  /**
   * Opens OSB's (Keycloak) login in a popup. When it completes, the popup posts to this window and
   * App.tsx reloads the page; `onEnded` is for the popup being closed without that. Returns how to
   * stop waiting, or null when it fell back to a full-page redirect. Throws OsbUnreachable when
   * Keycloak doesn't answer.
   */
  async function startOsbLogin(onEnded: () => void): Promise<{ cancel: () => void } | null> {
    // Opened blank before any wait, while the click still counts (popup blockers), then pointed at Keycloak.
    const w = 480, h = 600
    const left = Math.round((screen.width - w) / 2)
    const top = Math.round((screen.height - h) / 2)
    const popup = window.open('', OSB_LOGIN_POPUP_NAME, `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`)
    if (!(await authClient.isReachable())) {
      popup?.close()
      throw new OsbUnreachable()
    }
    if (!popup) {
      authClient.login()
      return null
    }
    try {
      popup.location.href = await authClient.getLoginUrl(`${window.location.origin}/`)
    } catch {
      // keycloak-js 26 + PKCE can throw if internal state is unset (e.g. after
      // token expiry). Fall back to a full-page redirect via kc.login().
      popup.close()
      authClient.login()
      return null
    }
    const poll = setInterval(() => {
      if (popup.closed) {
        clearInterval(poll)
        // Closed without completing (completing reloads the page first): no dialog to reopen.
        takeLoginDialogReturn()
        onEnded()
      }
    }, 500)
    return { cancel: () => { clearInterval(poll); popup.close(); takeLoginDialogReturn(); onEnded() } }
  }

  const navigate = useNavigate()
  const location = useLocation()
  const { authState } = useAppContext()
  const isAuthenticated = authState === 'authenticated'
  // Signed in to OSB only while there is a token: the session can end (or the auth client be
  // replaced, as a dev hot reload does) without authState hearing of it.
  const osbSignedIn = isAuthenticated && authClient.tokenParsed !== null
  // Uploading needs both logins: EMBER-DANDI (where the data goes) and OSB (where it is analysed).
  // When uploads go to the bucket instead (UPLOAD_BACKEND), OSB's alone.
  // EMBER's popup sign-in doesn't reload the page, so it updates this state.
  const needsEmber = UPLOAD_BACKEND === 'ember'
  const [emberSignedIn, setEmberSignedIn] = useState(() => emberAuth.isConnected())
  const loginsDone = osbSignedIn && (!needsEmber || (emberSignedIn && emberAuth.isConnected()))
  /**
   * Whether each login still holds, checked now rather than as of the page load: an EMBER token
   * expires, and an OSB session can end without the page knowing until a token is asked for (the
   * auth client then reports it, and the app shows OSB as signed out).
   */
  const checkLogins = async () => {
    const ember = emberAuth.isConnected()
    setEmberSignedIn(ember)
    const osb = osbSignedIn && await authClient.getToken().then(() => true, () => false)
    return (!needsEmber || ember) && osb
  }
  const openLoginDialog = () => {
    void checkLogins()
    setLoginDialogOpen(true)
  }
  /** Every "Data upload" button: the upload dialog when the logins it needs hold, else the Login dialog. */
  const openUploadOrLogin = async (protocolName?: string) => {
    if (!(await checkLogins())) return setLoginDialogOpen(true)
    setUploadProtocol(protocolName)
    setUploadDialogOpen(true)
  }
  /** Logs out of both: IDP forgets its EMBER token (EMBER has no logout call), then OSB's
   *  Keycloak session ends, which reloads the page. */
  const logout = () => {
    clearAllRuns()
    emberAuth.disconnect()
    setEmberSignedIn(false)
    if (isAuthenticated) authClient.logout()
  }
  const anySignedIn = isAuthenticated || (needsEmber && emberSignedIn)

  // Re-registered on every render, so buttons outside this component never call a stale copy.
  useEffect(() => { registerUploadOpener(openUploadOrLogin) })

  // Back from a reload (an OSB re-login, a refresh) with a run under way: show it again.
  const user = osbSignedIn ? authClient.tokenParsed?.sub : undefined
  useEffect(() => {
    if (savedRunOffered || typeof user !== 'string' || loginDialogOpen) return
    savedRunOffered = true
    // Only a run cut off while it was going, or stopped for this sign-in; others wait for Data upload.
    const saved = loadRun<{ step?: string; runSteps?: RunStep[] }>(user)
    const stoppedForSignIn = saved?.step === 'failed' && !!saved.runSteps?.some((s) => s.detail?.toLowerCase().includes(SIGN_IN_AGAIN))
    if (saved?.step === 'uploading' || stoppedForSignIn) void openUploadOrLogin()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loginDialogOpen])

  const navItems = [
    { label: t('nav.protocols'), path: '/protocols' },
    { label: t('nav.about'), path: '/about' },
    ...(isAuthenticated ? [
      { label: t('nav.myWorkspaces'), path: OSB_WORKSPACES_URL, external: true },
      ...(needsEmber ? [{ label: t('nav.myDandisets'), path: MY_DANDISETS_URL, external: true }] : []),
    ] : []),
  ]

  const isActive = (path: string) => location.pathname === path

  const styles = {
    root: {
      bgcolor: 'var(--mui-palette-background-default)',
      minHeight: '100vh',
      position: 'relative',
    },
    gutterWrapper: {
      position: 'absolute',
      inset: 0,
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: 0,
    },
    gutterLine: (offset: string) => ({
      position: 'absolute',
      top: 0,
      left: `calc(50% + ${offset})`,
      width: '1px',
      height: '100%',
      bgcolor: 'divider',
      opacity: 0.4,
      pointerEvents: 'none',
      zIndex: 0,
    }),
    appBar: {
      zIndex: 10,
      transition: 'background 0.3s, border-color 0.3s',
      background: scrolled ? 'var(--mui-palette-background-default)' : 'transparent',
      borderBottom: scrolled ? '1px solid var(--mui-palette-white-200)' : 'none',
    },
    toolbar: { padding: '0 !important' },
    logoStack: { alignItems: 'center', gap: 0.5, cursor: 'pointer', flexShrink: 0 },
    logo: { width: 32, height: 32 },
    desktopNav: {
      alignItems: 'center',
      gap: 0.5,
      display: { xs: 'none', md: 'flex' },
      ml: 'auto',
    },
    navButton: (path: string) => ({
      bgcolor: isActive(path) ? 'var(--mui-palette-white-200)' : 'transparent',
      '&:hover': { bgcolor: 'var(--mui-palette-white-300)' },
    }),
    menuIconButton: {
      display: { xs: 'flex', md: 'none' },
      ml: 'auto',
      color: 'inherit',
    },
    drawerPaper: { width: 240, background: 'var(--mui-palette-background-default)', color: 'var(--mui-palette-text-primary)' },
    drawerStack: { p: 2 },
    drawerCloseButton: { alignSelf: 'flex-end', color: 'inherit' },
    drawerNavStack: { gap: 1, mt: 1 },
    drawerNavButton: { justifyContent: 'flex-start' },
    pageBanner: {
      position: 'relative',
      height: height,
      overflow: 'hidden',
      flexShrink: 0,
    },
    pageBannerOverlay: { position: 'absolute', inset: 0, pointerEvents: 'none' },
    pageBannerGradientH: {
      position: 'absolute',
      inset: 0,
      background:
        'linear-gradient(to right, rgba(97,62,56,0.4), rgba(57,43,34,0.4) 50%, rgba(29,35,24,0.4))',
    },
    pageBannerTexture: {
      position: 'absolute',
      inset: 0,
      backgroundImage: `url('/bgTexture.png')`,
      backgroundSize: '1024px 1024px',
      opacity: 0.05,
    },
    pageBannerImage: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      objectPosition: 'top center',
      opacity: 0.6,
    },
    pageBannerGradientV: {
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(to bottom, rgba(0,0,0,0) 10%, #1a1a1a 99%)',
    },
    pageBannerContainer: {
      position: 'relative',
      zIndex: 1,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      pt: image ? '185px' : '193px',
      gap: 4,
    },
    pageBannerTitle: { maxWidth: { xs: '100%', lg: '75%' } },
    content: { position: 'relative', zIndex: 1 },
    footer: {
      // marginTop: 58,
      position: 'relative',
      zIndex: 1,
      borderTop: '1px solid',
      borderColor: 'var(--mui-palette-white-200)',
    },
    footerStack: {
      justifyContent: 'space-between',
      alignItems: 'center',
      py: 6,
    },
    footerLinks: { gap: 1.5 },
    footerLink: { cursor: 'pointer', '&:hover': { color: 'var(--mui-palette-text-primary)' } },
    avatar: {
      width: '2rem',
      height: '2rem',
      borderRadius: '6.25rem',
      flexShrink: 0,
      marginLeft: 1,
      cursor: 'pointer',
      border: 'none',
      padding: 0,
      backdropFilter: 'blur(2px)',
      background:
        'linear-gradient(90deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.3) 100%), linear-gradient(131.69deg, #ffff00 2.94%, #ffa900 26.66%, #ff5300 50.37%, #802980 74.08%, #0000ff 97.79%)',
      '&:hover': { opacity: 0.85 },
    },
    avatarMenu: {
      background: 'var(--mui-palette-background-default)',
      border: '1px solid var(--mui-palette-white-200)',
      minWidth: 160,
    },
  }

  return (
    <Box sx={styles.root}>
      <Box aria-hidden sx={styles.gutterWrapper}>
        {['-860px', '860px'].map((offset) => (
          <Box
            key={offset}
            sx={styles.gutterLine(offset)}
          />
        ))}
      </Box>

      <AppBar
        position="fixed"
        elevation={0}
        sx={styles.appBar}
      >
        <Container maxWidth="xl">
          <Toolbar sx={styles.toolbar}>
            <Stack
              direction="row"
              sx={styles.logoStack}
              onClick={() => navigate('/')}
            >
              <Logo sx={styles.logo} />
              <Typography variant="subtitle1">{t('nav.logoTitle')}</Typography>
            </Stack>

            <Stack
              direction="row"
              sx={styles.desktopNav}
            >
              {navItems.map(({ label, path, external }) => (
                <Button
                  key={label}
                  variant="text"
                  onClick={() => external ? window.open(path, '_blank')?.focus() : navigate(path)}
                  sx={styles.navButton(path)}
                >
                  {label}
                </Button>
              ))}
              {
                !loginsDone && <Button variant="text" onClick={openLoginDialog}>{t('nav.login')}</Button>
              }
              <Button
                variant="contained"
                endIcon={<ArrowIcon />}
                onClick={() => openUploadOrLogin()}
              >
                {t('nav.dataUpload')}
              </Button>
              {anySignedIn && (
                <>
                  <Tooltip title={t('account.title')}>
                    <Box
                      component="button"
                      id="avatar-button"
                      aria-controls={avatarMenuOpen ? 'avatar-menu' : undefined}
                      aria-haspopup="true"
                      aria-expanded={avatarMenuOpen ? 'true' : undefined}
                      onClick={(e) => setAvatarAnchor(e.currentTarget)}
                      sx={styles.avatar}
                      aria-label={t('account.title')}
                    />
                  </Tooltip>
                  <Menu
                    id="avatar-menu"
                    anchorEl={avatarAnchor}
                    open={avatarMenuOpen}
                    onClose={() => setAvatarAnchor(null)}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                    slotProps={{ paper: { sx: styles.avatarMenu } }}
                  >
                    <MenuItem onClick={() => { setAvatarAnchor(null); logout() }}>
                      {t('nav.logout')}
                    </MenuItem>
                  </Menu>
                </>
              )}
            </Stack>

            <IconButton
              edge="end"
              onClick={() => setDrawerOpen(true)}
              sx={styles.menuIconButton}
            >
              <MenuIcon />
            </IconButton>
          </Toolbar>
        </Container>
      </AppBar>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        slotProps={{
          paper: { sx: styles.drawerPaper },
        }}
      >
        <Stack sx={styles.drawerStack}>
          <IconButton
            onClick={() => setDrawerOpen(false)}
            sx={styles.drawerCloseButton}
          >
            <CloseIcon />
          </IconButton>
          <Stack sx={styles.drawerNavStack}>
            {navItems.map(({ label, path, external }) => (
              <Button
                key={label}
                variant="text"
                fullWidth
                sx={styles.drawerNavButton}
                onClick={() => {
                  if (external) {
                    window.open(path, '_blank')?.focus()
                  } else {
                    navigate(path)
                  }
                  setDrawerOpen(false)
                }}
              >
                {label}
              </Button>
            ))}
            {!loginsDone && (
              <Button
                variant="text"
                fullWidth
                sx={styles.drawerNavButton}
                onClick={() => { setDrawerOpen(false); openLoginDialog() }}
              >
                {t('nav.login')}
              </Button>
            )}
            {anySignedIn && (
              <Button
                variant="text"
                fullWidth
                sx={styles.drawerNavButton}
                onClick={() => { setDrawerOpen(false); logout() }}
              >
                {t('nav.logout')}
              </Button>
            )}
            <Button
              variant="contained"
              endIcon={<ArrowIcon />}
              onClick={() => {
                setDrawerOpen(false)
                openUploadOrLogin()
              }}
            >
              {t('nav.dataUpload')}
            </Button>
          </Stack>
        </Stack>
      </Drawer>

      <Box sx={styles.pageBanner}>
        <Box aria-hidden sx={styles.pageBannerOverlay}>
          <Box sx={styles.pageBannerGradientH} />

          <Box sx={styles.pageBannerTexture} />

          {image && (
            <Box
              component="img"
              src={image}
              alt=""
              sx={styles.pageBannerImage}
            />
          )}

          <Box sx={styles.pageBannerGradientV} />
        </Box>

        <Container
          maxWidth="xl"
          sx={styles.pageBannerContainer}
        >
          {typeof title === 'string' ? (
            <Typography variant="h1" sx={styles.pageBannerTitle}>
              {title}
            </Typography>
          ) : (
            title
          )}
          {cta}
        </Container>
      </Box>

      <Box sx={styles.content}>{children}</Box>

      <Box
        component="footer"
        sx={styles.footer}
      >
        <Container maxWidth="xl">
          <Stack
            direction="row"
            sx={styles.footerStack}
          >
            <Typography variant="caption">
              {t('footer.copyright')}
            </Typography>
            <Stack direction="row" sx={styles.footerLinks}>
              {(
                [
                  { key: 'legal', label: t('footer.links.legal') },
                  { key: 'contact', label: t('footer.links.contact') },
                ] as const
              ).map(({ key, label }) => (
                <Typography
                  key={key}
                  variant="caption"
                  sx={styles.footerLink}
                >
                  {label}
                </Typography>
              ))}
            </Stack>
          </Stack>
        </Container>
      </Box>

      <DataUploadDialog
        open={uploadDialogOpen}
        initialProtocol={uploadProtocol}
        onClose={() => setUploadDialogOpen(false)}
        onAuthRequired={openLoginDialog}
      />
      <LoginDialog
        open={loginDialogOpen}
        onClose={closeLoginDialog}
        onOsbLogin={startOsbLogin}
        osbSignedIn={osbSignedIn}
        onEmberSignedIn={() => setEmberSignedIn(true)}
      />

    </Box>
  )
}
