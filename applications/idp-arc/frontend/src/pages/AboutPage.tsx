import { Box, Container, Stack, Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageLayout from '../components/PageLayout'

const styles = {
  section: (maxWidth = '50%') => ({
    gap: 3,
    scrollMarginTop: 80,
    maxWidth: { xs: '100%', lg: maxWidth },
  }),
  collaboratorsRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap' as const,
    gap: 4,
  },
  fixedNav: {
    display: { xs: 'none', lg: 'flex' },
    position: 'fixed' as const,
    top: '50%',
    right: { lg: 'max(2rem, calc((100vw - 1536px) / 2 + 2rem))' },
    transform: 'translateY(-50%)',
    zIndex: 10,
  },
  navItem: {
    alignItems: 'center',
    gap: 1,
    py: 0.75,
    cursor: 'pointer',
    textDecoration: 'none',
    '&:hover': {
      '& .MuiTypography-caption': { color: '#fff' },
      '.nav-underline': { width: 24 },
    },
  },
  navLabel: (isActive: boolean) => ({
    fontSize: '0.875rem',
    fontWeight: isActive ? 500 : 400,
    color: isActive ? 'var(--mui-palette-text-primary)' : 'var(--mui-palette-content-secondary)',
    transition: 'color 0.2s',
    whiteSpace: 'nowrap',
  }),
  navUnderline: (isActive: boolean) => ({
    width: isActive ? 24 : 12,
    height: '2px',
    bgcolor: isActive ? 'var(--mui-palette-primary-main)' : 'var(--mui-palette-stroke-default)',
    transition: 'width 0.2s, background-color 0.2s',
    flexShrink: 0,
  }),
}

interface SectionProps {
  id: string
  registerRef: (id: string) => (el: HTMLElement | null) => void
  children: React.ReactNode
  maxWidth?: string
}

function Section({ id, registerRef, children, maxWidth }: SectionProps) {
  return (
    <Stack id={id} ref={registerRef(id)} sx={styles.section(maxWidth)}>
      {children}
    </Stack>
  )
}

