import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  Checkbox,
  Dialog,
  FormControlLabel,
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
import OpenInNewIcon from '@mui/icons-material/OpenInNewOutlined'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'

import { emberAuth, getWorkspaceUrl, listProtocolDandisets, runProtocol, UPLOAD_BACKEND, type ProtocolDandiset } from '../app/container'
import { EMBER_SIGN_IN } from '../core/userMessages'
import { useAppContext } from '../AppContext'
import type { RunStep } from '../core/types'
import RunChecklist from './RunChecklist'
import { inputFileProblem, inputFormatsFor } from '../core/inputFormats'
import { formatBytes } from '../core/formatBytes'
import { templatesZipFileName, templatesZipHref } from '../core/protocolTemplates'
import { SIGN_IN_AGAIN } from '../core/userMessages'
import protocols from '../data/protocols.json'

/** Only protocols with an analysis repository can be run, so only those are offered. */
const runnableProtocols = protocols.filter((p) => 'repoZipUrl' in p && p.repoZipUrl)

type DialogStep = 'select' | 'upload' | 'uploading' | 'success' | 'stillRunning' | 'failed'

export interface DataUploadDialogProps {
  open: boolean
  /** Protocol (name) to start on; ignored unless it can be run. */
  initialProtocol?: string
  onClose: () => void
  onAuthRequired?: () => void
}

