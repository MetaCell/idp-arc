import { Box, CircularProgress, Stack, Typography } from '@mui/material'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutlineOutlined'

import type { ReactNode } from 'react'
import type { RunStep, RunStepId, StepState } from '../core/types'
import { DONE_EARLIER } from '../core/userMessages'

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
export default function RunChecklist({ steps, actions = {} }: { steps: RunStep[]; actions?: Partial<Record<RunStepId, ReactNode>> }) {
  return (
    <Stack component="ol" sx={{ listStyle: 'none', m: 0, p: 0, gap: 1.25, alignSelf: 'stretch', maxWidth: 720, mx: 'auto', width: '100%' }}>
      {steps.map((s) => (
        <Stack component="li" key={s.id} direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
          <StepIcon state={s.state} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ opacity: s.state === 'pending' ? 0.45 : 0.9 }}>
              {s.label}
              {/* A skipped step's note stays on its line; others get one of their own. */}
              {s.detail === DONE_EARLIER && <Box component="span" sx={{ opacity: 0.55, fontSize: '0.75rem' }}> · {DONE_EARLIER}</Box>}
            </Typography>
            {s.detail && s.detail !== DONE_EARLIER && (
              <Typography variant="caption" sx={{ display: 'block', opacity: 0.55, wordBreak: 'break-word' }}>
                {s.detail}
              </Typography>
            )}
          </Box>
          {/* On the row's right: e.g. its own Retry. */}
          {actions[s.id] && <Box sx={{ flexShrink: 0 }}>{actions[s.id]}</Box>}
        </Stack>
      ))}
    </Stack>
  )
}
