import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  alpha,
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
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  type Theme,
} from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import CameraAltRoundedIcon from '@mui/icons-material/CameraAltRounded'
import PublicRoundedIcon from '@mui/icons-material/PublicRounded'
import MicRoundedIcon from '@mui/icons-material/MicRounded'
import StopRoundedIcon from '@mui/icons-material/StopRounded'
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded'
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded'
import { ASSIGNEES, PRIORITY_COLOR, PRIORITY_LABEL, type TicketPriority } from '../../data/tickets'

type TicketTab = 'general' | 'additional' | 'activity'
type VoiceState = 'idle' | 'listening' | 'transcribing'

export interface TicketCreateContext {
  icon: 'camera' | 'earth'
  name: string
  subtitle: string
}

export type SnapshotControl =
  | { mode: 'toggle'; checked: boolean; onChange: (checked: boolean) => void }
  | { mode: 'locked-on' }
  | { mode: 'locked-off' }
  | { mode: 'unavailable' }

export interface TicketCreateActivity {
  label: string
  detail: string
  meta?: string
}

interface Props {
  context: TicketCreateContext
  title: string
  onTitleChange: (value: string) => void
  description: string
  onDescriptionChange: (value: string) => void
  priority: TicketPriority
  onPriorityChange: (value: TicketPriority) => void
  assignee: string
  onAssigneeChange: (value: string) => void
  touched: boolean
  snapshot: SnapshotControl
  snapshotPreview?: string | null
  coordinates: { label: string; value: string; hint?: string }
  reporter: string
  system: string
  activity: TicketCreateActivity[]
  error?: string
  isSubmitting: boolean
  onSubmit: (e: FormEvent) => void
  onClose: () => void
}

const VOICE_SAMPLE = {
  transcript: 'Unattended bag near the main entrance, high priority, assign to security lead.',
  title: 'Unattended bag near main entrance',
  description: 'An unattended bag has been left near the main entrance for several minutes. Please send someone to inspect the area.',
  priority: 'high' as TicketPriority,
}

const fieldSx = {
  '& .MuiInputBase-root': {
    borderRadius: 2,
    fontSize: 14,
    bgcolor: (t: Theme) => alpha(t.palette.text.primary, 0.03),
  },
  '& .MuiInputLabel-root': { fontSize: 14, fontWeight: 600 },
  '& .MuiOutlinedInput-notchedOutline': {
    borderWidth: 1.5,
    borderColor: (t: Theme) => alpha(t.palette.text.primary, 0.34),
  },
  '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: (t: Theme) => alpha(t.palette.text.primary, 0.6),
  },
  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main', borderWidth: 2 },
  '& .MuiOutlinedInput-root.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: 'error.main' },
}

const overlayControlSx = {
  display: 'flex',
  alignItems: 'center',
  height: 28,
  borderRadius: 999,
  color: '#fff',
  bgcolor: 'rgba(8, 12, 20, 0.62)',
  backdropFilter: 'blur(6px)',
}

const smallSwitchSx = {
  width: 34,
  height: 20,
  p: 0,
  '& .MuiSwitch-switchBase': { p: '2px', '&.Mui-checked': { transform: 'translateX(14px)' } },
  '& .MuiSwitch-thumb': { width: 16, height: 16, boxShadow: 'none' },
  '& .MuiSwitch-track': { borderRadius: 10, opacity: 1 },
}

