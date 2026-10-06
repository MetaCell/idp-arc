import { Box, CircularProgress, Stack, Typography } from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutlineOutlined'

import type { RunStep, StepState } from '../core/types'

const STEP_ICON_SX = { fontSize: 20, flexShrink: 0, mt: '1px' }

function StepIcon({ state }: { state: StepState }) {
  switch (state) {
    case 'succeeded':
      return <CheckCircleOutlineIcon sx={{ ...STEP_ICON_SX, color: 'success.main' }} />
    case 'running':
      return <Box sx={{ width: 20, display: 'flex', justifyContent: 'center', flexShrink: 0, mt: '2px' }}><CircularProgress size={16} /></Box>
    case 'failed':
      return <ErrorOutlineIcon sx={{ ...STEP_ICON_SX, color: 'error.main' }} />
    case 'skipped':
      return <RemoveCircleOutlineIcon sx={{ ...STEP_ICON_SX, opacity: 0.45 }} />
    default:
      return <RadioButtonUncheckedIcon sx={{ ...STEP_ICON_SX, opacity: 0.3 }} />
  }
}

/** One line per stage of the run: workspace, storage, server, then the run's own stages and notebooks. */
export default function RunChecklist({ steps }: { steps: RunStep[] }) {
  return (
    <Stack component="ol" sx={{ listStyle: 'none', m: 0, p: 0, gap: 1.25, alignSelf: 'stretch', maxWidth: 720, mx: 'auto', width: '100%' }}>
      {steps.map((s) => (
        <Stack component="li" key={s.id} direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <StepIcon state={s.state} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ opacity: s.state === 'pending' ? 0.45 : 0.9 }}>
              {s.label}
            </Typography>
            {s.detail && (
              <Typography variant="caption" sx={{ display: 'block', opacity: 0.55, wordBreak: 'break-word' }}>
                {s.detail}
              </Typography>
            )}
          </Box>
        </Stack>
      ))}
    </Stack>
  )
}
