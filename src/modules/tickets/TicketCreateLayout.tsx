import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  alpha,
  Badge,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
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
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded'
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded'
import PersonRoundedIcon from '@mui/icons-material/PersonRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import { ASSIGNEES, PRIORITY_COLOR, PRIORITY_LABEL, type TicketPriority } from '../../data/tickets'
import { useAttachments, type Attachment } from './attachments'
import AttachmentPopover from './AttachmentPopover'
import DocumentPreview from './DocumentPreview'
import SnapshotMarkup, { type MarkupShape } from './SnapshotMarkup'

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
  onMarkupChange?: (image: string | null) => void
  onSnapshotClick?: () => void
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
    borderRadius: '14px',
    fontSize: 16,
    bgcolor: (t: Theme) => alpha(t.palette.text.primary, 0.02),
  },
  '& .MuiInputLabel-root': { fontSize: 15, fontWeight: 500, color: 'text.secondary' },
  '& .MuiInputLabel-root.Mui-focused': { color: 'primary.main' },
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
  height: 32,
  borderRadius: 999,
  color: '#fff',
  bgcolor: 'rgba(8, 12, 20, 0.62)',
  backdropFilter: 'blur(6px)',
}

const overlayButtonSx = {
  width: 40,
  height: 40,
  borderRadius: '10px',
  color: '#fff',
  bgcolor: 'rgba(8, 12, 20, 0.78)',
  '&:hover': { bgcolor: 'rgba(8, 12, 20, 0.92)' },
}

