import { Button, Container, Stack, Typography } from '@mui/material'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import PageLayout from '../components/PageLayout'

/** 404: any URL the app has no page for. */
export default function NotFound() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <PageLayout title={t('notFound.title')}>
      <Container maxWidth="xl" sx={{ py: 8 }}>
        <Stack sx={{ gap: 3, alignItems: 'flex-start' }}>
          <Typography variant="h5">{t('notFound.heading')}</Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary' }}>{t('notFound.body')}</Typography>
          <Button variant="contained" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/')}>
            {t('notFound.home')}
          </Button>
        </Stack>
      </Container>
    </PageLayout>
  )
}
