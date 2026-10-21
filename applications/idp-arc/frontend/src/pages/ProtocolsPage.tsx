import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
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
import { useState } from 'react'
import PageLayout from '../components/PageLayout'
import protocols from '../data/protocols.json'
import { templatesZipFileName, templatesZipHref } from '../core/protocolTemplates'

// imageUrls entries starting with "assets/" point into src/assets and must go through Vite
// to get a hashed build URL; anything else is served as-is from public/.
const assetUrls = import.meta.glob('../assets/*.{png,jpg,jpeg,svg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const resolveImageUrl = (url: string) => (url.startsWith('assets/') ? assetUrls[`../${url}`] ?? url : url)

const ArrowIcon = () => <ArrowForwardIcon sx={{ fontSize: '1rem !important' }} />


// Shared card styles consistent with the rest of the design system
const protocolCardSx = {
  width: '100%',
  border: '1px solid',
  borderColor: 'var(--mui-palette-stroke-default)',
  borderRadius: '12px',
  background: `#1f1d1d`,
  overflow: 'hidden',
  padding: '3.125rem 6.25rem'
}

export default function ProtocolsPage() {
  const [activeProtocol, setActiveProtocol] = useState(0)
  const active = protocols[activeProtocol]
  const templatesHref = templatesZipHref(active)

  return (
    <PageLayout title="Protocols" height={477}>
      <Container maxWidth="xl" sx={{ gap: 0 }}>
        <Stack spacing={30} direction={{ xs: 'column', md: 'row' }} sx={{ alignItems: 'flex-start' }}>

          <Stack
            component="aside"
            sx={{
              width: { md: '30%' },
              flexShrink: 0,
              position: { md: 'sticky' },
              top: 64,
              alignSelf: 'flex-start',
              gap: 0,
              mb: 4
            }}
          >
            <List disablePadding>
              {protocols.map(({ name }, i) => {
                const isActive = i === activeProtocol
                return (
                  <ListItem
                    key={name}
                    onClick={() => setActiveProtocol(i)}
                    sx={{
                      maxHeight: '4rem',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--mui-palette-white-200)',
                      transition: 'border-color 0.2s, padding 0.2s',
                      borderLeft: isActive ? '1px solid var(--mui-palette-primary-main)' : '1px solid transparent',
                      '& .MuiTypography-root': {
                        color: isActive ? 'text.primary' : 'text.secondary',
                        fontWeight: isActive ? 500 : 400,
                      },
                      '&:hover': {
                        borderBottomColor: 'var(--mui-palette-stroke-hover)',
                        backgroundColor: 'transparent',
                        pl: 6,
                      },
                    }}
                  >
                    <Typography variant="overline" sx={{ flexShrink: 0, minWidth: 32 }}>{String(i + 1).padStart(2, '0')}</Typography>
                    <ListItemText primary={name} sx={{
                      display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
                    }} />
                  </ListItem>
                )
              })}
            </List>
            <Box sx={{ py: 4 }}>
              <Typography variant="caption">
                "Can't find what you're looking for?"
                <br />
                <Box
                  component="a"
                  href="mailto:arc@example.com"
                >
                  <Typography variant="caption" color="textPrimary"> Contact us</Typography>
                </Box>
              </Typography>

            </Box>

            <Stack
              sx={{
                gap: 3,
                pt: 3,
                borderTop: '1px solid',
                borderColor: 'var(--mui-palette-stroke-default)',
              }}
            >
              <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 400 }}>
                {active.name}
              </Typography>

              <Stack direction="row" sx={{ gap: 1 }}>
                <Button
                  variant="outlined"
                  component="a"
                  href={templatesHref ?? undefined}
                  download={templatesZipFileName(active)}
                  disabled={!templatesHref}
                >
                  Download
                </Button>
                <Button
                  variant="contained"
                  endIcon={<ArrowIcon />}
                >
                  Data upload
                </Button>
              </Stack>
            </Stack>
          </Stack>

          <Stack sx={{ flex: '1 0 0', gap: 6, minWidth: 0, pt: 6 }}>

            <Typography variant="h2" sx={{ fontFamily: '"Adriane Text", serif', fontSize: '2rem' }}>
              {active.name}
            </Typography>

            {active.imageUrls.map((url) => (
              <Box key={url} sx={{ ...protocolCardSx, aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Box component="img" src={resolveImageUrl(url)} alt={active.name} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </Box>
            ))}

            {active.description && (
              <Typography variant="body1" color='textPrimary'>
                {active.description}
              </Typography>
            )}

            {active.videoUrl && (
              <Stack sx={{ gap: 2 }}>
                <Typography variant="h3">Protocol video</Typography>
                <Box sx={{ ...protocolCardSx, aspectRatio: '16/9', padding: 0, overflow: 'hidden', bgcolor: 'common.black' }}>
                  {/* Tutorials are long and narrated: native controls for sound, seeking and fullscreen;
                      preload="metadata" avoids pulling the whole file on page load. key resets playback
                      when switching protocol. */}
                  <Box
                    key={active.videoUrl}
                    component="video"
                    src={active.videoUrl}
                    controls
                    preload="metadata"
                    playsInline
                    sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                  />
                </Box>
              </Stack>
            )}

            {active.references.length > 0 && (
              <Stack sx={{ gap: 2, mb: 6 }}>
                <Typography variant="h3">References</Typography>
                <Stack component="ul" sx={{ gap: 1, pl: 3, m: 0 }}>
                  {active.references.map((ref, i) => (
                    <Typography key={i} component="li" variant="body2" sx={{ color: 'text.secondary', lineHeight: '1.6rem' }}>
                      {ref}
                    </Typography>
                  ))}
                </Stack>
              </Stack>
            )}

          </Stack>
        </Stack>
      </Container>
    </PageLayout >
  )
}

