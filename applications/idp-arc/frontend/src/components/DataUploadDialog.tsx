import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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

import { emberAuth, getWorkspaceUrl, listProtocolDandisets, publishDandiset, recordedWorkspace, runProtocol, UPLOAD_BACKEND, type ProtocolDandiset } from '../app/container'
import { EMBER_SIGN_IN, UserFacingError, userMessage } from '../core/userMessages'
import { withRunLock } from './runStorage'
import { INITIAL_FORM, restoreSession, session } from './uploadSession'
import { useAppContext } from '../AppContext'
import { RUN_STEP, type RunCheckpoint, type RunState, type RunStep, type RunStepId } from '../core/types'
import RunChecklist from './RunChecklist'
import { useSessionStore } from './sessionStore'
import DoiField from './DoiField'
import { inputFileProblem, inputFormatsFor } from '../core/inputFormats'
import { isNonBlocking, PUBLISH_STEP, PUBLISHING_LABEL, type RunProtocolInput } from '../core/use-cases/runProtocol'
import { formatBytes } from '../core/formatBytes'
import { templatesZipFileName, templatesZipHref } from '../core/protocolTemplates'
import { SIGN_IN_AGAIN } from '../core/userMessages'
import protocols from '../data/protocols.json'

/** Only protocols with an analysis repository can be run, so only those are offered. */
const runnableProtocols = protocols.filter((p) => 'repoZipUrl' in p && p.repoZipUrl)
type RunnableProtocol = (typeof runnableProtocols)[number]

export interface DataUploadDialogProps {
  open: boolean
  /** Protocol (name) to start on; ignored unless it can be run. */
  initialProtocol?: string
  onClose: () => void
  onAuthRequired?: () => void
}

const setForm = session.set
/** The run being watched; each run gets its own token, so stopping one never revives another. */
let currentWatch: { current: boolean } | null = null
const RUN_IN_OTHER_TAB = 'This run is going on in another tab.'
/** The run's steps and checkpoint, with the rows a Retry of their own settled kept over what the
 *  run (still going, or saved) reports; a shared MAABCD copy is then done for the run too. */
function withRetriedRows(runSteps: RunStep[], checkpoint: RunCheckpoint | undefined, retriedRows: RunStep[] = []) {
  const shared = retriedRows.some((s) => s.id === RUN_STEP.maabcd && s.state === 'succeeded')
  return {
    runSteps: runSteps.map((s) => retriedRows.find((r) => r.id === s.id) ?? s),
    checkpoint: checkpoint && shared ? { ...checkpoint, maabcdShared: true } : checkpoint,
  }
}

/** How long a Retry shows that it is trying, even when it fails at once. */
const MIN_ATTEMPT_MS = 300