function SnapshotPanel({
  snapshot,
  previewSrc,
  onExpand,
}: {
  snapshot: SnapshotControl
  previewSrc?: string | null
  onExpand: () => void
}) {
  const checked = snapshot.mode === 'toggle' ? snapshot.checked : snapshot.mode === 'locked-on'
  const showToggle = snapshot.mode !== 'unavailable'
  const showImage = checked && Boolean(previewSrc)
  const emptyLabel = snapshot.mode === 'unavailable' ? 'No snapshot for Earth tickets' : checked ? 'Snapshot unavailable' : 'Snapshot off'

  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: { xs: 240, md: 380 },
        height: '100%',
        overflow: 'hidden',
        borderRadius: 3,
        border: 1,
        borderColor: (t: Theme) => alpha(t.palette.text.primary, 0.2),
        bgcolor: (t: Theme) => alpha(t.palette.text.primary, 0.06),
      }}
    >
      {showImage ? (
        <Box
          component="img"
          src={previewSrc ?? undefined}
          alt="Snapshot of the current camera view that will be attached to this ticket"
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, color: 'text.secondary' }}>
          <CameraAltRoundedIcon sx={{ fontSize: 40, opacity: 0.6 }} />
          <Typography variant="body2">{emptyLabel}</Typography>
        </Box>
      )}

      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 1 }}>
        {showToggle ? (
          <Box sx={{ ...overlayControlSx, px: 0.75 }}>
            <Switch
              checked={checked}
              disabled={snapshot.mode !== 'toggle'}
              onChange={snapshot.mode === 'toggle' ? (_, value) => snapshot.onChange(value) : undefined}
              sx={smallSwitchSx}
              slotProps={{ input: { 'aria-label': 'Attach snapshot to this ticket' } }}
            />
          </Box>
        ) : (
          <span />
        )}
        {showImage && (
          <Tooltip title="Fullscreen">
            <IconButton
              size="small"
              onClick={onExpand}
              aria-label="View snapshot fullscreen"
              sx={{ ...overlayControlSx, width: 28, p: 0, '&:hover': { bgcolor: 'rgba(8, 12, 20, 0.8)' } }}
            >
              <FullscreenRoundedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  )
}

