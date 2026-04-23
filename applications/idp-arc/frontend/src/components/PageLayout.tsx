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
  Stack,
  Toolbar,
  Typography,
  useScrollTrigger,
} from '@mui/material'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../Icons'

const ArrowIcon = () => <ArrowForwardIcon sx={{ fontSize: '1rem !important' }} />

export interface PageLayoutProps {
  children: ReactNode
  title: ReactNode
  image?: string
  height?: number
  cta?: ReactNode
  showDivider?: boolean
}

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
  const navigate = useNavigate()
  const location = useLocation()

  const navItems = [
    { label: t('nav.protocols'), path: '/protocols' },
    { label: t('nav.about'), path: '/about' },
  ]

  const isActive = (path: string) => location.pathname === path

  const styles = {
    root: {
      bgcolor: 'var(--mui-palette-background-default)',
      minHeight: '100vh',
      position: 'relative',
      overflow: 'hidden',
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
      borderBottom: scrolled ? '1px solid var(--mui-palette-surface-medium)' : 'none',
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
      bgcolor: isActive(path) ? 'var(--mui-palette-surface-medium)' : 'transparent',
      '&:hover': { bgcolor: 'var(--mui-palette-surface-high)' },
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
    pageBannerTitle: { maxWidth: 524 },
    content: { position: 'relative', zIndex: 1 },
    footer: {
      marginTop: 58,
      position: 'relative',
      zIndex: 1,
      borderTop: '1px solid',
      borderColor: 'var(--mui-palette-surface-medium)',
    },
    footerStack: {
      justifyContent: 'space-between',
      alignItems: 'center',
      py: 6,
    },
    footerLinks: { gap: 1.5 },
    footerLink: { cursor: 'pointer', '&:hover': { color: 'var(--mui-palette-text-primary)' } },
  }

  return (
    <Box sx={styles.root}>
      {['-860px', '860px'].map((offset) => (
        <Box
          key={offset}
          aria-hidden
          sx={styles.gutterLine(offset)}
        />
      ))}

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
              {navItems.map(({ label, path }) => (
                <Button
                  key={label}
                  variant="text"
                  onClick={() => navigate(path)}
                  sx={styles.navButton(path)}
                >
                  {label}
                </Button>
              ))}
              <Button variant="text">{t('nav.login')}</Button>
              <Button
                variant="contained"
                endIcon={<ArrowIcon />}
                onClick={() => navigate('/workspaces')}
              >
                {t('nav.dataUpload')}
              </Button>
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
            {navItems.map(({ label, path }) => (
              <Button
                key={label}
                variant="text"
                fullWidth
                sx={styles.drawerNavButton}
                onClick={() => {
                  navigate(path)
                  setDrawerOpen(false)
                }}
              >
                {label}
              </Button>
            ))}
            <Button
              variant="text"
              fullWidth
              sx={styles.drawerNavButton}
              onClick={() => setDrawerOpen(false)}
            >
              {t('nav.login')}
            </Button>
            <Button
              variant="contained"
              endIcon={<ArrowIcon />}
              onClick={() => {
                navigate('/workspaces')
                setDrawerOpen(false)
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
                  { key: 'docs', label: t('footer.links.docs') },
                  { key: 'about', label: t('footer.links.about') },
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
    </Box>
  )
}
