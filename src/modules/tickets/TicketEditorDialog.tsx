import { Component, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  alpha,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
  type Theme,
} from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import CameraAltRoundedIcon from '@mui/icons-material/CameraAltRounded'
import MicNoneRoundedIcon from '@mui/icons-material/MicNoneRounded'
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import TitleRoundedIcon from '@mui/icons-material/TitleRounded'
import NotesRoundedIcon from '@mui/icons-material/NotesRounded'
import { dialogPaperSx } from '../../theme/hud'
import {
  ASSIGNEES,
  LIFECYCLE_LABEL,
  NEXT_STATES,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_NEEDS_DARK_TEXT,
  TICKETING_SYSTEM,
  ticketContextLabel,
  isCompleted,
  snapshotFromProof,
  snapshotIsProof,
  type NewTicketInput,
  type PinView,
  type Ticket,
  type TicketPriority,
} from '../../data/tickets'
import type { CameraDevice } from '../../data/cameras'
import { formatDateTime } from '../../utils/format'
import { useTickets } from '../../state/TicketsContext'
import { useAuth } from '../../auth/AuthContext'
import { useIntegrations } from '../../state/IntegrationsContext'
import { useCapture } from './captureContext'
import TicketAssignment from './TicketAssignment'
import TicketActivity from './TicketActivity'
import ImprovementVerification from './ImprovementVerification'

export interface CreateDraft {
  camera: CameraDevice
  yaw: number
  pitch: number
  zoom: number
  /** What the camera was showing when the location was pinned. */
  view?: PinView
}

interface Props {
  open: boolean
  mode: 'create' | 'view' | 'edit'
  ticket?: Ticket | null
  draft?: CreateDraft | null
  initialTab?: 'details' | 'activity'
  onClose: () => void
  onCreate?: (input: NewTicketInput) => Promise<Ticket>
}

export default function TicketEditorDialog({ open, mode, ticket, draft, initialTab = 'details', onClose, onCreate }: Props) {
  const { currentUser } = useAuth()
  const me = currentUser?.displayName ?? 'Ava Sharma'
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))
  const canEdit = currentUser?.role !== 'Viewer' && mode !== 'view'
  const canChangeState = Boolean(ticket && (ticket.assignee === me || currentUser?.role !== 'Viewer'))
  const creating = mode === 'create' && Boolean(draft)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      fullScreen={isXs}
      maxWidth="sm"
      sx={{ zIndex: (t) => t.zIndex.modal + 4 }}
      slotProps={{ paper: { sx: dialogPaperSx } }}
    >
      <DialogGuard key={ticket?.id ?? (creating ? 'create' : 'empty')} onClose={onClose}>
        {creating && draft && onCreate ? (
          <CreateForm draft={draft} creator={me} onClose={onClose} onCreate={onCreate} />
        ) : ticket ? (
          <Existing
            key={`${ticket.id}:${initialTab}`}
            ticket={ticket}
            me={me}
            canEdit={canEdit}
            canChangeState={canChangeState}
            mode={mode === 'edit' ? 'edit' : 'view'}
            initialTab={initialTab}
            onClose={onClose}
          />
        ) : (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', py: 1.5 }}>
              <Typography variant="h6" sx={{ flex: 1 }}>
                Ticket
              </Typography>
              <IconButton size="small" onClick={onClose} aria-label="Close">
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            </DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary">
                This ticket is no longer available.
              </Typography>
            </DialogContent>
          </>
        )}
      </DialogGuard>
    </Dialog>
  )
}

class DialogGuard extends Component<{ children: ReactNode; onClose: () => void }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', py: 1.5 }}>
          <Typography variant="h6" sx={{ flex: 1 }}>
            Ticket
          </Typography>
          <IconButton size="small" onClick={this.props.onClose} aria-label="Close">
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            This ticket could not be opened. Close and try again.
          </Typography>
        </DialogContent>
      </>
    )
  }
}