export default function DataUploadDialog({ open, initialProtocol, onClose, onAuthRequired }: DataUploadDialogProps) {
  const { tokenParsed } = useAppContext()

  interface FormState {
    step: DialogStep
    protocol: string
    file: File | null
    isDragging: boolean
    uploadMessage: string
    /** ID of the workspace spawned in the current dialog session; drives retry behaviour. */
    spawnedWorkspaceId: number | undefined
    /** Where the last run's results are, relative to the workspace root. */
    outputsDir: string
    /** The run's checklist (upload, imports, run), as last reported by the use-case. */
    runSteps: RunStep[]
    /** EMBER-DANDI only: the researcher's dandiset to upload into; empty creates a new one. */
    dandisetId: string
    /** Also upload into the protocol's MAABCD dandiset; on by default. */
    shareWithMaabcd: boolean
  }

  const INITIAL_FORM: FormState = {
    step: 'select',
    protocol: '',
    file: null,
    isDragging: false,
    uploadMessage: '',
    spawnedWorkspaceId: undefined,
    outputsDir: '',
    runSteps: [],
    dandisetId: '',
    shareWithMaabcd: true,
  }

  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const { step, protocol, file, isDragging, uploadMessage, spawnedWorkspaceId, outputsDir, runSteps, dandisetId, shareWithMaabcd } = form
  // EMBER-DANDI: the upload goes to the researcher's own account. Choosing a protocol lists their
  // dandisets for it, each with the workspace it runs in, so choosing one chooses both.
  const usesEmber = UPLOAD_BACKEND === 'ember'
  const emberSignedIn = !usesEmber || emberAuth.isConnected()
  const [protocolDandisets, setProtocolDandisets] = useState<ProtocolDandiset[] | null>(null)
  const [dandisetsError, setDandisetsError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  // The run being watched; each run gets its own token, so stopping one never revives another.
  const watchRef = useRef<{ current: boolean } | null>(null)

  // The dialog can't be closed from clicking Upload until the notebooks have started in OSB:
  // before that, closing would abandon the upload or the imports half way (and the user would
  // have to start over). Once they run in OSB's task, closing only stops watching.
  const [closeLocked, setCloseLocked] = useState(false)
  useEffect(() => {
    if (step !== 'uploading') setCloseLocked(false) // finished, failed, or sent back to the form
  }, [step])

  // While a run is being set up, uploaded or watched, ask before the page is reloaded or closed:
  // the upload is driven by this tab and would be lost, and the progress view would lose track
  // of the run (which itself carries on in the workspace). Browsers show their own generic
  // "Leave site?" text. This can't stop sleep, a crash, or the browser discarding the tab.
  useEffect(() => {
    if (!open || step !== 'uploading') return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = '' // still needed by some browsers to show the prompt
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [open, step])

  useEffect(() => {
    if (!open) {
      // Stops watching only: the run itself carries on in the workspace.
      if (watchRef.current) watchRef.current.current = true
      return
    }
    setForm({ ...INITIAL_FORM, protocol: runnableProtocols.some((p) => p.name === initialProtocol) ? initialProtocol! : '' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // The chosen protocol's dandisets; the first is preselected, with its workspace.
  const protocolId = runnableProtocols.find((p) => p.name === protocol)?.id
  useEffect(() => {
    setProtocolDandisets(null)
    setDandisetsError('')
    if (!open || !usesEmber || !emberSignedIn || !protocolId) return
    let current = true
    listProtocolDandisets(protocolId)
      .then((list) => {
        if (!current) return
        setProtocolDandisets(list)
        setForm((prev) => ({ ...prev, dandisetId: list[0]?.id ?? '', spawnedWorkspaceId: list[0]?.workspaceId }))
      })
      .catch((err: unknown) => {
        console.error('Could not list the EMBER-DANDI dandisets', err)
        if (!current) return
        setProtocolDandisets([])
        setDandisetsError('Your dandisets could not be listed; a new one will be created.')
      })
    return () => { current = false }
  }, [open, usesEmber, emberSignedIn, protocolId])

  /** Messages in the dandiset section: the dialog's own 14px Inter, quieter than labels. */
  const noteText = { fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: '22px', color: '#FFFFFF99' }

  const chooseDandiset = (id: string) => setForm((prev) => ({
    ...prev, dandisetId: id, spawnedWorkspaceId: protocolDandisets?.find((d) => d.id === id)?.workspaceId,
  }))


  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const dropped = e.dataTransfer.files[0]
    setForm((prev) => ({ ...prev, isDragging: false, file: dropped ?? prev.file }))
  }, [])

  const openWorkspaceTab = (wsId: number) => {
    window.open(getWorkspaceUrl(wsId), '_blank')
    window.focus()
  }


  /** The selected protocol; its `repoZipUrl` in protocols.json is the analysis that runs. */
  const selectedProtocol = runnableProtocols.find((p) => p.name === protocol)
  const inputFormats = inputFormatsFor(selectedProtocol?.inputFormats)
  const templatesHref = templatesZipHref(selectedProtocol)
  const fileProblem = file ? inputFileProblem(file, selectedProtocol?.name ?? 'This protocol', selectedProtocol?.inputFormats) : null

  const handleUpload = async () => {
    if (!file || fileProblem || !selectedProtocol) return
    setCloseLocked(true)
    setForm((prev) => ({ ...prev, step: 'uploading', uploadMessage: '', outputsDir: '', runSteps: [] }))
    if (watchRef.current) watchRef.current.current = true
    const watch = { current: false }
    watchRef.current = watch

    await runProtocol(
      {
        protocol: selectedProtocol,
        file,
        // `spawnedWorkspaceId` is set as soon as the run has a workspace, so a retry reuses it
        // instead of creating another one.
        workspaceId: spawnedWorkspaceId,
        workspaceName: selectedProtocol.name,
        dandisetId: dandisetId || undefined,
        shareWithMaabcd,
      },
      (state) => {
        if (watch.current) return // the dialog was closed, or another run started: no longer this one's
        if (state.phase === 'running') setCloseLocked(false) // in OSB's task now: closing only stops watching
        if (state.phase === 'failed' && state.error?.toLowerCase().includes(SIGN_IN_AGAIN)) {
          setForm((prev) => ({
            ...prev, step: 'upload', uploadMessage: '', spawnedWorkspaceId: state.workspaceId ?? prev.spawnedWorkspaceId,
          }))
          onAuthRequired?.()
          return
        }
        if (state.phase === 'failed' && state.error === EMBER_SIGN_IN) {
          // The EMBER-DANDI session ended: back to the form, where the sign-in button is.
          // Back to the first step, which points to the Login dialog; the dandiset and workspace stay.
          setForm((prev) => ({
            ...prev, step: 'select', uploadMessage: EMBER_SIGN_IN,
            spawnedWorkspaceId: state.workspaceId ?? prev.spawnedWorkspaceId, dandisetId: state.dandisetId ?? prev.dandisetId,
          }))
          return
        }
        setForm((prev) => ({
          ...prev,
          spawnedWorkspaceId: state.workspaceId ?? prev.spawnedWorkspaceId,
          // A dandiset this run created is reused by a retry, not created again.
          dandisetId: state.dandisetId ?? prev.dandisetId,
          uploadMessage: state.phase === 'failed' ? `${state.message}: ${state.error}` : state.message,
          outputsDir: state.outputsDir ?? prev.outputsDir,
          runSteps: state.steps,
          ...(state.phase === 'succeeded' ? { step: 'success' } : {}),
          ...(state.phase === 'stillRunning' ? { step: 'stillRunning' } : {}),
          ...(state.phase === 'failed' ? { step: 'failed' } : {}),
        }))
      },
      watch,
    )
  }

  const stepIndex = step === 'select' ? 0 : 1
  const canGoNext = !!protocol && (!usesEmber || (emberSignedIn && protocolDandisets !== null))
  const canUpload = !!file && !fileProblem && emberSignedIn

  return (
    <Dialog
      open={open}
      onClose={closeLocked ? undefined : onClose}
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
          <IconButton
            onClick={onClose}
            disabled={closeLocked}
            title={closeLocked ? 'Wait until the analysis has started in the workspace' : undefined}
            size="small"
            sx={{ color: 'text.primary' }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      {/* ── Title & subtitle ───────────────────────────────────────────── */}
      {step === 'select' ? (
        <Box>
          <Typography sx={{ fontFamily: 'Adriane Text, serif', fontWeight: 400, fontSize: '24px', lineHeight: 1, color: '#FFFFFF' }}>
            Select behavioral task / protocol
          </Typography>
          <Typography sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: '22px', color: 'text.secondary', mt: 0.5 }}>
            Select a behavioral task / protocol.
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
                <Typography sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: '22px', color: '#FFFFFF', mb: 1 }}>Behavioral task / Protocol</Typography>
                <Select
                  fullWidth
                  value={protocol}
                  onChange={(e) => setForm((prev) => ({
                    ...prev,
                    protocol: e.target.value,
                    // A retry's workspace was set up for the old protocol: a new one gets its own.
                    spawnedWorkspaceId: e.target.value === prev.protocol ? prev.spawnedWorkspaceId : undefined,
                  }))}
                  displayEmpty
                  sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: '22px' }}
                  renderValue={(v) => v || <span style={{ color: '#FFFFFF99' }}>Select behavioral task / protocol..</span>}
                >
                  {runnableProtocols.map((p) => (
                    <MenuItem key={p.name} value={p.name} sx={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>{p.name}</MenuItem>
                  ))}
                </Select>
              </Box>
              {usesEmber && protocol && (
                <Box>
                  <Typography sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: '22px', color: '#FFFFFF', mb: 1 }}>Your EMBER-DANDI dandiset</Typography>
                  {uploadMessage === EMBER_SIGN_IN && (
                    <Typography sx={{ ...noteText, color: 'error.main', mb: 1 }}>{EMBER_SIGN_IN}</Typography>
                  )}
                  {!emberSignedIn ? (
                    <Stack direction="row" sx={{ alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                      <Typography sx={noteText}>
                        Your data is stored in your own EMBER-DANDI account. Log in to EMBER-DANDI to continue.
                      </Typography>
                      <Button variant="outlined" size="small" onClick={() => { onClose(); onAuthRequired?.() }}>Login</Button>
                    </Stack>
                  ) : protocolDandisets === null ? (
                    <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
                      <CircularProgress size={16} />
                      <Typography sx={noteText}>Finding your dandisets for this protocol…</Typography>
                    </Stack>
                  ) : protocolDandisets.length === 0 ? (
                    <Typography sx={noteText}>
                      {dandisetsError || 'No dandiset for this protocol yet. Your upload will create a new dandiset and workspace.'}
                    </Typography>
                  ) : (
                    <>
                      <Select
                        fullWidth
                        displayEmpty
                        value={dandisetId}
                        onChange={(e) => chooseDandiset(e.target.value)}
                        sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: '22px' }}
                      >
                        {protocolDandisets.map((d) => (
                          <MenuItem key={d.id} value={d.id} sx={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
                            {d.name} ({d.id}){d.workspaceId !== undefined ? ` · workspace ${d.workspaceId}` : ' · new workspace'}
                          </MenuItem>
                        ))}
                        <MenuItem value="" sx={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>Create a new dandiset and workspace</MenuItem>
                      </Select>
                      {dandisetsError && (
                        <Typography sx={{ ...noteText, mt: 1 }}>{dandisetsError}</Typography>
                      )}
                    </>
                  )}
                </Box>
              )}
              {usesEmber && selectedProtocol?.maabcdDandisetId && (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={shareWithMaabcd}
                      onChange={(e) => setForm((prev) => ({ ...prev, shareWithMaabcd: e.target.checked }))}
                    />
                  }
                  label={
                    <Typography sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: '22px', color: '#FFFFFF' }}>
                      Share a copy of this data with the MAABCD consortium
                    </Typography>
                  }
                />
              )}
            </Stack>

            <Stack sx={{ flex: 3, borderTop: '1px solid', borderColor: 'divider', pl: 4, pt: 2, gap: 1.5 }}>
              <Typography sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: '14px', lineHeight: 1, color: '#FFFFFF' }}>Protocol docs</Typography>
              <Typography sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: 1, color: '#FFFFFFCC' }}>
                Read how this protocol's analysis works and what it expects as input.
              </Typography>
              <Button
                variant="outlined"
                size="small"
                endIcon={<OpenInNewIcon />}
                sx={{ alignSelf: 'flex-start', mt: 1 }}
              >
                Open docs
              </Button>
            </Stack>
          </Stack>
        )}

        {/* Step 2 — file upload */}
        {step === 'upload' && (
          <Stack sx={{ flex: 1, gap: 2 }}>
          {uploadMessage && (
            <Typography variant="body2" sx={{ color: 'error.main', px: 0.5, whiteSpace: 'pre-wrap' }}>
              {uploadMessage}
            </Typography>
          )}
          {usesEmber && (
            <Typography variant="body2" sx={{ opacity: 0.7 }}>
              {dandisetId ? `Uploading into your dandiset ${dandisetId}` : 'Uploading into a new dandiset in your EMBER-DANDI account'}
              {spawnedWorkspaceId !== undefined ? `, analysed in workspace ${spawnedWorkspaceId}.` : ', analysed in a new workspace.'}
            </Typography>
          )}
          <Stack direction="row" sx={{ flex: 1, gap: 6 }}>
            <Box sx={{ flex: 7 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept={inputFormats?.join(',')}
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
                  <>
                    <Typography variant="body2" sx={{ opacity: 0.8 }}>
                      {file.name} ({formatBytes(file.size)})
                    </Typography>
                    {fileProblem && (
                      <Typography variant="body2" sx={{ color: 'error.main', textAlign: 'center', px: 4 }}>
                        {fileProblem}
                      </Typography>
                    )}
                  </>
                ) : (
                  <>
                    <CloudUploadOutlinedIcon sx={{ fontSize: 36, opacity: 0.35 }} />
                    <Typography variant="body2" sx={{ opacity: 0.4 }}>
                      Click here or drag file to upload{inputFormats ? ` (${inputFormats.join(', ')})` : ''}
                    </Typography>
                  </>
                )}
              </Box>
            </Box>

            <Stack sx={{ flex: 3, borderTop: '1px solid', borderColor: 'divider', pl: 4, pt: 2, gap: 1.5 }}>
              <Typography sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 500, fontSize: '14px', lineHeight: 1, color: '#FFFFFF' }}>Protocol template</Typography>
              <Typography sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: 1, color: '#FFFFFFCC' }}>
                Download an example input file for this protocol and fill in your data the same way.
              </Typography>
              <Button
                variant="outlined"
                size="small"
                endIcon={<KeyboardArrowDownIcon />}
                component="a"
                href={templatesHref ?? undefined}
                download={selectedProtocol ? templatesZipFileName(selectedProtocol) : undefined}
                disabled={!templatesHref}
                sx={{ alignSelf: 'flex-start', mt: 1 }}
              >
                Download
              </Button>
            </Stack>
          </Stack>
          </Stack>
        )}

        {/* Running, finished or failed: the same checklist, with a different header */}
        {(step === 'uploading' || step === 'success' || step === 'stillRunning' || step === 'failed') && (
          <Stack sx={{ flex: 1, gap: 3, minWidth: 0, overflowY: 'auto', py: 1 }}>
            <Stack sx={{ alignItems: 'center', gap: 1.5, textAlign: 'center' }}>
              {step === 'uploading' && <CircularProgress size={28} />}
              {step === 'success' && <CheckCircleOutlineIcon sx={{ fontSize: 40, color: 'success.main' }} />}
              {step === 'stillRunning' && <HourglassEmptyIcon sx={{ fontSize: 40, opacity: 0.7 }} />}
              {step === 'failed' && <ErrorOutlineIcon sx={{ fontSize: 40, color: 'error.main' }} />}
              <Typography
                variant="body1"
                sx={{ opacity: 0.9, whiteSpace: 'pre-wrap', color: step === 'failed' ? 'error.main' : undefined }}
              >
                {uploadMessage || (step === 'success' ? 'The analysis finished.' : 'Starting..')}
              </Typography>
              {(step === 'success' || step === 'stillRunning') && outputsDir && (
                <Typography variant="body2" sx={{ opacity: 0.6 }}>
                  {step === 'stillRunning' ? 'Results will be in' : 'Results are in'} <code>{outputsDir}/</code> in your workspace.
                </Typography>
              )}
              {step !== 'uploading' && spawnedWorkspaceId !== undefined && (
                <Button variant="outlined" onClick={() => openWorkspaceTab(spawnedWorkspaceId)}>
                  Open workspace
                </Button>
              )}
            </Stack>
            {runSteps.length > 0 && <RunChecklist steps={runSteps} />}
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
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
          <Button variant="outlined" onClick={() => setForm((prev) => ({ ...prev, step: 'select', uploadMessage: '' }))}>
            Back
          </Button>
          <Button
            variant="contained"
            endIcon={<ArrowForwardIcon />}
            disabled={!canUpload}
            onClick={handleUpload}
          >
            {spawnedWorkspaceId !== undefined ? 'Retry' : 'Upload and run'}
          </Button>
        </Box>
      )}
      {step === 'failed' && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
          <Button variant="outlined" onClick={() => setForm((prev) => ({ ...prev, step: 'upload', uploadMessage: '' }))}>
            Back
          </Button>
          <Button variant="contained" endIcon={<ArrowForwardIcon />} onClick={handleUpload}>
            Retry
          </Button>
        </Box>
      )}
    </Dialog>
  )
}
