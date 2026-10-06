import { useState, type FormEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import { dialogPaperSx } from '../../theme/hud'
import { ASSIGNEES, PRIORITY_LABEL, TICKETING_SYSTEM, type Ticket, type TicketPriority } from '../../data/tickets'
import { formatDateTime } from '../../utils/format'
import { useTickets } from '../../state/TicketsContext'

export interface EarthLocation {
  lat: number
  lng: number
}

interface Props {
  location: EarthLocation | null
  creator: string
  onClose: () => void
  onCreated: (ticket: Ticket) => void
}

export default function EarthTicketCreateDialog({ location, creator, onClose, onCreated }: Props) {
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))
  return (
    <Dialog
      open={Boolean(location)}
      onClose={onClose}
      fullWidth
      fullScreen={isXs}
      maxWidth="sm"
      sx={{ zIndex: (t) => t.zIndex.modal + 4 }}
      slotProps={{ paper: { sx: dialogPaperSx } }}
    >
      {location && <CreateForm key={`${location.lat}:${location.lng}`} location={location} creator={creator} onClose={onClose} onCreated={onCreated} />}
    </Dialog>
  )
}

function CreateForm({ location, creator, onClose, onCreated }: Omit<Props, 'location'> & { location: EarthLocation }) {
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

  return (
    <Box component="form" onSubmit={submit}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', py: 1.5 }}>
        <Typography variant="h6" sx={{ flex: 1, minWidth: 0 }}>
          Create Ticket
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: 1.5 }}>
        <Stack spacing={1.25}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
            <TextField size="small" label="Coordinates" value={`${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`} slotProps={{ htmlInput: { readOnly: true } }} />
            <TextField size="small" label="Source" value="Earth" slotProps={{ htmlInput: { readOnly: true } }} />
            <TextField size="small" label="Ticket ID" value="Assigned on submit" slotProps={{ htmlInput: { readOnly: true } }} />
            <TextField size="small" label="Date/Time" value={formatDateTime(openedAt)} slotProps={{ htmlInput: { readOnly: true } }} />
            <TextField size="small" label="Reporter" value={creator} slotProps={{ htmlInput: { readOnly: true } }} />
            <TextField size="small" label="Status" value="Open" slotProps={{ htmlInput: { readOnly: true } }} />
          </Box>
          <TextField
            size="small"
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={touched && !title.trim()}
            helperText={touched && !title.trim() ? 'Title is required' : ' '}
            required
          />
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
            <TextField
              size="small"
              label="Ticketing System"
              value={TICKETING_SYSTEM}
              sx={{ gridColumn: { sm: '1 / -1' } }}
              slotProps={{ htmlInput: { readOnly: true } }}
            />
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create Ticket'}
        </Button>
      </DialogActions>
    </Box>
  )
}
