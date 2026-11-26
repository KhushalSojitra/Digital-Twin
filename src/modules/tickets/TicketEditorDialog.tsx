import { Component, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useTickets } from '../../state/TicketsContext'
import { DEFAULT_SNAPSHOT_FOV, frameFromAdjust, NO_ADJUST, type SnapshotAdjust } from './snapshotFraming'
import { Dialog, DialogContent, DialogTitle, IconButton, Typography, useMediaQuery, useTheme } from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import { ticketDialogPaperSx } from '../../theme/hud'
import {
  UNASSIGNED,
  TICKETING_SYSTEM,
  siteName,
  snapshotFromProof,
  type NewTicketInput,
  type PinView,
  type Ticket,
  type TicketPriority,
} from '../../data/tickets'
import type { CameraDevice } from '../../data/cameras'
import { useAuth } from '../../auth/AuthContext'
import { useIntegrations } from '../../state/IntegrationsContext'
import { useCapture } from './captureContext'
import { useMarkTicketSeen } from '../../state/TicketReadsContext'
import TicketDetailView from './TicketDetailView'
import { DEFAULT_TICKET_TYPE_KEY } from '../../data/ticketTypes'
import TicketCreateLayout, { type SnapshotControl, type TicketCreateContext } from './TicketCreateLayout'

const DEVICE_KIND_LABEL: Record<CameraDevice['kind'], string> = {
  '360': '360° Camera',
  ptz: 'PTZ Camera',
  cctv: 'CCTV',
}

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
  onOpenCamera?: (ticket: Ticket) => void
}

