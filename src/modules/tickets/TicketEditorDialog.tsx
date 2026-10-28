import { Component, useState, type FormEvent, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogTitle, IconButton, Typography, useMediaQuery, useTheme } from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import { dialogPaperSx } from '../../theme/hud'
import {
  ASSIGNEES,
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
}

export default function TicketEditorDialog({ open, mode, ticket, draft, initialTab = 'details', onClose, onCreate }: Props) {
  const { currentUser } = useAuth()
  const me = currentUser?.displayName ?? 'Ava Sharma'
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))
  const canEdit = currentUser?.role !== 'Viewer' && mode !== 'view'
  const canChangeState = Boolean(ticket && (ticket.assignee === me || currentUser?.role !== 'Viewer'))
  const creating = mode === 'create' && Boolean(draft)
  useMarkTicketSeen(ticket, open && !creating)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      fullScreen={isXs}
      maxWidth="md"
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
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [assignee, setAssignee] = useState(ASSIGNEES.includes(creator) ? creator : ASSIGNEES[0])
  const [touched, setTouched] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createError, setCreateError] = useState('')
  const snapshotPolicy = defaultIntegration.snapshotPolicy
  const [proof, setProof] = useState(snapshotPolicy !== 'disabled')
  const [snapshotPreview] = useState<string | null>(() => {
    const { view } = draft
    const frame = view ? { yaw: view.yaw, pitch: view.pitch } : { yaw: draft.yaw, pitch: draft.pitch }
    return capture?.(draft.camera.id, frame, 'before', { fov: view?.fov, marks: [{ yaw: draft.yaw, pitch: draft.pitch }] }) ?? null
  })

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
      coordinates={{
        label: 'Pin Orientation',
        value: `P ${draft.yaw.toFixed(1)}° · T ${draft.pitch.toFixed(1)}° · Z ${draft.zoom.toFixed(1)}×`,
        hint: 'Pan · Tilt · Zoom of the pinned location',
      }}
      reporter={creator}
      system={TICKETING_SYSTEM}
      activity={[
        { label: 'Ticket Created', detail: `Reported by ${creator}`, meta: 'Recorded when you create the ticket' },
        { label: 'Assigned', detail: `${assignee} on ${camera.name}`, meta: 'Assigned on creation' },
        { label: 'Status', detail: 'To Do', meta: 'Default status' },
      ]}
      error={createError}
      isSubmitting={isSubmitting}
      onSubmit={submit}
      onClose={onClose}
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
}: {
  ticket: Ticket
  me: string
  canEdit: boolean
  canChangeState: boolean
  mode: 'view' | 'edit'
  initialTab: 'details' | 'activity'
  onClose: () => void
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
    />
  )
}
