import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import PauseRoundedIcon from '@mui/icons-material/PauseRounded'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import {
  Box,
  Button,
  Container,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material'
import { useCallback, useRef, useState } from 'react'
import PageLayout from '../components/PageLayout'
import protocols from '../data/protocols.json'

const ArrowIcon = () => <ArrowForwardIcon sx={{ fontSize: '1rem !important' }} />


const references = [
  'Allen, M. et al. (2021). "Bandit task performance as a measure of reversal learning." Journal of Experimental Psychology, 150(2), 234–249.',
  'Chen, L. & Bhatt, D. (2020). "Behavioral flexibility and working memory in rodents." Neuroscience & Biobehavioral Reviews, 112, 567–582.',
  'Smith, J. et al. (2019). "Multi-arm bandit tasks for measuring cognitive flexibility." Nature Neuroscience, 22(8), 1234–1245.',
]

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
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(true)

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.play()
      setIsPlaying(true)
    } else {
      video.pause()
      setIsPlaying(false)
    }
  }, [])

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

            <Box sx={{ ...protocolCardSx, aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Box component="img" src={`/protocol1.png`} alt={active.name} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </Box>

            <Typography variant="body1" color='textPrimary'>
              {active.description}
            </Typography>

            <Stack sx={{ gap: 2 }}>
              <Typography variant="h3">Protocol video</Typography>
              <Box
                onClick={togglePlay}
                sx={{
                  ...protocolCardSx,
                  aspectRatio: '16/9',
                  padding: 0,
                  overflow: 'hidden',
                  position: 'relative',
                  cursor: 'pointer',
                  '&:hover .video-overlay': { opacity: 1 },
                }}
              >
                <Box
                  ref={videoRef}
                  component="video"
                  src="https://static.vecteezy.com/system/resources/previews/013/566/514/mp4/futuristic-3d-hologram-brain-made-of-glowing-connections-concept-of-artificial-intelligence-computer-intelligent-learning-links-circuits-and-network-data-unfocused-luminous-particles-spinning-video.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
                <Box
                  className="video-overlay"
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: isPlaying ? 0 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >
                  <IconButton
                    sx={{
                      border: '1px solid',
                      borderColor: 'var(--mui-palette-stroke-default)',
                      bgcolor: 'var(--mui-palette-white-200)',
                      width: 48,
                      height: 48,
                      '&:hover': { bgcolor: 'var(--mui-palette-white-300)' },
                    }}
                  >
                    {isPlaying
                      ? <PauseRoundedIcon sx={{ color: 'text.primary', fontSize: '1.5rem' }} />
                      : <PlayArrowRoundedIcon sx={{ color: 'text.primary', fontSize: '1.5rem' }} />}
                  </IconButton>
                </Box>
              </Box>
            </Stack>

            <Stack sx={{ gap: 2, mb: 6 }}>
              <Typography variant="h3">References</Typography>
              <Stack component="ul" sx={{ gap: 1, pl: 3, m: 0 }}>
                {references.map((ref, i) => (
                  <Typography key={i} component="li" variant="body2" sx={{ color: 'text.secondary', lineHeight: '1.6rem' }}>
                    {ref}
                  </Typography>
                ))}
              </Stack>
            </Stack>

          </Stack>
        </Stack>
      </Container>
    </PageLayout >
  )
}

