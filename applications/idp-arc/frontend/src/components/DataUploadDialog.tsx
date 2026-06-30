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

import { createAndUpload, getWorkspaceUrl, loadWorkspaces } from '../app/container'
import { useAppContext } from '../AppContext'
import type { Workspace } from '../core/types'
import protocols from '../data/protocols.json'

type DialogStep = 'select' | 'upload' | 'uploading' | 'success'

export interface DataUploadDialogProps {
  open: boolean
  onClose: () => void
  onAuthRequired?: () => void
}

export default function DataUploadDialog({ open, onClose, onAuthRequired }: DataUploadDialogProps) {
  const { tokenParsed } = useAppContext()

  interface FormState {
    step: DialogStep
    behavioralTask: string
    protocol: string
    workspaceId: string | number
    file: File | null
    isDragging: boolean
    uploadMessage: string
    /** ID of the workspace spawned in the current dialog session; drives retry behaviour. */
    spawnedWorkspaceId: number | undefined
  }

  const INITIAL_FORM: FormState = {
    step: 'select',
    behavioralTask: '',
    protocol: '',
    workspaceId: '',
    file: null,
    isDragging: false,
    uploadMessage: '',
    spawnedWorkspaceId: undefined,
  }

  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const { step, behavioralTask, protocol, workspaceId, file, isDragging, uploadMessage, spawnedWorkspaceId } = form
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
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('sign in again')) {
          onAuthRequired?.()
        } else {
          console.error(err)
        }
      })
      .finally(() => setLoadingWorkspaces(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const dropped = e.dataTransfer.files[0]
    setForm((prev) => ({ ...prev, isDragging: false, file: dropped ?? prev.file }))
  }, [])

  const openWorkspaceTab = (wsId: number) => {
    window.open(getWorkspaceUrl(wsId), '_blank')
    window.focus()
  }

  const handleUpload = async () => {
    if (!file) return
    setForm((prev) => ({ ...prev, step: 'uploading', uploadMessage: '' }))
    abortRef.current = false

    // `spawnedWorkspaceId` is set after the first upload attempt this session.
    // On retry we reuse that workspace so the user can fix a stuck JupyterLab
    // without causing a new workspace to be spawned on every attempt.
    const isRetry = spawnedWorkspaceId !== undefined
    const selectedWorkspace = workspaces.find(w => String(w.id) === String(workspaceId))
    const newWorkspaceName = [behavioralTask, protocol].filter(Boolean).join(' — ') || 'New Workspace'
    const resolvedId = selectedWorkspace
      ? (typeof selectedWorkspace.id === 'string' ? parseInt(selectedWorkspace.id, 10) : selectedWorkspace.id)
      : undefined

    // On retry reuse the previously spawned workspace; otherwise use the selected one.
    const uploadWorkspaceId = isRetry ? spawnedWorkspaceId : resolvedId

    // Open the workspace tab only on the first attempt — on retry it is already open.
    if (!isRetry && uploadWorkspaceId !== undefined) {
      openWorkspaceTab(uploadWorkspaceId)
    }

    await createAndUpload(
      {
        workspaceName: selectedWorkspace?.name ?? newWorkspaceName,
        workspaceId: uploadWorkspaceId,
        file,
        userId: tokenParsed?.sub as string,
        // For new workspaces: track the id and open the tab the moment it is created.
        onWorkspaceCreated: uploadWorkspaceId === undefined
          ? (wsId: number) => {
              setForm(prev => ({ ...prev, spawnedWorkspaceId: wsId }))
              openWorkspaceTab(wsId)
            }
          : undefined,
      },
      (state) => {
        // Capture the workspace id as soon as it is known so subsequent retries
        // within this dialog session reuse the same workspace.
        if (state.workspaceId !== undefined) {
          setForm(prev => ({ ...prev, spawnedWorkspaceId: state.workspaceId }))
        }
        if (state.phase === 'error' && state.error?.includes('sign in again')) {
          setForm((prev) => ({ ...prev, step: 'upload', uploadMessage: '' }))
          onAuthRequired?.()
          return
        }
        setForm((prev) => ({
          ...prev,
          uploadMessage: state.phase === 'error' ? (state.error ?? state.message) : state.message,
          ...(state.phase === 'done' ? { step: 'success' } : {}),
          ...(state.phase === 'error' ? { step: 'upload' } : {}),
        }))
      },
      abortRef,
    )
  }

  const stepIndex = step === 'select' ? 0 : 1
  const canGoNext = !!behavioralTask && !!protocol
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
            Select a behavioral task and protocol. Optionally pick an existing workspace, or leave it empty to create a new one.
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
                    if (!v && v !== 0) return <span style={{ opacity: 0.4 }}>Leave empty to create a new workspace</span>
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
          <Stack sx={{ flex: 1, gap: 2 }}>
          {uploadMessage && (
            <Typography variant="body2" sx={{ color: 'error.main', px: 0.5 }}>
              {uploadMessage}
            </Typography>
          )}
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
            {spawnedWorkspaceId !== undefined ? 'Retry' : 'Upload'}
          </Button>
        </Box>
      )}
    </Dialog>
  )
}