const smallSwitchSx = {
  width: 38,
  height: 22,
  p: 0,
  '& .MuiSwitch-switchBase': { p: '3px', '&.Mui-checked': { transform: 'translateX(16px)' } },
  '& .MuiSwitch-thumb': { width: 16, height: 16, boxShadow: 'none' },
  '& .MuiSwitch-track': { borderRadius: 11, opacity: 1 },
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function snapshotStamp(date: Date) {
  const two = (n: number) => String(n).padStart(2, '0')
  const day = `${two(date.getDate())}-${two(date.getMonth() + 1)}-${date.getFullYear()}`
  const time = `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`
  return `${day} ${time} ${DAYS[date.getDay()]}`
}

function SnapshotPanel({
  snapshot,
  originalSrc,
  displaySrc,
  cameraName,
  stamp,
  editing,
  shapes,
  onStartEdit,
  onCancelEdit,
  onFinishEdit,
  onExpand,
  onSnapshotClick,
}: {
  snapshot: SnapshotControl
  originalSrc?: string | null
  displaySrc?: string | null
  cameraName: string
  stamp: string
  editing: boolean
  shapes: MarkupShape[]
  onStartEdit: () => void
  onCancelEdit: () => void
  onFinishEdit: (shapes: MarkupShape[], image: string | null) => void
  onExpand: () => void
  onSnapshotClick?: () => void
}) {
  const checked = snapshot.mode === 'toggle' ? snapshot.checked : snapshot.mode === 'locked-on' || snapshot.mode === 'unavailable'
  const showToggle = snapshot.mode !== 'unavailable'
  const showImage = checked && Boolean(displaySrc)
  const isEditing = editing && showImage && Boolean(originalSrc)
  const emptyLabel = snapshot.mode === 'unavailable' ? 'No snapshot for Earth tickets' : checked ? 'Snapshot unavailable' : 'Snapshot off'

  return (
    <Box
      sx={{
        position: 'relative',
        minHeight: { xs: 260, md: 420 },
        height: '100%',
        overflow: 'hidden',
        borderRadius: '16px',
        bgcolor: (t: Theme) => alpha(t.palette.text.primary, 0.08),
      }}
    >
      {showImage ? (
        <Box
          component="img"
          src={(isEditing ? originalSrc : displaySrc) ?? undefined}
          alt="Snapshot of the current camera view that will be attached to this ticket"
          onClick={onSnapshotClick}
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', cursor: onSnapshotClick ? 'pointer' : 'default' }}
        />
      ) : (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, color: 'text.secondary' }}>
          <CameraAltRoundedIcon sx={{ fontSize: 40, opacity: 0.6 }} />
          <Typography variant="body2">{emptyLabel}</Typography>
        </Box>
      )}

      {isEditing && originalSrc && <SnapshotMarkup src={originalSrc} initialShapes={shapes} onCancel={onCancelEdit} onDone={onFinishEdit} />}

      <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, p: 1.25, pointerEvents: 'none' }}>
        {showImage ? (
          <Box
            sx={{
              ...overlayControlSx,
              px: 1.5,
              borderRadius: '10px',
              fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 14,
              fontWeight: 500,
              letterSpacing: '0.02em',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            {stamp}
          </Box>
        ) : (
          <span />
        )}
        {showToggle ? (
          <Box sx={{ ...overlayControlSx, px: 0.75, pointerEvents: 'auto' }}>
            <Switch
              checked={checked}
              color="success"
              disabled={snapshot.mode !== 'toggle'}
              onChange={snapshot.mode === 'toggle' ? (_, value) => snapshot.onChange(value) : undefined}
              sx={smallSwitchSx}
              slotProps={{ input: { 'aria-label': 'Attach snapshot to this ticket' } }}
            />
          </Box>
        ) : (
          <span />
        )}
      </Box>

      {showImage && !isEditing && (
        <>
          <Box
            sx={{
              ...overlayControlSx,
              position: 'absolute',
              left: 12,
              bottom: 12,
              maxWidth: 'calc(100% - 140px)',
              px: 1.75,
              height: 40,
              borderRadius: '10px',
              fontSize: 15,
              fontWeight: 500,
            }}
          >
            <Typography noWrap component="span" sx={{ fontSize: 'inherit', fontWeight: 'inherit' }}>
              {cameraName}
            </Typography>
          </Box>
          <Box sx={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', gap: 1 }}>
            {Boolean(originalSrc) && (
              <Tooltip title="Mark up snapshot">
                <IconButton onClick={onStartEdit} aria-label="Mark up snapshot" sx={overlayButtonSx}>
                  <EditRoundedIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Fullscreen">
              <IconButton onClick={onExpand} aria-label="View snapshot fullscreen" sx={overlayButtonSx}>
                <FullscreenRoundedIcon sx={{ fontSize: 22 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </>
      )}
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
  onMarkupChange,
  onSnapshotClick,
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
  const attachments = useAttachments()
  const [attachAnchor, setAttachAnchor] = useState<HTMLElement | null>(null)
  const [previewing, setPreviewing] = useState<Attachment | null>(null)
  const [editing, setEditing] = useState(false)
  const [shapes, setShapes] = useState<MarkupShape[]>([])
  const [markedImage, setMarkedImage] = useState<string | null>(null)
  const [stamp] = useState(() => snapshotStamp(new Date()))
  const titleInvalid = touched && !title.trim()
  const menuProps = { sx: { zIndex: (t: Theme) => t.zIndex.modal + 10 } }
  const snapshotOn = snapshot.mode === 'toggle' ? snapshot.checked : snapshot.mode === 'locked-on'
  const displaySrc = markedImage ?? snapshotPreview
  const canExpand = snapshotOn && Boolean(displaySrc)

  const finishMarkup = (next: MarkupShape[], image: string | null) => {
    const marked = next.length > 0 ? image : null
    setShapes(next)
    setMarkedImage(marked)
    onMarkupChange?.(marked)
    setEditing(false)
  }

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
      <DialogTitle component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1.75, pt: 2.5, pb: 1.5, px: { xs: 2, sm: 3.5 } }}>
        <Box
          aria-hidden
          sx={{ width: 48, height: 48, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '50%', color: 'primary.contrastText', bgcolor: 'primary.main' }}
        >
          <ConfirmationNumberRoundedIcon sx={{ fontSize: 26 }} />
        </Box>
        <Typography component="h2" sx={{ flex: 1, minWidth: 0, fontSize: { xs: 22, sm: 28 }, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          Create Ticket
        </Typography>
        <Tooltip title={context.name} placement="bottom">
          <IconButton
            onClick={() => canExpand && setFullscreen(true)}
            aria-label={`${context.name} camera view`}
            sx={{ width: 44, height: 44, borderRadius: '12px', color: 'primary.main', bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.14) }}
          >
            {context.icon === 'earth' ? <PublicRoundedIcon /> : <CameraAltRoundedIcon />}
          </IconButton>
        </Tooltip>
        <Box aria-hidden sx={{ width: '1px', height: 28, flexShrink: 0, bgcolor: 'divider' }} />
        <IconButton onClick={onClose} aria-label="Close">
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>

      <Tabs
        value={tab}
        onChange={(_, value: TicketTab) => setTab(value)}
        aria-label="Ticket sections"
        sx={{
          mx: { xs: 2, sm: 3.5 },
          borderBottom: 1,
          borderColor: 'divider',
          minHeight: 52,
          '& .MuiTab-root': { minHeight: 52, minWidth: 0, mr: { xs: 1, sm: 4 }, px: 1.5, fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', gap: 1 },
          '& .MuiTab-root .MuiSvgIcon-root': { fontSize: 22 },
          '& .MuiTabs-indicator': { height: 3, borderRadius: 3 },
        }}
      >
        <Tab value="general" id={tabId('general')} aria-controls={`${uid}-panel`} icon={<DescriptionRoundedIcon />} iconPosition="start" label="General" />
        <Tab value="additional" id={tabId('additional')} aria-controls={`${uid}-panel`} icon={<PlaceRoundedIcon />} iconPosition="start" label="Additional" />
        <Tab value="activity" id={tabId('activity')} aria-controls={`${uid}-panel`} icon={<HistoryRoundedIcon />} iconPosition="start" label="Activity" />
      </Tabs>

      <DialogContent id={`${uid}-panel`} role="tabpanel" aria-labelledby={tabId(tab)} sx={{ p: { xs: 2, sm: 3.5 } }}>
        {tab === 'general' && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: { xs: 3, md: 4 }, alignItems: 'stretch', pt: 0.5 }}>
            <Stack spacing={3}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <TextField
                    variant="outlined"
                    id={`${uid}-title`}
                    label="Title"
                    fullWidth
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
                        width: 48,
                        height: 48,
                        flexShrink: 0,
                        color: 'primary.main',
                        bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.16),
                        '&:hover': { bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.26) },
                        ...(voice === 'listening' && {
                          animation: 'voicePulse 1.2s ease-out infinite',
                          '@keyframes voicePulse': {
                            '0%': { boxShadow: (t: Theme) => `0 0 0 0 ${alpha(t.palette.primary.main, 0.55)}` },
                            '100%': { boxShadow: (t: Theme) => `0 0 0 10px ${alpha(t.palette.primary.main, 0)}` },
                          },
                        }),
                      }}
                    >
                      {voice === 'idle' ? <MicRoundedIcon /> : <StopRoundedIcon />}
                    </IconButton>
                  </Tooltip>
                </Box>
                {voice !== 'idle' && (
                  <Typography role="status" variant="caption" color="text.secondary" component="div" sx={{ mt: 0.75, mx: 0.5 }}>
                    {voice === 'listening' ? 'Listening…' : `“${VOICE_SAMPLE.transcript}”`}
                  </Typography>
                )}
              </Box>

              <Box sx={{ position: 'relative' }}>
                <TextField
                  variant="outlined"
                  id={`${uid}-description`}
                  label="Description"
                  fullWidth
                  placeholder="Enter detailed description of the issue..."
                  value={description}
                  onChange={(e) => onDescriptionChange(e.target.value)}
                  multiline
                  minRows={5}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { style: { paddingBottom: 28 } } }}
                  sx={fieldSx}
                />
                <Tooltip title="Attach files">
                  <IconButton
                    onClick={(e) => setAttachAnchor(e.currentTarget)}
                    aria-label={attachments.items.length > 0 ? `Attachments (${attachments.items.length})` : 'Attach files'}
                    sx={{ position: 'absolute', right: 10, bottom: 8, color: 'text.secondary' }}
                  >
                    <Badge badgeContent={attachments.items.length} color="error" overlap="circular">
                      <AttachFileRoundedIcon sx={{ transform: 'rotate(45deg)' }} />
                    </Badge>
                  </IconButton>
                </Tooltip>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
                <FormControl fullWidth sx={fieldSx}>
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

                <FormControl fullWidth sx={fieldSx}>
                  <Select
                    value={assignee}
                    onChange={(e) => onAssigneeChange(e.target.value)}
                    MenuProps={menuProps}
                    inputProps={{ 'aria-label': 'Assignee' }}
                    renderValue={(value) => <AssigneeOption name={value} />}
                  >
                    {ASSIGNEES.map((person) => (
                      <MenuItem key={person} value={person}>
                        <AssigneeOption name={person} />
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
            </Stack>

            <SnapshotPanel
              snapshot={snapshot}
              originalSrc={snapshotPreview}
              displaySrc={displaySrc}
              cameraName={context.name}
              stamp={stamp}
              editing={editing}
              shapes={shapes}
              onStartEdit={() => setEditing(true)}
              onCancelEdit={() => setEditing(false)}
              onFinishEdit={finishMarkup}
              onExpand={() => setFullscreen(true)}
              onSnapshotClick={onSnapshotClick}
            />
          </Box>
        )}

        {tab === 'additional' && (
          <Stack spacing={2.5} sx={{ maxWidth: 560, pt: 0.5 }}>
            <TextField
              variant="outlined"
              id={`${uid}-coordinates`}
              label={coordinates.label}
             
              fullWidth
              value={coordinates.value}
              slotProps={{ htmlInput: { readOnly: true } }}
              sx={fieldSx}
            />
            <TextField variant="outlined" id={`${uid}-reporter`} label="Reporter" fullWidth value={reporter} slotProps={{ htmlInput: { readOnly: true } }} sx={fieldSx} />
            <TextField
              variant="outlined"
              id={`${uid}-system`}
              label="Inspection Management System"
             
              fullWidth
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

      <DialogActions sx={{ px: { xs: 2, sm: 3.5 }, py: 2.25, gap: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <Button type="button" variant="outlined" color="inherit" onClick={onClose} disabled={isSubmitting} sx={{ borderRadius: 999, minWidth: 120, py: 1.1, fontWeight: 700, fontSize: 16, borderColor: (t: Theme) => alpha(t.palette.text.primary, 0.34) }}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={isSubmitting} sx={{ borderRadius: 999, minWidth: 170, py: 1.1, fontWeight: 700, fontSize: 16 }}>
          {isSubmitting ? 'Creating…' : 'Create Ticket'}
        </Button>
      </DialogActions>

      <AttachmentPopover
        anchorEl={attachAnchor}
        onClose={() => setAttachAnchor(null)}
        attachments={attachments}
        onPreview={(item) => setPreviewing(item)}
      />
      <DocumentPreview attachment={previewing} onClose={() => setPreviewing(null)} />

      <Dialog
        open={fullscreen && canExpand}
        onClose={() => setFullscreen(false)}
        maxWidth="xl"
        fullWidth
        sx={{ zIndex: (t: Theme) => t.zIndex.modal + 20 }}
        slotProps={{
          backdrop: { sx: { bgcolor: 'rgba(3, 7, 18, 0.78)', backdropFilter: 'blur(5px)' } },
          paper: { sx: { width: 'min(96vw, 1500px)', height: 'min(92vh, 960px)', maxWidth: 'none', overflow: 'hidden', borderRadius: { xs: 1.5, sm: 2.5 }, bgcolor: '#080c14', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 24px 80px rgba(0,0,0,0.55)' } },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 0.75, minHeight: 48, color: '#fff', bgcolor: 'rgba(14, 20, 32, 0.96)', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Snapshot preview</Typography>
          <IconButton onClick={() => setFullscreen(false)} aria-label="Close fullscreen snapshot" sx={{ color: '#fff' }}>
            <CloseRoundedIcon />
          </IconButton>
        </Box>
        <Box sx={{ position: 'relative', flex: 1, minHeight: 0, p: { xs: 0.75, sm: 1.5 }, bgcolor: '#000' }}>
          {snapshotOn && displaySrc ? (
            <SnapshotMarkup
              src={snapshotPreview ?? displaySrc}
              initialShapes={shapes}
              defaultCollapsed
              onCancel={() => setFullscreen(false)}
              onDone={(next, image) => { finishMarkup(next, image); setFullscreen(false) }}
            />
          ) : (
            <Box component="img" src={displaySrc ?? undefined} alt="Snapshot of the current camera view" sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          )}
        </Box>
      </Dialog>
    </Box>
  )
}

function PriorityOption({ priority }: { priority: TicketPriority }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <Box aria-hidden sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: PRIORITY_COLOR[priority], flexShrink: 0 }} />
      <Typography component="span" sx={{ fontSize: 16, fontWeight: 500 }}>
        {PRIORITY_LABEL[priority]}
      </Typography>
    </Box>
  )
}

function AssigneeOption({ name }: { name: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <Box aria-hidden sx={{ width: 32, height: 32, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '50%', color: 'primary.main', bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.16) }}>
        <PersonRoundedIcon sx={{ fontSize: 20 }} />
      </Box>
      <Typography component="span" sx={{ fontSize: 16, fontWeight: 500 }}>
        {name}
      </Typography>
    </Box>
  )
}
