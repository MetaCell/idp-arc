import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import {
  Box,
  Button,
  Container,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import PageLayout from '../components/PageLayout'

const ArrowIcon = () => <ArrowForwardIcon sx={{ fontSize: '1rem !important' }} />

export default function LandingPage() {
  const { t } = useTranslation('landingPage')
  const { t: tCommon } = useTranslation('common')

  const navigate = useNavigate()

  const features = t('features', { returnObjects: true }) as Array<{ title: string; desc: string; cta: string; ctaPath: string }>

  const protocols = t('protocols.items', { returnObjects: true }) as Array<{ name: string; desc: string }>

  const collaborators = tCommon('collaborators.items', { returnObjects: true }) as Array<{ alt: string; src: string }>

  const cta = (
    <Stack direction="row" sx={{ gap: 1 }}>
      <Button variant="outlined" onClick={() => navigate('/protocols')}>
        {t('banner.ctaProtocols')}
      </Button>
      <Button variant="contained" endIcon={<ArrowIcon />} onClick={() => navigate('/workspaces')}>
        {t('banner.ctaDataUpload')}
      </Button>
    </Stack>
  )

  return (
    <PageLayout
      title={t('banner.title')}
      image="/mainBG.png"
      height={700}
      cta={cta}
    >
      <Container maxWidth="xl">
        <Stack spacing={25}>
          <Stack direction={{ xs: 'column', md: 'row' }} sx={{ gap: { xs: 6, md: '100px' } }}>
            {features.map(({ title, desc, cta, ctaPath }) => (
              <Stack key={title} sx={{ flex: '1 0 0', gap: 4 }}>
                <Stack sx={{ flex: 1, gap: 2 }}>
                  <Box sx={{ borderLeft: '1px solid', borderColor: 'primary.main', pl: 3 }}>
                    <Typography variant="h4">{title}</Typography>
                  </Box>
                  <Box sx={{ pl: 3 }}>
                    <Typography variant="body1">{desc}</Typography>
                  </Box>
                </Stack>
                <Box sx={{ pl: 3 }}>
                  <Button variant="contained" endIcon={<ArrowIcon />} onClick={() => navigate(ctaPath)}>
                    {cta}
                  </Button>
                </Box>
              </Stack>
            ))}
          </Stack>
          <Stack spacing={4}>
            <Typography variant="h2">{t('protocols.sectionTitle')}</Typography>
            <List disablePadding>
              {protocols.map(({ name, desc }, index) => (
                <ListItem
                  key={name}
                  sx={{
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--mui-palette-white-200)',
                    transition: 'border-color 0.2s, padding 0.2s',
                    '&:hover': {
                      borderBottomColor: 'var(--mui-palette-stroke-hover)',
                      backgroundColor: 'transparent',
                      px: 6,
                      '& .download-btn': { opacity: 1 },
                    },
                  }}
                  onClick={() => navigate('/protocols')}
                >
                  <Typography variant="overline" sx={{ flexShrink: 0, minWidth: 32 }}>{String(index + 1).padStart(2, '0')}</Typography>
                  <ListItemText primary={name} secondary={desc} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }} />
                  <Button
                    className="download-btn"
                    variant="text"
                    startIcon={<FileDownloadIcon fontSize="small" />}
                    sx={{ opacity: 0, transition: 'opacity 0.2s', flexShrink: 0 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {t('protocols.downloadZip')}
                  </Button>
                </ListItem>
              ))}
            </List>
          </Stack>
          <Stack direction={{ xs: 'column', lg: 'row' }} sx={{ gap: { xs: 6, lg: '100px' }, alignItems: 'flex-start' }}>
            <Stack sx={{ flex: '1 0 0', gap: 3, maxWidth: { xs: '100%', lg: '50%' } }}>
              <Typography variant="h2" sx={{ letterSpacing: '0.04rem' }}>{t('about.sectionTitle')}</Typography>
              <Typography variant="body1">{t('about.body1')}</Typography>
              <Typography variant="body1">{t('about.body2')}</Typography>
              <Button variant="text" endIcon={<ArrowIcon />} sx={{ alignSelf: 'flex-start', px: 0 }} onClick={() => navigate('/about')}>
                {t('about.learnMore')}
              </Button>
            </Stack>
          </Stack>
          <Stack sx={{ gap: 3, maxWidth: { xs: '100%', lg: '60%' } }}>
            <Typography variant="h2" sx={{ letterSpacing: '0.04rem' }}>{tCommon('collaborators.sectionTitle')}</Typography>
            <Typography variant="body1">{tCommon('collaborators.body')}</Typography>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
              {collaborators.map(({ src, alt }) => (
                <Box key={alt} component="img" src={src} alt={alt} sx={{ width: '11.25rem', objectFit: 'contain', opacity: 0.7 }} />
              ))}
            </Stack>
          </Stack>
        </Stack>
      </Container>
    </PageLayout >
  )
}
