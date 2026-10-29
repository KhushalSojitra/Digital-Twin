import { useState, type FormEvent } from 'react'
import { Dialog, useMediaQuery, useTheme } from '@mui/material'
import { dialogPaperSx } from '../../theme/hud'
import { ASSIGNEES, TICKETING_SYSTEM, type Ticket, type TicketPriority } from '../../data/tickets'
import { formatDateTime } from '../../utils/format'
import { useTickets } from '../../state/TicketsContext'
import TicketCreateLayout from '../tickets/TicketCreateLayout'

export interface EarthLocation {
  lat: number
  lng: number
  preview?: string | null
  view?: { zoom: number; pitch: number; bearing: number }
}

interface Props {
  location: EarthLocation | null
  creator: string
  onClose: () => void
  onCreated: (ticket: Ticket) => void
  onPreviewClick?: (location: EarthLocation) => void
}

export default function EarthTicketCreateDialog({ location, creator, onClose, onCreated, onPreviewClick }: Props) {
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))
  return (
    <Dialog
      open={Boolean(location)}
      onClose={onClose}
      fullWidth
      fullScreen={isXs}
      maxWidth="md"
      sx={{ zIndex: (t) => t.zIndex.modal + 4 }}
      slotProps={{ paper: { sx: { ...dialogPaperSx, height: { xs: '100%', sm: 'min(860px, 92dvh)' } } } }}
    >
      {location && <CreateForm key={`${location.lat}:${location.lng}`} location={location} creator={creator} onClose={onClose} onCreated={onCreated} onPreviewClick={onPreviewClick} />}
    </Dialog>
  )
}

function CreateForm({ location, creator, onClose, onCreated, onPreviewClick }: Omit<Props, 'location'> & { location: EarthLocation }) {
  const { addTicket } = useTickets()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [assignee, setAssignee] = useState(ASSIGNEES.includes(creator) ? creator : ASSIGNEES[0])
  const [touched, setTouched] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [openedAt] = useState(() => new Date().toISOString())

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!title.trim()) return
    setIsSubmitting(true)
    setError('')
    try {
      const created = await addTicket({
        source: 'EARTH',
        title: title.trim(),
        description: description.trim() || 'Raised on Earth at the marked location.',
        type: 'intrusion',
        priority,
        zone: 'Perimeter',
        assignee,
        creator,
        platform: 'default',
        platformName: TICKETING_SYSTEM,
        snapshotConfig: { captureCreation: false, captureCompletion: false, showInImprovementHistory: false },
        lat: location.lat,
        lng: location.lng,
      })
      onCreated(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ticket could not be saved.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const coordinates = `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`

  return (
    <TicketCreateLayout
      context={{ icon: 'earth', name: 'Earth Location', subtitle: `Earth • ${coordinates}` }}
      title={title}
      onTitleChange={setTitle}
      description={description}
      onDescriptionChange={setDescription}
      priority={priority}
      onPriorityChange={setPriority}
      assignee={assignee}
      onAssigneeChange={setAssignee}
      touched={touched}
      snapshot={{ mode: 'unavailable' }}
      snapshotPreview={location.preview}
      onSnapshotClick={location.view ? () => onPreviewClick?.(location) : undefined}
      activity={[
        { label: 'Ticket Created', detail: `Reported by ${creator}`, meta: `Opened ${formatDateTime(openedAt)} · Ticket ID assigned on submit` },
        { label: 'Assigned', detail: assignee, meta: 'Assigned on creation' },
        { label: 'Status', detail: 'Open', meta: 'Default status' },
      ]}
      error={error}
      isSubmitting={isSubmitting}
      onSubmit={submit}
      onClose={onClose}
    />
  )
}