function CreateForm({
  draft,
  creator,
  onClose,
  onCreate,
}: {
  draft: CreateDraft
  creator: string
  onClose: () => void
  onCreate: (input: NewTicketInput) => Promise<Ticket>
}) {
  const { defaultIntegration } = useIntegrations()
  const capture = useCapture()
  const [tab, setTab] = useState<'general' | 'additional' | 'activity'>('general')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [assignee, setAssignee] = useState(ASSIGNEES.includes(creator) ? creator : ASSIGNEES[0])
  const [touched, setTouched] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createError, setCreateError] = useState('')
  const snapshotPolicy = defaultIntegration.snapshotPolicy
  const [proof, setProof] = useState(snapshotPolicy !== 'disabled')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!title.trim()) return
    const captureProof = snapshotPolicy === 'always' ? true : snapshotPolicy === 'disabled' ? false : proof
    const snapshots = snapshotFromProof(captureProof)
    const { view } = draft
    const frame = view ? { yaw: view.yaw, pitch: view.pitch } : { yaw: draft.yaw, pitch: draft.pitch }
    const src = snapshots.captureCreation
      ? capture?.(draft.camera.id, frame, 'before', { fov: view?.fov, marks: [{ yaw: draft.yaw, pitch: draft.pitch }] })
      : null
    setIsSubmitting(true)
    setCreateError('')
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim() || 'Raised from Live View at the marked location.',
        type: 'intrusion',
        priority,
        zone: draft.camera.name.split(' — ')[1] ?? 'Perimeter',
        assignee,
        creator,
        platform: 'default',
        platformName: TICKETING_SYSTEM,
        snapshotConfig: snapshots,
        creationSnapshot: src
          ? { src, at: new Date().toISOString(), by: creator, yaw: frame.yaw, pitch: frame.pitch, cameraId: draft.camera.id, view }
          : undefined,
        cameraId: draft.camera.id,
        yaw: draft.yaw,
        pitch: draft.pitch,
        zoom: draft.zoom,
        pinView: view,
      })
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Ticket could not be saved to the cloud.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const fieldSx = {
    '& .MuiInputLabel-root': { fontSize: 12, fontWeight: 600 },
    '& .MuiInputBase-root': { borderRadius: 2, bgcolor: 'rgba(255,255,255,0.035)' },
    '& .MuiOutlinedInput-notchedOutline': { borderWidth: 1.5, borderColor: (t: Theme) => alpha(t.palette.text.primary, 0.34) },
    '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: (t: Theme) => alpha(t.palette.text.primary, 0.6) },
    '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main', borderWidth: 2 },
    '& .MuiOutlinedInput-root.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: 'error.main' },
  }
  const iconSx = { color: 'primary.main', fontSize: 19 }
  const sectionHeading = (icon: ReactNode, label: string) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.25 }}>
      {icon}
      <Typography sx={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</Typography>
    </Box>
  )
  const coordinates = `P ${draft.yaw.toFixed(1)}° · T ${draft.pitch.toFixed(1)}° · Z ${draft.zoom.toFixed(1)}×`

  return (
    <Box component="form" onSubmit={submit}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1.75, px: 2.25 }}>
        <Box sx={{ width: 44, height: 44, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 2.5, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
          <ConfirmationNumberRoundedIcon sx={{ fontSize: 26 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>Create Ticket</Typography>
          <Typography variant="caption" color="text.secondary">Create and route an issue from the current view</Typography>
        </Box>
        <Chip icon={<CameraAltRoundedIcon />} label={draft.camera.name} size="small" sx={{ maxWidth: '48%', '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }} />
        <IconButton size="small" onClick={onClose} aria-label="Close"><CloseRoundedIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 2, borderBottom: 1, borderColor: 'divider', minHeight: 42, '& .MuiTab-root': { minHeight: 42, textTransform: 'uppercase', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em' } }}>
        <Tab value="general" label={<Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6 }}><TitleRoundedIcon sx={{ fontSize: 17 }} />General</Box>} />
        <Tab value="additional" label={<Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6 }}><NotesRoundedIcon sx={{ fontSize: 17 }} />Additional</Box>} />
        <Tab value="activity" label={<Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6 }}><HistoryRoundedIcon sx={{ fontSize: 17 }} />Activity</Box>} />
      </Tabs>
      <DialogContent sx={{ p: { xs: 1.5, sm: 2.25 }, bgcolor: 'rgba(105,145,220,0.035)' }}>
        {tab === 'general' && (
          <Stack spacing={1.5}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.75, color: 'text.secondary' }}>
              <Button type="button" size="small" variant="outlined" startIcon={<MicNoneRoundedIcon sx={iconSx} />} sx={{ borderRadius: 2, textTransform: 'none' }} aria-label="Voice input for ticket fields">Use voice input</Button>
            </Box>
            <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper' }}>
              <Stack spacing={1.35}>
                <TextField fullWidth size="small" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={touched && !title.trim()} helperText={touched && !title.trim() ? 'Title is required' : ' '} required sx={fieldSx} />
                <TextField fullWidth size="small" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={3} sx={fieldSx} />
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
                  <FormControl size="small" sx={fieldSx}><InputLabel>Priority</InputLabel><Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)} MenuProps={{ sx: { zIndex: (t) => t.zIndex.modal + 10 } }}>{(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((p) => <MenuItem key={p} value={p}>{PRIORITY_LABEL[p]}</MenuItem>)}</Select></FormControl>
                  <FormControl size="small" sx={fieldSx}><InputLabel>Assignee</InputLabel><Select label="Assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)} MenuProps={{ sx: { zIndex: (t) => t.zIndex.modal + 10 } }}>{ASSIGNEES.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}</Select></FormControl>
                </Box>
                {snapshotPolicy === 'creator_chooses' && <FormControlLabel control={<Checkbox size="small" checked={proof} onChange={(_, v) => setProof(v)} />} label="Capture Snapshot as Proof" />}
              </Stack>
            </Box>
          </Stack>
        )}
        {tab === 'additional' && (
          <Stack spacing={1.5}>
            <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper' }}>
              <Stack spacing={1.35}>
                <TextField fullWidth size="small" label="Coordinates" value={coordinates} slotProps={{ htmlInput: { readOnly: true } }} sx={fieldSx} />
                <TextField fullWidth size="small" label="Reporter" value={creator} slotProps={{ htmlInput: { readOnly: true } }} sx={fieldSx} />
                <TextField fullWidth size="small" label="Inspection Management System" value={TICKETING_SYSTEM} slotProps={{ htmlInput: { readOnly: true } }} sx={fieldSx} />
              </Stack>
            </Box>
          </Stack>
        )}
        {tab === 'activity' && (
          <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper' }}>
            <Stack spacing={2}>
              <Box>
                {sectionHeading(<HistoryRoundedIcon sx={iconSx} />, 'Ticket history')}
                <Typography variant="body2" color="text.secondary">History starts when the ticket is created.</Typography>
              </Box>
              <Box>
                {sectionHeading(<ConfirmationNumberRoundedIcon sx={iconSx} />, 'Status history')}
                <Typography variant="body2" color="text.secondary">Default status is To Do.</Typography>
              </Box>
              <Box>
                {sectionHeading(<NotesRoundedIcon sx={iconSx} />, 'Assignment history')}
                <Typography variant="body2" color="text.secondary">Will be assigned to {assignee} on {draft.camera.name}.</Typography>
              </Box>
            </Stack>
          </Box>
        )}
        {createError && <Typography color="error" variant="body2" sx={{ mt: 1 }}>{createError}</Typography>}
      </DialogContent>
      <DialogActions sx={{ px: 2.25, pb: 1.75, pt: 0.5 }}><Button onClick={onClose} disabled={isSubmitting}>Cancel</Button><Button type="submit" variant="contained" disabled={isSubmitting}>Create</Button></DialogActions>
    </Box>
  )
}