function Timeline({ items }: { items: TicketCreateActivity[] }) {
  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {items.map((item, index) => {
        const last = index === items.length - 1
        return (
          <Box component="li" key={item.label} sx={{ display: 'flex', gap: 1.75 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16, pt: 0.5 }}>
              <Box sx={{ width: 14, height: 14, borderRadius: '50%', border: 3, borderColor: 'primary.main', bgcolor: 'background.paper', flexShrink: 0 }} />
              {!last && <Box sx={{ flex: 1, width: 2, my: 0.5, bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.4) }} />}
            </Box>
            <Box sx={{ pb: last ? 0 : 2.5, minWidth: 0 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 800 }}>{item.label}</Typography>
              <Typography variant="body2">{item.detail}</Typography>
              {item.meta && (
                <Typography variant="caption" color="text.secondary" component="div">
                  {item.meta}
                </Typography>
              )}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

/** The single Create Ticket popup UI shared by Earth, 360, PTZ and CCTV. Presentation only. */
export default function TicketCreateLayout({
  context,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  priority,
  onPriorityChange,
  assignee,
  onAssigneeChange,
  touched,
  snapshot,
  snapshotPreview,
  coordinates,
  reporter,
  system,
  activity,
  error,
  isSubmitting,
  onSubmit,
  onClose,
}: Props) {
  const uid = useId()
  const [tab, setTab] = useState<TicketTab>('general')
  const [fullscreen, setFullscreen] = useState(false)
  const [voice, setVoice] = useState<VoiceState>('idle')
  const timers = useRef<number[]>([])
  const titleInvalid = touched && !title.trim()
  const menuProps = { sx: { zIndex: (t: Theme) => t.zIndex.modal + 10 } }
  const snapshotOn = snapshot.mode === 'toggle' ? snapshot.checked : snapshot.mode === 'locked-on'
  const canExpand = snapshotOn && Boolean(snapshotPreview)

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((id) => window.clearTimeout(id))
  }, [])

  const handleSubmit = (e: FormEvent) => {
    if (!title.trim()) setTab('general')
    onSubmit(e)
  }

  const stopVoice = () => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
    setVoice('idle')
  }

  const toggleVoice = () => {
    if (voice !== 'idle') {
      stopVoice()
      return
    }
    setVoice('listening')
    const toTranscribing = window.setTimeout(() => setVoice('transcribing'), 1600)
    const toFilled = window.setTimeout(() => {
      onTitleChange(VOICE_SAMPLE.title)
      onDescriptionChange(VOICE_SAMPLE.description)
      onPriorityChange(VOICE_SAMPLE.priority)
      onAssigneeChange(ASSIGNEES.length > 1 ? ASSIGNEES[1] : ASSIGNEES[0])
      setVoice('idle')
    }, 2800)
    timers.current = [toTranscribing, toFilled]
  }

  const tabId = (value: TicketTab) => `${uid}-tab-${value}`

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <DialogTitle component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1.75, px: { xs: 2, sm: 2.75 } }}>
        <Box
          aria-hidden
          sx={{ width: 36, height: 36, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 2, color: 'primary.contrastText', bgcolor: 'primary.main' }}
        >
          <ConfirmationNumberRoundedIcon sx={{ fontSize: 20 }} />
        </Box>
        <Typography component="h2" sx={{ flex: 1, minWidth: 0, fontSize: { xs: 20, sm: 24 }, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          Create Ticket
        </Typography>
        <Tooltip title={context.name}>
          <IconButton
            size="small"
            onClick={() => canExpand && setFullscreen(true)}
            aria-label={`${context.name} camera view`}
            sx={{ color: 'primary.main', bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.14) }}
          >
            {context.icon === 'earth' ? <PublicRoundedIcon fontSize="small" /> : <CameraAltRoundedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <Tabs
        value={tab}
        onChange={(_, value: TicketTab) => setTab(value)}
        variant="fullWidth"
        aria-label="Ticket sections"
        sx={{ px: { xs: 1, sm: 2.25 }, borderBottom: 1, borderColor: 'divider', minHeight: 44, '& .MuiTab-root': { minHeight: 44, fontSize: 13, fontWeight: 800, letterSpacing: '0.06em' } }}
      >
        <Tab value="general" id={tabId('general')} aria-controls={`${uid}-panel`} label="General" />
        <Tab value="additional" id={tabId('additional')} aria-controls={`${uid}-panel`} label="Additional" />
        <Tab value="activity" id={tabId('activity')} aria-controls={`${uid}-panel`} label="Activity" />
      </Tabs>

      <DialogContent id={`${uid}-panel`} role="tabpanel" aria-labelledby={tabId(tab)} sx={{ p: { xs: 2, sm: 2.75 } }}>
        {tab === 'general' && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 3, alignItems: 'stretch', pt: 0.5 }}>
            <Stack spacing={2.5}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TextField
                    variant="outlined"
                    id={`${uid}-title`}
                    label="Title"
                    fullWidth
                    size="small"
                    placeholder="Enter ticket title..."
                    value={title}
                    onChange={(e) => onTitleChange(e.target.value)}
                    error={titleInvalid}
                    required
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={fieldSx}
                  />
                  <Tooltip title={voice === 'idle' ? 'Voice input' : 'Stop'}>
                    <IconButton
                      onClick={toggleVoice}
                      aria-label={voice === 'idle' ? 'Start voice input' : 'Stop voice input'}
                      aria-pressed={voice !== 'idle'}
                      sx={{
                        width: 36,
                        height: 36,
                        flexShrink: 0,
                        color: 'primary.contrastText',
                        bgcolor: 'primary.main',
                        '&:hover': { bgcolor: 'primary.dark' },
                        ...(voice === 'listening' && {
                          animation: 'voicePulse 1.2s ease-out infinite',
                          '@keyframes voicePulse': {
                            '0%': { boxShadow: (t: Theme) => `0 0 0 0 ${alpha(t.palette.primary.main, 0.55)}` },
                            '100%': { boxShadow: (t: Theme) => `0 0 0 10px ${alpha(t.palette.primary.main, 0)}` },
                          },
                        }),
                      }}
                    >
                      {voice === 'idle' ? <MicRoundedIcon sx={{ fontSize: 20 }} /> : <StopRoundedIcon sx={{ fontSize: 20 }} />}
                    </IconButton>
                  </Tooltip>
                </Box>
                {voice !== 'idle' && (
                  <Typography role="status" variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75, mx: 0.5 }}>
                    {voice === 'listening' ? 'Listening…' : `“${VOICE_SAMPLE.transcript}”`}
                  </Typography>
                )}
              </Box>

              <TextField
                variant="outlined"
                id={`${uid}-description`}
                label="Description"
                fullWidth
                size="small"
                placeholder="Enter detailed description of the issue..."
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                multiline
                minRows={4}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={fieldSx}
              />

              <FormControl fullWidth size="small" sx={fieldSx}>
                <Select
                  value={priority}
                  onChange={(e) => onPriorityChange(e.target.value as TicketPriority)}
                  MenuProps={menuProps}
                  inputProps={{ 'aria-label': 'Priority' }}
                  renderValue={(value) => <PriorityOption priority={value as TicketPriority} />}
                >
                  {(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((p) => (
                    <MenuItem key={p} value={p}>
                      <PriorityOption priority={p} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl fullWidth size="small" sx={fieldSx}>
                <InputLabel id={`${uid}-assignee-label`}>Assignee</InputLabel>
                <Select
                  labelId={`${uid}-assignee-label`}
                  label="Assignee"
                  value={assignee}
                  onChange={(e) => onAssigneeChange(e.target.value)}
                  MenuProps={menuProps}
                >
                  {ASSIGNEES.map((person) => (
                    <MenuItem key={person} value={person}>
                      {person}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            <SnapshotPanel snapshot={snapshot} previewSrc={snapshotPreview} onExpand={() => setFullscreen(true)} />
          </Box>
        )}

        {tab === 'additional' && (
          <Stack spacing={2.5} sx={{ maxWidth: 560, pt: 0.5 }}>
            <TextField
              variant="outlined"
              id={`${uid}-coordinates`}
              label={coordinates.label}
              fullWidth
              size="small"
              value={coordinates.value}
              slotProps={{ htmlInput: { readOnly: true } }}
              sx={fieldSx}
            />
            <TextField variant="outlined" id={`${uid}-reporter`} label="Reporter" fullWidth size="small" value={reporter} slotProps={{ htmlInput: { readOnly: true } }} sx={fieldSx} />
            <TextField
              variant="outlined"
              id={`${uid}-system`}
              label="Inspection Management System"
              fullWidth
              size="small"
              value={system}
              slotProps={{ htmlInput: { readOnly: true } }}
              sx={fieldSx}
            />
          </Stack>
        )}

        {tab === 'activity' && (
          <Box sx={{ maxWidth: 560 }}>
            <Timeline items={activity} />
          </Box>
        )}

        {error && (
          <Typography role="alert" color="error" variant="body2" sx={{ mt: 2 }}>
            {error}
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: { xs: 2, sm: 2.75 }, py: 2, gap: 1 }}>
        <Button type="button" variant="outlined" color="inherit" onClick={onClose} disabled={isSubmitting} sx={{ borderRadius: 2, px: 3, fontWeight: 700 }}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={isSubmitting} sx={{ borderRadius: 2, px: 3, fontWeight: 700 }}>
          {isSubmitting ? 'Creating…' : 'Create Ticket'}
        </Button>
      </DialogActions>

      <Dialog
        open={fullscreen && canExpand}
        onClose={() => setFullscreen(false)}
        fullScreen
        sx={{ zIndex: (t: Theme) => t.zIndex.modal + 20 }}
        slotProps={{ paper: { sx: { bgcolor: '#000' } } }}
      >
        <IconButton
          onClick={() => setFullscreen(false)}
          aria-label="Close fullscreen snapshot"
          sx={{ position: 'absolute', top: 12, right: 12, zIndex: 1, color: '#fff', bgcolor: 'rgba(8, 12, 20, 0.62)', '&:hover': { bgcolor: 'rgba(8, 12, 20, 0.85)' } }}
        >
          <CloseRoundedIcon />
        </IconButton>
        <Box
          component="img"
          src={snapshotPreview ?? undefined}
          alt="Snapshot of the current camera view"
          sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </Dialog>
    </Box>
  )
}

function PriorityOption({ priority }: { priority: TicketPriority }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <Box aria-hidden sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: PRIORITY_COLOR[priority], flexShrink: 0 }} />
      <Typography component="span" sx={{ fontSize: 14, fontWeight: 600 }}>
        {PRIORITY_LABEL[priority]}
      </Typography>
    </Box>
  )
}