export default function AboutPage() {
  const { t } = useTranslation('about')
  const { t: tCommon } = useTranslation('common')
  const sections = t('sections', { returnObjects: true }) as Array<{ id: string; label: string }>
  const objectives = t('objectives.items', { returnObjects: true }) as string[]
  const collaborators = tCommon('collaborators.items', { returnObjects: true }) as Array<{ alt: string; src: string }>

  const [activeSection, setActiveSection] = useState('overview')
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveSection(entry.target.id)
        }
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 },
    )
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const registerRef = (id: string) => (el: HTMLElement | null) => {
    sectionRefs.current[id] = el
  }

  return (
    <PageLayout title={t('pageTitle')}>
      <Container maxWidth="xl" sx={{ py: 8 }}>
        <Stack spacing={18} sx={{ flex: '1 0 0', minWidth: 0 }}>
          <Section id="overview" registerRef={registerRef}>
            <Typography variant="h2">{t('overview.title')}</Typography>
            <Typography variant="body1">{t('overview.body1')}</Typography>
            <Typography variant="body1">{t('overview.body2')}</Typography>
          </Section>
          <Section id="objectives" registerRef={registerRef}>
            <Typography variant="h2">{t('objectives.title')}</Typography>
            <Stack sx={{ gap: 1.5 }}>
              {objectives.map((text, i) => (
                <Stack key={i} direction="row" sx={{ gap: 1.5, alignItems: 'flex-start' }}>
                  <Typography variant="body1" color="text.secondary" sx={{ flexShrink: 0, lineHeight: '1.6rem' }}>
                    {String(i + 1).padStart(2, '0')}
                  </Typography>
                  <Typography variant="body1" sx={{ color: 'text.primary' }}>{text}</Typography>
                </Stack>
              ))}
            </Stack>
            <Typography variant="body1">{t('objectives.conclusion')}</Typography>
          </Section>

          <Section id="phenotypes" registerRef={registerRef}>
            <Typography variant="h2">{t('phenotypes.title')}</Typography>
            <Stack sx={{ gap: 3 }}>
              <Typography variant="h4">{t('phenotypes.subTitle')}</Typography>
              <Typography variant="body1">{t('phenotypes.body1')}</Typography>
              <Typography variant="body1">
                {t('phenotypes.body2_before')}
                <Box component="span" sx={{ color: 'text.primary', fontWeight: 500 }}>{t('phenotypes.body2_highlight')}</Box>
                {t('phenotypes.body2_after')}
              </Typography>
            </Stack>
            <Stack direction="row" spacing={4}>
              <Box
                component="img"
                src="/beforeCorrection.png"
                alt="Before Correction"
                sx={{ width: '19rem' }}
              />
              <Box
                component="img"
                src="/afterCorrection.png"
                alt="After Correction"
                sx={{ width: '19rem' }}
              />
            </Stack>
            <Typography variant="body2">
              <Box component="span" sx={{ color: 'text.secondary' }}>{t('phenotypes.figureCaption_label')}</Box>
              <Box component="span" sx={{ color: 'text.primary' }}>{t('phenotypes.figureCaption_title')}</Box>
              <Box component="span" sx={{ color: 'text.secondary' }}>{t('phenotypes.figureCaption_body')}</Box>
            </Typography>
          </Section>

          <Section id="quantifying" registerRef={registerRef}>
            <Typography variant="h2">{t('quantifying.title')}</Typography>
            <Stack sx={{ gap: 3 }}>
              <Typography variant="h4">{t('quantifying.subTitle')}</Typography>
              <Typography variant="body1">
                {t('quantifying.body1_before')}
                <Box component="span" sx={{ color: 'text.primary' }}>{t('quantifying.body1_highlight')}</Box>
                {t('quantifying.body1_after')}
              </Typography>
              <Typography variant="body1">{t('quantifying.body2')}</Typography>
            </Stack>
          </Section>

          <Section id="resilience" registerRef={registerRef}>
            <Typography variant="h2">{t('resilience.title')}</Typography>
            <Typography variant="body1">{t('resilience.body1')}</Typography>
            <Typography variant="body1">
              {t('resilience.body2_before')}
              <Box component="span" sx={{ color: 'text.primary' }}>{t('resilience.body2_highlight')}</Box>
              {t('resilience.body2_after')}
            </Typography>
            <Typography variant="body1">{t('resilience.body3')}</Typography>
          </Section>

          <Section id="standardization" registerRef={registerRef}>
            <Typography variant="h2">{t('standardization.title')}</Typography>
            <Typography variant="body1">{t('standardization.body1')}</Typography>
            <Typography variant="body1">
              {t('standardization.body2_before')}
              <Box component="span" sx={{ color: 'text.primary' }}>{t('standardization.body2_highlight')}</Box>
              {t('standardization.body2_after')}
            </Typography>
          </Section>

          <Section id="platform" registerRef={registerRef}>
            <Typography variant="h2">{t('platform.title')}</Typography>
            <Typography variant="body1">{t('platform.body1')}</Typography>
            <Typography variant="body1">{t('platform.body2')}</Typography>
          </Section>

          <Section id="collaborators" registerRef={registerRef} maxWidth="60%">
            <Typography variant="h2" sx={{ letterSpacing: '0.04rem' }}>{tCommon('collaborators.sectionTitle')}</Typography>
            <Typography variant="body1">{tCommon('collaborators.body')}</Typography>
            <Stack direction="row" sx={styles.collaboratorsRow}>
              {collaborators.map(({ src, alt }) => (
                <Box key={alt} component="img" src={src} alt={alt} sx={{ width: '11.25rem', objectFit: 'contain', opacity: 0.7 }} />
              ))}
            </Stack>
          </Section>

        </Stack>

        <Box sx={styles.fixedNav}>
          <Stack
            component="nav"
            sx={{
              alignItems: 'flex-end',
            }}
          >
            {sections.map(({ id, label }) => {
              const isActive = activeSection === id
              return (
                <Stack
                  key={id}
                  direction="row"
                  component="a"
                  href={`#${id}`}
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault()
                    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  sx={styles.navItem}
                >
                  <Typography
                    variant="caption"
                    sx={styles.navLabel(isActive)}
                  >
                    {label}
                  </Typography>
                  <Box sx={styles.navUnderline(isActive)} className="nav-underline" />
                </Stack>
              )
            })}
          </Stack>
        </Box>

      </Container>
    </PageLayout>
  )
}
