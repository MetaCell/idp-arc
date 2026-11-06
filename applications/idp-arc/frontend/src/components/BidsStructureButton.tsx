import { useState } from 'react'
import { Box, IconButton, Popover, Tooltip, Typography } from '@mui/material'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import { contentSize, type OutputFile } from '../core/bids/convert'
import { fileTree } from '../core/bids/fileTree'
import { formatBytes } from '../core/formatBytes'

/** Shows, in a popover, the folders and files the BIDS conversion of the picked file would produce. */
export default function BidsStructureButton({ files }: { files: OutputFile[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const sizes = new Map(files.map((f) => [f.path, contentSize(f.content)]))
  const lines = fileTree(files.map((f) => f.path))
  // A line's full path, to look its size up: the folders above it, then its name.
  const parents: string[] = []

  return (
    <>
      <Tooltip title="Show the structure for DANDI">
        <IconButton size="small" aria-label="Show the structure for DANDI" onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget) }}>
          <AccountTreeOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{
          paper: {
            sx: {
              // Opaque, so the dialog underneath doesn't show through.
              bgcolor: '#2A2A2A',
              backgroundImage: 'none',
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: 12,
              mt: 1,
            },
          },
        }}
      >
        <Box sx={{ p: 2, width: 'min(640px, 90vw)', maxHeight: '60vh', overflow: 'auto' }}>
          <Typography variant="body2" sx={{ mb: 1.5, pb: 1, opacity: 0.8, borderBottom: '1px solid', borderColor: 'divider' }}>
            What would go to DANDI, worked out in your browser. Nothing has been uploaded.
          </Typography>
          <Box component="pre" sx={{ m: 0, fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {lines.map((line, i) => {
              parents.length = line.depth
              const path = [...parents, line.name].join('')
              if (line.folder) parents.push(line.name)
              const size = sizes.get(path)
              return (
                <Box key={i} component="span" sx={{ display: 'block', opacity: line.folder ? 0.75 : 1 }}>
                  {'  '.repeat(line.depth)}{line.name}
                  {size !== undefined && <Box component="span" sx={{ opacity: 0.5 }}>{`  ${formatBytes(size)}`}</Box>}
                </Box>
              )
            })}
          </Box>
        </Box>
      </Popover>
    </>
  )
}