function Existing({
  ticket,
  me,
  canEdit,
  canChangeState,
  mode,
  initialTab,
  onClose,
}: {
  ticket: Ticket
  me: string
  canEdit: boolean
  canChangeState: boolean
  mode: 'view' | 'edit'
  initialTab: 'details' | 'activity'
  onClose: () => void
}) {
  const { transition, assign, updateDetails } = useTickets()
  const [tab, setTab] = useState<'details' | 'activity'>(initialTab)
  const [title, setTitle] = useState(ticket.title)
  const [description, setDescription] = useState(ticket.description)
  const [priority, setPriority] = useState(ticket.priority)
  const editing = mode === 'edit' && canEdit

  const saveDetails = () => {
    if (!title.trim()) return
    updateDetails(ticket.id, { title: title.trim(), description: description.trim(), priority }, me)
  }

  const next = useMemo(() => NEXT_STATES[ticket.status] ?? [], [ticket.status])

  return (
    <>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 0.75, py: 1.5, flexWrap: 'wrap' }}>
        <NotesRoundedIcon sx={{ color: 'primary.main', fontSize: 20 }} />
        <Typography variant="h6" sx={{ fontFamily: '"SF Mono", ui-monospace, Menlo, monospace' }}>
          {ticket.id}
        </Typography>
        <Chip
          size="small"
          label={STATUS_LABEL[ticket.status]}
          sx={{
            height: 24,
            fontSize: 12,
            color: STATUS_NEEDS_DARK_TEXT.includes(ticket.status) ? '#1C1C1E' : '#fff',
            bgcolor: STATUS_COLOR[ticket.status],
          }}
        />
        <Chip size="small" variant="outlined" label={PRIORITY_LABEL[priority]} sx={{ borderColor: PRIORITY_COLOR[priority], color: PRIORITY_COLOR[priority] }} />
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 36, px: 1, '& .MuiTab-root': { minHeight: 36, textTransform: 'none' } }}>
        <Tab value="details" label={<Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6 }}><TitleRoundedIcon sx={{ fontSize: 17 }} />Details</Box>} />
        <Tab value="activity" label={<Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6 }}><NotesRoundedIcon sx={{ fontSize: 17 }} />Activity</Box>} />
      </Tabs>
      <DialogContent sx={{ pt: 1.5 }}>
        {tab === 'details' && (
          <Stack spacing={1.25}>
            {editing ? (
              <>
                <TextField size="small" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
                <TextField size="small" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} />
                <FormControl size="small">
                  <InputLabel>Priority</InputLabel>
                  <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
                    {(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((p) => (
                      <MenuItem key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button size="small" variant="contained" onClick={saveDetails} sx={{ alignSelf: 'flex-start' }}>
                  Save details
                </Button>
              </>
            ) : (
              <>
                <Typography variant="subtitle1">{ticket.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {ticket.description}
                </Typography>
              </>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
              <Field label="Creator" value={ticket.creator} />
              <Field label="Assignee" value={ticket.assignee} />
              {ticket.cameraId && <Field label="Camera Name" value={ticketContextLabel(ticket)} />}
              <Field
            label="Coordinates"
            value={
              ticket.cameraId
                ? `P ${ticket.yaw.toFixed(1)}° · T ${ticket.pitch.toFixed(1)}° · Z ${ticket.zoom.toFixed(1)}×`
                : `${ticket.lat.toFixed(5)}, ${ticket.lng.toFixed(5)}`
            }
          />
              <Field label="Created" value={formatDateTime(ticket.createdAt)} />
              <Field label="Completed" value={ticket.completedAt ? formatDateTime(ticket.completedAt) : '—'} />
            </Box>
            {canChangeState && (
              <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap' }}>
                {next.map((state) => (
                  <Button key={state} size="small" variant="outlined" onClick={() => transition(ticket.id, state, { by: me })}>
                    {LIFECYCLE_LABEL[state]}
                  </Button>
                ))}
              </Stack>
            )}
            {canEdit && (
              <FormControl size="small" sx={{ maxWidth: 260 }}>
                <InputLabel>Reassign</InputLabel>
                <Select
                  label="Reassign"
                  value={ticket.assignee}
                  onChange={(e) => assign(ticket.id, e.target.value, me)}
                  MenuProps={{ sx: { zIndex: (t) => t.zIndex.modal + 10 } }}
                >
                  {ASSIGNEES.map((p) => (
                    <MenuItem key={p} value={p}>
                      {p}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <TicketAssignment ticket={ticket} me={me} />
            {isCompleted(ticket) && <ImprovementVerification ticket={ticket} />}
            {!isCompleted(ticket) && ticket.snapshots.before && (
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                  Creation snapshot
                </Typography>
                <Box component="img" src={ticket.snapshots.before.src} alt="Creation snapshot" sx={{ width: '100%', borderRadius: '10px', mt: 0.5 }} />
              </Box>
            )}
            {ticket.snapshotConfig && snapshotIsProof(ticket.snapshotConfig) && (
              <Typography variant="caption" color="text.secondary">
                Snapshot proof is on
              </Typography>
            )}
          </Stack>
        )}
        {tab === 'activity' && <TicketActivity ticket={ticket} />}
      </DialogContent>
    </>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
        {value}
      </Typography>
    </Box>
  )
}