export default function DataUploadDialog({ open, initialProtocol, onClose, onAuthRequired }: DataUploadDialogProps) {
  const { tokenParsed } = useAppContext()
  const [form] = useSessionStore(session)
  const { step, protocol, file, isDragging, uploadMessage, spawnedWorkspaceId, outputsDir, runSteps, dandisetId, shareWithMaabcd, doi, publishing, publishError, checkpoint } = form
  // EMBER-DANDI: the upload goes to the researcher's own account. Choosing a protocol lists their
  // dandisets for it, each with the workspace it runs in, so choosing one chooses both.
  const usesEmber = UPLOAD_BACKEND === 'ember'
  const emberSignedIn = !usesEmber || emberAuth.isConnected()
  const [protocolDandisets, setProtocolDandisets] = useState<ProtocolDandiset[] | null>(null)
  const [dandisetsError, setDandisetsError] = useState('')
  // The selected dandiset's workspace is being read: Next waits for it.
  const [findingWorkspace, setFindingWorkspace] = useState(false)
  const workspaceLookup = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const user = typeof tokenParsed?.sub === 'string' ? tokenParsed.sub : null

  // Once the user is known, their run saved before a reload comes back.
  useEffect(() => { if (user) restoreSession(user) }, [user])

  // While a run is being set up, uploaded or watched, ask before the page is reloaded or closed,
  // with the dialog open or not: the upload is driven by this tab and would be lost, and the
  // progress view would lose track of the run (which itself carries on in the workspace). Browsers
  // show their own generic "Leave site?" text. This can't stop sleep, a crash, or a discarded tab.
  useEffect(() => {
    if (step !== 'uploading') return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = '' // still needed by some browsers to show the prompt
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [step])

  /** Leaves this run (it stays on OSB and EMBER) for a fresh form on the same protocol; nothing is kept for it. */
  const startNewUpload = () => setForm({ ...INITIAL_FORM, protocol })

  /** A fresh form, on the protocol the dialog was opened for. */
  const freshForm = () => setForm({
    ...INITIAL_FORM, protocol: runnableProtocols.some((p) => p.name === initialProtocol) ? initialProtocol! : '',
  })

  // Opening shows the current run: running, failed (for Retry), or finished and not yet seen
  // (it ended while the dialog was closed). Otherwise it starts a new upload. A run sent back to
  // the first step for the EMBER-DANDI sign-in keeps its checkpoint, so it counts as started.
  useEffect(() => {
    if (!open) return
    const current = session.get()
    const unstarted = (current.step === 'select' || current.step === 'upload') && !current.checkpoint
    if ((unstarted || current.resultSeen) && current.publishing !== 'running') freshForm()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  // A finished run's result counts as seen once it is on screen.
  const finished = step === 'success' || step === 'stillRunning'
  // Publishing joins the run's checklist once the researcher starts it.
  const publishStep: RunStep | null =
    publishing === 'running' ? { ...PUBLISH_STEP, label: PUBLISHING_LABEL, state: 'running' }
      : publishing === 'failed' ? { ...PUBLISH_STEP, state: 'failed', detail: publishError ?? userMessage(undefined, RUN_STEP.doi) }
        : doi ? { ...PUBLISH_STEP, state: 'succeeded' }
          : null
  const checklist = publishStep ? [...runSteps, publishStep] : runSteps
  // Once the run has ended, so its reports can't overwrite what the Retry shows.
  useEffect(() => {
    if (open && finished) setForm((prev) => (prev.resultSeen ? prev : { ...prev, resultSeen: true }))
  }, [open, finished])

  // The chosen protocol's dandisets; the first is preselected, with its workspace.
  const protocolId = runnableProtocols.find((p) => p.name === protocol)?.id

  /** Selects a dandiset and reads its recorded workspace (this one only); none: a new one is made. */
  const selectDandiset = (id: string) => {
    setForm((prev) => ({ ...prev, dandisetId: id, spawnedWorkspaceId: undefined }))
    const lookup = ++workspaceLookup.current
    if (!id || !protocolId) return setFindingWorkspace(false)
    setFindingWorkspace(true)
    recordedWorkspace(id, protocolId)
      .then((workspaceId) => setForm((prev) => (prev.dandisetId === id ? { ...prev, spawnedWorkspaceId: workspaceId } : prev)))
      .catch((err: unknown) => console.warn(`Could not read dandiset ${id}'s workspace; the run will make a new one`, err))
      .finally(() => { if (workspaceLookup.current === lookup) setFindingWorkspace(false) })
  }

  useEffect(() => {
    setProtocolDandisets(null)
    setDandisetsError('')
    if (!open || !usesEmber || !emberSignedIn || !protocolId) return
    let current = true
    listProtocolDandisets(protocolId)
      .then((list) => {
        if (!current) return
        setProtocolDandisets(list)
        // Only while choosing: reopening on a run (also one back here for the EMBER-DANDI sign-in)
        // must not change its dandiset or workspace.
        const prev = session.get()
        if (prev.step === 'select' && prev.checkpoint?.protocolId !== protocolId) selectDandiset(list[0]?.id ?? '')
      })
      .catch((err: unknown) => {
        console.error('Could not list the EMBER-DANDI dandisets', err)
        if (!current) return
        setProtocolDandisets([])
        setDandisetsError('Your dandisets could not be listed; a new one will be created.')
      })
    return () => { current = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, usesEmber, emberSignedIn, protocolId])

  /** Messages in the dandiset section: the dialog's own 14px Inter, quieter than labels. */
  const noteText = { fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: '22px', color: '#FFFFFF99' }



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
    if (fileProblem || !selectedProtocol) return
    // Picked up after a reload: the file is needed again unless it was already uploaded.
    if (!file) {
      if (checkpoint?.stored) return runLocked(selectedProtocol, null)
      return setForm((prev) => ({ ...prev, step: 'upload', uploadMessage: '' }))
    }
    return runLocked(selectedProtocol, file)
  }

  /** Runs it, unless another tab is already running this user's run. */
  const runLocked = async (selectedProtocol: RunnableProtocol, file: File | null) => {
    const ran = await withRunLock(user ?? '', () => startRun(selectedProtocol, file))
    if (!ran) setForm((prev) => ({ ...prev, step: 'failed', uploadMessage: RUN_IN_OTHER_TAB }))
  }

  /** What every attempt is given: it carries on from `checkpoint` where that applies. */
  const inputFor = (selectedProtocol: RunnableProtocol, file: File | null): RunProtocolInput => ({
    protocol: selectedProtocol,
    file,
    // `spawnedWorkspaceId` is set as soon as the run has a workspace, so a retry reuses it
    // instead of creating another one.
    workspaceId: spawnedWorkspaceId,
    workspaceName: selectedProtocol.name,
    dandisetId: dandisetId || undefined,
    shareWithMaabcd,
    resume: checkpoint,
  })

  const startRun = async (selectedProtocol: RunnableProtocol, file: File | null) => {
    setForm((prev) => ({ ...prev, step: 'uploading', uploadMessage: '', outputsDir: '', runSteps: [], doi: undefined, publishing: undefined, retriedRows: [] }))
    if (currentWatch) currentWatch.current = true
    const watch = { current: false }
    currentWatch = watch
    const started = Date.now()

    await runProtocol(
      inputFor(selectedProtocol, file),
      function report(state: RunState): void {
        if (watch.current) return // another run started: no longer this one's
        // A run that fails at once still shows, briefly, that it tried.
        const wait = state.phase === 'failed' ? MIN_ATTEMPT_MS - (Date.now() - started) : 0
        if (wait > 0) return void setTimeout(() => report(state), wait)
        // The OSB session ended: shown stopped like any failure; sign in, then Retry carries on.
        const signInNeeded = state.phase === 'failed' && !!state.error?.toLowerCase().includes(SIGN_IN_AGAIN)
        if (signInNeeded) onAuthRequired?.()
        if (state.phase === 'failed' && state.error === EMBER_SIGN_IN) {
          // The EMBER-DANDI session ended: back to the first step, which points to the Login
          // dialog. The checkpoint, dandiset and workspace stay, so the next attempt carries on.
          setForm((prev) => ({
            ...prev, step: 'select', uploadMessage: EMBER_SIGN_IN,
            spawnedWorkspaceId: state.workspaceId ?? prev.spawnedWorkspaceId, dandisetId: state.dandisetId ?? prev.dandisetId,
            checkpoint: state.checkpoint ?? prev.checkpoint,
          }))
          return
        }
        setForm((prev) => ({
          ...prev,
          spawnedWorkspaceId: state.workspaceId ?? prev.spawnedWorkspaceId,
          // A dandiset this run created is reused by a retry, not created again.
          dandisetId: state.dandisetId ?? prev.dandisetId,
          // A failed row already says why; otherwise the headline does, except for a needed sign-in.
          uploadMessage: state.phase === 'failed' && !signInNeeded && !state.steps.some((s) => s.state === 'failed') ? `${state.message}: ${state.error}` : state.message,
          outputsDir: state.outputsDir ?? prev.outputsDir,
          ...withRetriedRows(state.steps, state.checkpoint ?? prev.checkpoint, prev.retriedRows),
          ...(state.phase === 'succeeded' ? { step: 'success' } : {}),
          ...(state.phase === 'stillRunning' ? { step: 'stillRunning' } : {}),
          ...(state.phase === 'failed' ? { step: 'failed' } : {}),
        }))
      },
      watch,
    )
  }

  /** "Publish dandiset": the researcher's dandiset as a new, permanent version. Optional. */
  const publish = async () => {
    if (!dandisetId) return
    setForm((prev) => ({ ...prev, publishing: 'running', publishError: undefined }))
    try {
      const published = await publishDandiset(dandisetId)
      setForm((prev) => ({ ...prev, publishing: published ? undefined : 'failed', doi: published ?? prev.doi }))
    } catch (err) {
      console.error('Publishing the dandiset failed', err instanceof UserFacingError && err.details ? err.details : err)
      setForm((prev) => ({ ...prev, publishing: 'failed', publishError: userMessage(err, RUN_STEP.doi) }))
    }
  }

  /** A finished run's Retry: only its failed non-blocking steps run again, and only their rows change. */
  /** A failed non-blocking row's Retry, any time: only that step runs, on the checklist as shown. */
  const retryNonBlockingRow = async (id: RunStepId) => {
    if (!selectedProtocol) return
    const started = Date.now()
    await runProtocol(
      { ...inputFor(selectedProtocol, file), retryNonBlockingOf: runSteps },
      function report(state: RunState): void {
        // Its outcome waits until the row has shown, briefly, that it is trying.
        const wait = state.steps.some((s) => s.state === 'running') ? 0 : MIN_ATTEMPT_MS - (Date.now() - started)
        if (wait > 0) return void setTimeout(() => report(state), wait)
        const row = state.steps.find((s) => s.id === id)
        setForm((prev) => {
          const retriedRows = [...(prev.retriedRows ?? []).filter((s) => s.id !== id), ...(row ? [row] : [])]
          return { ...prev, retriedRows, ...withRetriedRows(prev.runSteps, prev.checkpoint, retriedRows) }
        })
      },
    )
  }

  // Each failed row has Retry: a non-blocking one any time; a blocking one once the run has stopped.
  const failedRows = runSteps.filter((s) => s.state === 'failed' && (isNonBlocking(s.id) || step === 'failed'))
  const footerRetry = step === 'failed' && !failedRows.some((s) => !isNonBlocking(s.id))
  const rowActions: Partial<Record<RunStepId, ReactNode>> = Object.fromEntries(failedRows.map((s) => [s.id,
    <Button size="small" variant="outlined" onClick={() => (isNonBlocking(s.id) ? retryNonBlockingRow(s.id) : handleUpload())}>Retry</Button>]))

  const stepIndex = step === 'select' ? 0 : 1
  const canGoNext = !!protocol && (!usesEmber || (emberSignedIn && protocolDandisets !== null && !findingWorkspace))
  const canUpload = !!file && !fileProblem && emberSignedIn

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
          <IconButton
            onClick={onClose}
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
                        onChange={(e) => selectDandiset(e.target.value)}
                        sx={{ fontFamily: 'Inter, sans-serif', fontWeight: 400, fontSize: '14px', lineHeight: '22px' }}
                      >
                        {protocolDandisets.map((d) => (
                          <MenuItem key={d.id} value={d.id} sx={{ fontFamily: 'Inter, sans-serif', fontSize: '14px' }}>
                            {d.name} ({d.id})
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
              {usesEmber && selectedProtocol?.maabcdAggregateDandisetId && (
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
              {spawnedWorkspaceId !== undefined ? `, analyzed in workspace ${spawnedWorkspaceId}.` : ', analyzed in a new workspace.'}
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
          // One scroll: its children keep their height instead of shrinking to fit.
          <Stack sx={{ flex: 1, gap: 3, minWidth: 0, overflowY: 'auto', py: 1, '& > *': { flexShrink: 0 } }}>
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
            {checklist.length > 0 && (
              <RunChecklist
                steps={checklist}
                actions={rowActions}
              />
            )}
            {/* Optional, after the run: publishing is the researcher's choice (they can also do it on EMBER). */}
            {finished && usesEmber && dandisetId && publishing !== 'running' && (
              <Box sx={{ display: 'flex', justifyContent: 'center', maxWidth: '100%', overflowX: 'auto', mt: 3 }}>
                {doi ? <DoiField doi={doi.doi} /> : (
                  <Button variant="outlined" onClick={publish}>
                    {publishing === 'failed' ? 'Try again' : 'Publish dandiset'}
                  </Button>
                )}
              </Box>
            )}
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
            {/* The same file carries on its stopped run (its checklist says "Done earlier"); another starts a new one. */}
            Upload and run
          </Button>
        </Box>
      )}
      {(step === 'failed' || finished) && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5 }}>
          {/* Back to change the file or options; what was chosen stays. */}
          {step === 'failed' && (
            <Button variant="outlined" onClick={() => setForm((prev) => ({ ...prev, step: 'upload', uploadMessage: '' }))}>
              Back
            </Button>
          )}
          <Button variant={footerRetry ? 'outlined' : 'contained'} endIcon={footerRetry ? undefined : <ArrowForwardIcon />} onClick={startNewUpload}>
            Start a new upload
          </Button>
          {/* For a failure no row shows: before any step, or a run cut off by a reload. */}
          {footerRetry && (
            <Button variant="contained" endIcon={<ArrowForwardIcon />} onClick={handleUpload}>
              Retry
            </Button>
          )}
        </Box>
      )}
    </Dialog>
  )
}