export default function TicketEditorDialog({ open, mode, ticket, draft, initialTab = 'details', onClose, onCreate, onOpenCamera }: Props) {
  const { currentUser } = useAuth()
  const me = currentUser?.displayName ?? 'Ava Sharma'
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))
  const canEdit = currentUser?.role !== 'Viewer' && mode !== 'view'
  // Each action is checked against the hierarchy rules (permissions.ts / database), so everyone gets the actions they may run.
  const canChangeState = Boolean(ticket)
  const creating = mode === 'create' && Boolean(draft)
  const { tickets } = useTickets()
  // Main ticket ↔ sub-task navigation inside the same dialog.
  const [navId, setNavId] = useState<string | null>(null)
  const [navFrom, setNavFrom] = useState(ticket?.id)
  if (navFrom !== ticket?.id) {
    setNavFrom(ticket?.id)
    setNavId(null)
  }
  const shown = (navId && tickets.find((t) => t.id === navId)) || ticket
  useMarkTicketSeen(shown, open && !creating)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      fullScreen={isXs}
      maxWidth={false}
      sx={{ zIndex: (t) => t.zIndex.modal + 4 }}
      slotProps={{ paper: { sx: ticketDialogPaperSx } }}
    >
      <DialogGuard key={shown?.id ?? (creating ? 'create' : 'empty')} onClose={onClose}>
        {creating && draft && onCreate ? (
          <CreateForm draft={draft} creator={me} onClose={onClose} onCreate={onCreate} />
        ) : shown ? (
          <Existing
            key={`${shown.id}:${initialTab}`}
            ticket={shown}
            me={me}
            canEdit={canEdit}
            canChangeState={canChangeState}
            mode={mode === 'edit' ? 'edit' : 'view'}
            initialTab={initialTab}
            onClose={onClose}
            onOpenCamera={onOpenCamera}
            onOpenTicket={(id) => setNavId(id === ticket?.id ? null : id)}
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
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [assignee, setAssignee] = useState(UNASSIGNED)
  const [touched, setTouched] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createError, setCreateError] = useState('')
  const [ticketType, setTicketType] = useState(DEFAULT_TICKET_TYPE_KEY)
  const snapshotPolicy = defaultIntegration.snapshotPolicy
  const [proof, setProof] = useState(snapshotPolicy !== 'disabled')
  // The camera view the ticket was raised in; the user can zoom/position within it (no free crop).
  // The resulting framing is stored on the creation snapshot and reused for the completion snapshot,
  // so Before and After cover exactly the same area.
  const baseView = useMemo<PinView>(
    () => draft.view ?? { yaw: draft.yaw, pitch: draft.pitch, fov: DEFAULT_SNAPSHOT_FOV },
    [draft.view, draft.yaw, draft.pitch],
  )
  const pin = useMemo(() => [{ yaw: draft.yaw, pitch: draft.pitch }], [draft.yaw, draft.pitch])
  const grab = (view: PinView) =>
    capture?.(draft.camera.id, view, 'before', { fov: view.fov, marks: pin, exact: true }) ?? null
  const [snapshotBase] = useState<string | null>(() => grab(baseView))
  const [snapshotAdjust, setSnapshotAdjust] = useState<SnapshotAdjust>(NO_ADJUST)
  const framing = useMemo(() => frameFromAdjust(baseView, snapshotAdjust), [baseView, snapshotAdjust])
  const [snapshotPreview, setSnapshotPreview] = useState<string | null>(snapshotBase)
  const adjustSnapshot = (adjust: SnapshotAdjust) => {
    setSnapshotAdjust(adjust)
    setSnapshotPreview(grab(frameFromAdjust(baseView, adjust)) ?? snapshotBase)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!title.trim()) return
    const captureProof = snapshotPolicy === 'always' ? true : snapshotPolicy === 'disabled' ? false : proof
    const snapshots = snapshotFromProof(captureProof)
    const { view } = draft
    const src = snapshots.captureCreation ? grab(framing) : null
    setIsSubmitting(true)
    setCreateError('')
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim() || 'Raised from Live View at the marked location.',
        type: ticketType,
        priority,
        zone: draft.camera.name.split(' — ')[1] ?? 'Perimeter',
        assignee,
        creator,
        platform: 'default',
        platformName: TICKETING_SYSTEM,
        snapshotConfig: snapshots,
        creationSnapshot: src
          ? { src, at: new Date().toISOString(), by: creator, yaw: framing.yaw, pitch: framing.pitch, cameraId: draft.camera.id, view: framing }
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

  const camera = draft.camera
  const context: TicketCreateContext = {
    icon: 'camera',
    name: camera.name,
    subtitle: `${siteName(camera.siteId)} • ${DEVICE_KIND_LABEL[camera.kind]}`,
  }
  const snapshot: SnapshotControl =
    snapshotPolicy === 'creator_chooses'
      ? { mode: 'toggle', checked: proof, onChange: setProof }
      : snapshotPolicy === 'always'
        ? { mode: 'locked-on' }
        : { mode: 'locked-off' }

  return (
    <TicketCreateLayout
      context={context}
      title={title}
      onTitleChange={setTitle}
      description={description}
      onDescriptionChange={setDescription}
      priority={priority}
      onPriorityChange={setPriority}
      assignee={assignee}
      onAssigneeChange={setAssignee}
      touched={touched}
      snapshot={snapshot}
      snapshotPreview={snapshotPreview}
      snapshotBase={snapshotBase}
      snapshotAdjust={snapshotAdjust}
      onSnapshotAdjust={snapshotBase ? adjustSnapshot : undefined}
      activity={[]}
      error={createError}
      isSubmitting={isSubmitting}
      onSubmit={submit}
      onClose={onClose}
      ticketType={ticketType}
      onTicketTypeChange={setTicketType}
    />
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
  onOpenCamera,
  onOpenTicket,
}: {
  ticket: Ticket
  me: string
  canEdit: boolean
  canChangeState: boolean
  mode: 'view' | 'edit'
  initialTab: 'details' | 'activity'
  onClose: () => void
  onOpenCamera?: (ticket: Ticket) => void
  onOpenTicket?: (id: string) => void
}) {
  return (
    <TicketDetailView
      ticket={ticket}
      me={me}
      canEdit={canEdit}
      canChangeState={canChangeState}
      editing={mode === 'edit' && canEdit}
      initialTab={initialTab === 'activity' ? 'activity' : 'snapshot'}
      onClose={onClose}
      onOpenCamera={onOpenCamera}
      onOpenTicket={onOpenTicket}
    />
  )
}
