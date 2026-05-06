import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material'
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlineOutlined'
import CloseIcon from '@mui/icons-material/Close'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'

import { createAndUpload, loadWorkspaces } from '../app/container'
import { useAppContext } from '../AppContext'
import type { Workspace } from '../core/types'
import protocols from '../data/protocols.json'

type DialogStep = 'select' | 'upload' | 'uploading' | 'success'

export interface DataUploadDialogProps {
  open: boolean
  onClose: () => void
}

export default function DataUploadDialog({ open, onClose }: DataUploadDialogProps) {
  const { tokenParsed } = useAppContext()

  interface FormState {
    step: DialogStep
    behavioralTask: string
    protocol: string
    workspaceId: string | number
    file: File | null
    isDragging: boolean
    uploadMessage: string
  }

  const INITIAL_FORM: FormState = {
    step: 'select',
    behavioralTask: '',
    protocol: '',
    workspaceId: '',
    file: null,
    isDragging: false,
    uploadMessage: '',
  }

  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const { step, behavioralTask, protocol, workspaceId, file, isDragging, uploadMessage } = form
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setForm(INITIAL_FORM)
    abortRef.current = false
    setLoadingWorkspaces(true)
    loadWorkspaces()
      .then(setWorkspaces)
      .catch(console.error)
      .finally(() => setLoadingWorkspaces(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const dropped = e.dataTransfer.files[0]
    setForm((prev) => ({ ...prev, isDragging: false, file: dropped ?? prev.file }))
  }, [])

  const handleUpload = async () => {
    if (!file) return
    setForm((prev) => ({ ...prev, step: 'uploading' }))
    abortRef.current = false

    const numericId = typeof workspaceId === 'string' ? parseInt(workspaceId, 10) : workspaceId
    const selectedWorkspace = workspaces.find(w => w.id === workspaceId)

    await createAndUpload(
      {
        workspaceName: selectedWorkspace?.name ?? 'New Workspace',
        workspaceId: !isNaN(numericId as number) ? (numericId as number) : undefined,
        file,
        userId: tokenParsed?.sub as string,
      },
      (state) => {
        setForm((prev) => ({
          ...prev,
          uploadMessage: state.message,
          ...(state.phase === 'done' ? { step: 'success' } : {}),
        }))
      },
      abortRef,
    )
  }

  const stepIndex = step === 'select' ? 0 : 1
  const canGoNext = !!behavioralTask && !!protocol && workspaceId !== ''
  const canUpload = !!file

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      slotProps={{
        paper: {
          sx: {
            bgcolor: '#1F1F1F',
            width: 1200,
            height: 800,
            display: 'flex',
            flexDirection: 'column',
            padding: '24px',
            gap: '16px',
            overflowY: 'auto',
          },
        },
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>

          <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }}>
            {[0, 1].map((i) => (
              <Box
                key={i}
                sx={{
                  width: i === 0 ? 56 : 40,
                  height: 2,
                  borderRadius: 1,
                  bgcolor: i === stepIndex ? 'text.primary' : 'rgba(255,255,255,0.2)',
                  transition: 'background-color 0.3s',
                }}
              />
            ))}
          </Stack>
        </Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {tokenParsed && (
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                flexShrink: 0,
                background:
                  'linear-gradient(90deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.3) 100%), linear-gradient(131.69deg, #ffff00 2.94%, #ffa900 26.66%, #ff5300 50.37%, #802980 74.08%, #0000ff 97.79%)',
              }}
            />
          )}
          <IconButton onClick={onClose} size="small" sx={{ color: 'text.primary' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      {/* ── Title & subtitle ───────────────────────────────────────────── */}
      {step === 'select' ? (
        <Box>
          <Typography sx={{ fontFamily: 'Adriane Text, serif', fontWeight: 400, fontSize: '24px', lineHeight: 1, color: '#FFFFFF' }}>
            Select behavioral task
          </Typography>
          <Typography sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: '22px', color: 'text.secondary', mt: 0.5 }}>
            Select a behavioral task, protocol and workspace
          </Typography>
        </Box>
      ) : (
        <Box>
          <Typography sx={{ fontFamily: 'Adriane Text, serif', fontWeight: 400, fontSize: '24px', lineHeight: 1, color: '#FFFFFF'  }}>
            Upload your data
          </Typography>
          {step === 'upload' && (
            <Typography sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: '22px', color: 'text.secondary', mt: 0.5 }}>
              Upload your data to contribute to multimodal neurophysiology research and visualize it on the Open Source Brain platform.
            </Typography>
          )}
        </Box>
      )}

      {/* ── Content ────────────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* Step 1 — select */}
        {step === 'select' && (
          <Stack direction="row" sx={{ flex: 1, gap: 6 }}>
            <Stack sx={{ flex: 7, gap: 4 }}>
              <Box>
                <Typography sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: '22px', color: '#FFFFFF', mb: 1 }}>Behavioral task</Typography>
                <Select
                  fullWidth
                  value={behavioralTask}
                  onChange={(e) => setForm((prev) => ({ ...prev, behavioralTask: e.target.value }))}
                  displayEmpty
                  sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: '22px' }}
                  renderValue={(v) => v || <span style={{ color: '#FFFFFF99' }}>Select behavioral task..</span>}
                >
                  {protocols.map((p) => (
                    <MenuItem key={p.name} value={p.name} sx={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>{p.name}</MenuItem>
                  ))}
                </Select>
              </Box>

              <Box>
                <Typography sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: '22px', color: '#FFFFFF', mb: 1 }}>Protocol</Typography>
                <Select
                  fullWidth
                  value={protocol}
                  onChange={(e) => setForm((prev) => ({ ...prev, protocol: e.target.value }))}
                  displayEmpty
                  sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: '22px' }}
                  renderValue={(v) => v || <span style={{ color: '#FFFFFF99' }}>Select protocol..</span>}
                >
                  {protocols.map((p) => (
                    <MenuItem key={p.name} value={p.name} sx={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>{p.name}</MenuItem>
                  ))}
                </Select>
              </Box>

              <Box>
                <Typography sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: '22px', color: '#FFFFFF', mb: 1 }}>Open Source Brain workspace</Typography>
                <Select
                  fullWidth
                  value={workspaceId}
                  onChange={(e) => setForm((prev) => ({ ...prev, workspaceId: e.target.value }))}
                  displayEmpty
                  sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: '22px' }}
                  renderValue={(v) => {
                    if (!v && v !== 0) return <span style={{ opacity: 0.4 }}>Select workspace to upload data to..</span>
                    return workspaces.find(w => w.id === v)?.name ?? String(v)
                  }}
                >
                  {loadingWorkspaces ? (
                    <MenuItem disabled sx={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
                      <CircularProgress size={14} sx={{ mr: 1 }} /> Loading…
                    </MenuItem>
                  ) : workspaces.map((ws) => (
                    <MenuItem key={ws.id} value={ws.id} sx={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>{ws.name}</MenuItem>
                  ))}
                </Select>
              </Box>
            </Stack>

            <Stack sx={{ flex: 3, borderTop: '1px solid', borderColor: 'divider', pl: 4, pt: 2, gap: 1.5 }}>
              <Typography sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: '14px', lineHeight: 1, color: '#FFFFFF' }}>Protocol docs</Typography>
              <Typography sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: 1, color: '#FFFFFFCC' }}>
                Download protocol docs based on your experiment type.
              </Typography>
              <Button
                variant="outlined"
                size="small"
                endIcon={<KeyboardArrowDownIcon />}
                disabled={!protocol}
                sx={{ alignSelf: 'flex-start', mt: 1 }}
              >
                Download
              </Button>
            </Stack>
          </Stack>
        )}

        {/* Step 2 — file upload */}
        {step === 'upload' && (
          <Stack direction="row" sx={{ flex: 1, gap: 6 }}>
            <Box sx={{ flex: 7 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                hidden
                onChange={(e) => setForm((prev) => ({ ...prev, file: e.target.files?.[0] ?? null }))}
              />
              <Box
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setForm((prev) => ({ ...prev, isDragging: true })) }}
                onDragLeave={() => setForm((prev) => ({ ...prev, isDragging: false }))}
                onDrop={handleDrop}
                sx={{
                  height: '100%',
                  border: '1px solid',
                  borderColor: isDragging ? 'primary.main' : 'divider',
                  borderRadius: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  bgcolor: isDragging ? 'action.hover' : 'transparent',
                  transition: 'border-color 0.2s, background-color 0.2s',
                  gap: 1,
                }}
              >
                {file ? (
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>
                    {file.name} ({(file.size / 1024).toFixed(1)} KB)
                  </Typography>
                ) : (
                  <>
                    <CloudUploadOutlinedIcon sx={{ fontSize: 36, opacity: 0.35 }} />
                    <Typography variant="body2" sx={{ opacity: 0.4 }}>
                      Click here or drag file to upload (.zip)
                    </Typography>
                  </>
                )}
              </Box>
            </Box>

            <Stack sx={{ flex: 3, borderTop: '1px solid', borderColor: 'divider', pl: 4, pt: 2, gap: 1.5 }}>
              <Typography sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: '14px', lineHeight: 1, color: '#FFFFFF' }}>Protocol template</Typography>
              <Typography sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: 1, color: '#FFFFFFCC' }}>
                Download protocol template based on your experiment type.
              </Typography>
              <Button
                variant="outlined"
                size="small"
                endIcon={<KeyboardArrowDownIcon />}
                sx={{ alignSelf: 'flex-start', mt: 1 }}
              >
                Download
              </Button>
            </Stack>
          </Stack>
        )}

        {/* Loading */}
        {step === 'uploading' && (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="body1" sx={{ opacity: 0.55 }}>
              {uploadMessage || 'Uploading your data..'}
            </Typography>
          </Box>
        )}

        {/* Success */}
        {step === 'success' && (
          <Stack sx={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CheckCircleOutlineIcon sx={{ fontSize: 44, opacity: 0.6 }} />
            <Typography variant="body1" sx={{ textAlign: 'center' }}>
              Your files has been successfully uploaded to Open Source Brain.
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.45 }}>
              You can close this dialog.
            </Typography>
          </Stack>
        )}
      </Box>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      {step === 'select' && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            endIcon={<ArrowForwardIcon />}
            disabled={!canGoNext}
            onClick={() => setForm((prev) => ({ ...prev, step: 'upload' }))}
          >
            Next
          </Button>
        </Box>
      )}
      {step === 'upload' && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            endIcon={<ArrowForwardIcon />}
            disabled={!canUpload}
            onClick={handleUpload}
          >
            Upload
          </Button>
        </Box>
      )}
    </Dialog>
  )
}
