import { Component, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
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
} from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
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
  cameraName,
  isCompleted,
  snapshotFromProof,
  snapshotIsProof,
  type NewTicketInput,
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
}

interface Props {
  open: boolean
  mode: 'create' | 'view' | 'edit'
  ticket?: Ticket | null
  draft?: CreateDraft | null
  initialTab?: 'details' | 'activity'
  onClose: () => void
  onCreate?: (input: NewTicketInput) => void
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
  onCreate: (input: NewTicketInput) => void
}) {
  const { defaultIntegration, integrations } = useIntegrations()
  const capture = useCapture()
  const [tab, setTab] = useState<'general' | 'activity'>('general')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [assignee, setAssignee] = useState(ASSIGNEES.includes(creator) ? creator : ASSIGNEES[0])
  const [platformId, setPlatformId] = useState(defaultIntegration.id)
  const [touched, setTouched] = useState(false)
  const selected = integrations.find((i) => i.id === platformId) ?? defaultIntegration
  const snapshotPolicy = selected.snapshotPolicy
  const [proof, setProof] = useState(snapshotPolicy !== 'disabled')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!title.trim()) return
    const captureProof = snapshotPolicy === 'always' ? true : snapshotPolicy === 'disabled' ? false : proof
    const snapshots = snapshotFromProof(captureProof)
    const src = snapshots.captureCreation ? capture?.(draft.camera.id, { yaw: draft.yaw, pitch: draft.pitch }, 'before') : null
    onCreate({
      title: title.trim(),
      description: description.trim() || 'Raised from Live View at the marked location.',
      type: 'intrusion',
      priority,
      zone: draft.camera.name.split(' — ')[1] ?? 'Perimeter',
      assignee,
      creator,
      platform: selected.platform,
      platformName: selected.platformName,
      snapshotConfig: snapshots,
      creationSnapshot: src ? { src, at: new Date().toISOString(), by: creator, yaw: draft.yaw, pitch: draft.pitch } : undefined,
      cameraId: draft.camera.id,
      yaw: draft.yaw,
      pitch: draft.pitch,
      zoom: draft.zoom,
    })
  }

  return (
    <Box component="form" onSubmit={submit}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', py: 1.5 }}>
        <Typography variant="h6" sx={{ flex: 1, minWidth: 0 }}>
          Create Ticket
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label="Close" sx={{ ml: 0.5 }}>
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 36, px: 1, '& .MuiTab-root': { minHeight: 36, textTransform: 'none' } }}>
        <Tab value="general" label="General" />
        <Tab value="activity" label="Activity" />
      </Tabs>
      <DialogContent sx={{ pt: 1.5 }}>
        {tab === 'general' && (
          <Stack spacing={1.25}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
              <TextField size="small" label="Coordinates" value={`P ${draft.yaw.toFixed(1)}° · T ${draft.pitch.toFixed(1)}° · Z ${draft.zoom.toFixed(1)}×`} slotProps={{ htmlInput: { readOnly: true } }} />
              <TextField size="small" label="Camera Name" value={draft.camera.name} slotProps={{ htmlInput: { readOnly: true } }} />
            </Box>
            <TextField size="small" label="Ticket ID" value="Assigned on submit" slotProps={{ htmlInput: { readOnly: true } }} />
            <TextField size="small" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={touched && !title.trim()} helperText={touched && !title.trim() ? 'Title is required' : ' '} required />
            <TextField size="small" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} multiline minRows={2} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
              <FormControl size="small">
                <InputLabel>Priority</InputLabel>
                <Select
                  label="Priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TicketPriority)}
                  MenuProps={{ sx: { zIndex: (t) => t.zIndex.modal + 10 } }}
                >
                  {(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((p) => (
                    <MenuItem key={p} value={p}>
                      {PRIORITY_LABEL[p]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small">
                <InputLabel>Assignee</InputLabel>
                <Select
                  label="Assignee"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  MenuProps={{ sx: { zIndex: (t) => t.zIndex.modal + 10 } }}
                >
                  {ASSIGNEES.map((p) => (
                    <MenuItem key={p} value={p}>
                      {p}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ gridColumn: { sm: '1 / -1' } }}>
                <InputLabel>Ticketing Platform</InputLabel>
                <Select
                  label="Ticketing Platform"
                  value={platformId}
                  onChange={(e) => {
                    const nextId = e.target.value
                    setPlatformId(nextId)
                    const next = integrations.find((i) => i.id === nextId) ?? defaultIntegration
                    setProof(next.snapshotPolicy !== 'disabled')
                  }}
                  MenuProps={{ sx: { zIndex: (t) => t.zIndex.modal + 10 } }}
                >
                  {integrations.map((i) => (
                    <MenuItem key={i.id} value={i.id}>
                      {i.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
            {snapshotPolicy === 'creator_chooses' && (
              <FormControlLabel
                control={<Checkbox size="small" checked={proof} onChange={(_, v) => setProof(v)} />}
                label="Capture Snapshot As Proof"
              />
            )}
          </Stack>
        )}
        {tab === 'activity' && (
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="overline" color="text.secondary">
                Ticket history
              </Typography>
              <Typography variant="body2" color="text.secondary">
                History starts when the ticket is created.
              </Typography>
            </Box>
            <Box>
              <Typography variant="overline" color="text.secondary">
                Status history
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Default status is To Do.
              </Typography>
            </Box>
            <Box>
              <Typography variant="overline" color="text.secondary">
                Assignment history
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Will be assigned to {assignee} on {selected.name}.
              </Typography>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 1.5 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained">
          Create
        </Button>
      </DialogActions>
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
        <Tab value="details" label="Details" />
        <Tab value="activity" label="Activity" />
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
              <Field label="Camera Name" value={cameraName(ticket.cameraId)} />
              <Field label="Coordinates" value={`P ${ticket.yaw.toFixed(1)}° · T ${ticket.pitch.toFixed(1)}° · Z ${ticket.zoom.toFixed(1)}×`} />
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
