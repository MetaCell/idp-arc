import { useEffect, useRef, useState } from 'react'
import { Button, Divider, InputAdornment, TextField, Typography } from '@mui/material'
import CheckIcon from '@mui/icons-material/Check'
import ContentCopyIcon from '@mui/icons-material/ContentCopyOutlined'

/** How long the button says "Copied" before going back to "Copy". */
const COPIED_FOR_MS = 2000

/** The run's DOI in a read-only field: labelled DOI on its left, with a Copy button on its right. */
export default function DoiField({ doi }: { doi: string }) {
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_FOR_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = () => {
    // Where the clipboard is refused, the DOI is selected instead, for the user to copy.
    const selectIt = () => inputRef.current?.select()
    if (!navigator.clipboard) return selectIt()
    navigator.clipboard.writeText(doi).then(() => setCopied(true), selectIt)
  }

  return (
    <TextField
        id="run-doi"
        value={doi}
        size="small"
        inputRef={inputRef}
        onFocus={(e) => e.target.select()}
        slotProps={{
          input: {
            readOnly: true,
            // Spacing: 8px before DOI, 12px after Copy (4px plus its own 8px), the 8px adornment margins
            // as the only gaps beside the dividers, and the box exactly as wide as the DOI (monospace).
            sx: { fontFamily: 'monospace', fontSize: 14, pl: 1, pr: 0.5, '& .MuiOutlinedInput-input': { px: 0, width: `${doi.length}ch` } },
            startAdornment: (
              <InputAdornment position="start" sx={{ gap: 1, alignSelf: 'stretch', height: 'auto', maxHeight: 'none', mr: 1 }}>
                <Typography component="label" htmlFor="run-doi" variant="body2" sx={{ opacity: 0.6 }}>
                  DOI
                </Typography>
                <Divider orientation="vertical" flexItem sx={{ my: 0.75 }} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end" sx={{ gap: 0, alignSelf: 'stretch', height: 'auto', maxHeight: 'none', ml: 1 }}>
                <Divider orientation="vertical" flexItem sx={{ my: 0.75 }} />
                <Button
                  size="small"
                  variant="text"
                  color={copied ? 'success' : 'inherit'}
                  startIcon={copied ? <CheckIcon /> : <ContentCopyIcon />}
                  onClick={copy}
                  aria-live="polite"
                  sx={ACTION_SX}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </InputAdornment>
            ),
          },
        }}
      />
  )
}

/** A plain text button inside the field (no border of its own); its label and icon only fade. */
const ACTION_SX = {
  whiteSpace: 'nowrap',
  minWidth: 0,
  px: 1,
  transition: 'color 150ms ease',
  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
} as const
