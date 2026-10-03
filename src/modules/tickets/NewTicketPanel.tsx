import { useState, type FormEvent } from 'react'
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slide,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded'
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded'
import {
  ASSIGNEES,
  DEFAULT_SNAPSHOT_CONFIG,
  PLATFORM_LABEL,
  PRIORITY_LABEL,
  TYPE_LABEL,
  ZONES,
  type NewTicketInput,
  type TicketPlatform,
  type TicketPriority,
  type TicketType,
  cameraName,
  siteName,
} from '../../data/tickets'
import type { CameraDevice } from '../../data/cameras'
import { useCapture } from './captureContext'
import { useIntegrations } from '../../state/IntegrationsContext'

export interface TicketDraft {
  camera: CameraDevice
  yaw: number
  pitch: number
  /** PTZ optical zoom at the moment the spot was marked. */
  zoom: number
}

interface Props {
  draft: TicketDraft | null
  creator: string
  onSubmit: (input: NewTicketInput) => void
  onCancel: () => void
}

export default function NewTicketPanel({ draft, creator, onSubmit, onCancel }: Props) {
  return (
    <Slide direction="left" in={Boolean(draft)} mountOnEnter unmountOnExit>
      <Paper
        elevation={0}
        square
        role="dialog"
        aria-label="New ticket"
        sx={(t) => ({
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          borderLeft: `1px solid ${t.palette.divider}`,
          bgcolor: t.palette.mode === 'dark' ? '#10141b' : '#ffffff',
        })}
      >
        {draft && (
          <NewTicketForm
            key={`${draft.camera.id}:${draft.yaw}:${draft.pitch}:${draft.zoom}`}
            draft={draft}
            creator={creator}
            onSubmit={onSubmit}
            onCancel={onCancel}
          />
        )}
      </Paper>
    </Slide>
  )
}

function NewTicketForm({ draft, creator, onSubmit, onCancel }: Props & { draft: TicketDraft }) {
  const { defaultIntegration } = useIntegrations()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<TicketType>('intrusion')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [zone, setZone] = useState<string>(defaultZone(draft.camera))
  const [assignee, setAssignee] = useState<string>(ASSIGNEES.includes(creator) ? creator : ASSIGNEES[0])
  // New tickets follow the default platform configured under Administration.
  const [platform, setPlatform] = useState<TicketPlatform>(defaultIntegration.platform)
  const [platformName, setPlatformName] = useState(defaultIntegration.platformName)
  const [snapshots, setSnapshots] = useState({ ...DEFAULT_SNAPSHOT_CONFIG })
  const [touched, setTouched] = useState(false)
  const capture = useCapture()

  const setFlag = (key: keyof typeof snapshots) => (_: unknown, checked: boolean) => setSnapshots((s) => ({ ...s, [key]: checked }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!title.trim()) return
    const src = snapshots.captureCreation ? capture?.(draft.camera.id, { yaw: draft.yaw, pitch: draft.pitch }, 'before') : null
    onSubmit({
      title: title.trim(),
      description: description.trim() || 'Raised from Live View at the marked location.',
      type,
      priority,
      zone,
      assignee,
      creator,
      platform,
      platformName: platformName.trim() || (platform === 'custom' ? 'Custom platform' : undefined),
      snapshotConfig: snapshots,
      creationSnapshot: src ? { src, at: new Date().toISOString(), by: creator, yaw: draft.yaw, pitch: draft.pitch } : undefined,
      cameraId: draft.camera.id,
      yaw: draft.yaw,
      pitch: draft.pitch,
      zoom: draft.zoom,
    })
  }

  return (
    <Box component="form" onSubmit={submit} noValidate sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1.5, py: 1 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>New ticket</Typography>
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={onCancel} aria-label="Cancel new ticket">
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Divider />

      <Stack spacing={1.25} sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 1.5, py: 1.5 }}>
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
          <Chip size="small" icon={<VideocamRoundedIcon />} label={cameraName(draft.camera.id)} sx={{ height: 24, fontSize: 11 }} />
          <Chip size="small" label={siteName(draft.camera.siteId)} sx={{ height: 24, fontSize: 11 }} />
          <Chip
            size="small"
            icon={<PlaceRoundedIcon />}
            label={`P ${draft.yaw.toFixed(1)}° · T ${draft.pitch.toFixed(1)}° · Z ${draft.zoom.toFixed(1)}×`}
            color="primary"
            variant="outlined"
            sx={{ height: 24, fontSize: 11 }}
          />
        </Stack>

        <TextField
          label="Title"
          size="small"
          variant="outlined"
          autoFocus
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={touched && !title.trim()}
          helperText={touched && !title.trim() ? 'Give the ticket a short title.' : undefined}
        />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
          <FormControl size="small">
            <InputLabel id="new-ticket-type">Type</InputLabel>
            <Select labelId="new-ticket-type" label="Type" value={type} onChange={(e) => setType(e.target.value as TicketType)}>
              {(Object.keys(TYPE_LABEL) as TicketType[]).map((t) => (
                <MenuItem key={t} value={t}>
                  {TYPE_LABEL[t]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel id="new-ticket-priority">Priority</InputLabel>
            <Select
              labelId="new-ticket-priority"
              label="Priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
            >
              {(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((p) => (
                <MenuItem key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel id="new-ticket-zone">Zone</InputLabel>
            <Select labelId="new-ticket-zone" label="Zone" value={zone} onChange={(e) => setZone(e.target.value as string)}>
              {ZONES.map((z) => (
                <MenuItem key={z} value={z}>
                  {z}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel id="new-ticket-assignee">Assignee</InputLabel>
            <Select labelId="new-ticket-assignee" label="Assignee" value={assignee} onChange={(e) => setAssignee(e.target.value as string)}>
              {ASSIGNEES.map((a) => (
                <MenuItem key={a} value={a}>
                  {a}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel id="new-ticket-platform">Platform</InputLabel>
            <Select
              labelId="new-ticket-platform"
              label="Platform"
              value={platform}
              onChange={(e) => {
                const next = e.target.value as TicketPlatform
                setPlatform(next)
                // Keep the integration's own name only while its kind stays selected.
                setPlatformName(next === defaultIntegration.platform ? defaultIntegration.platformName : '')
              }}
            >
              {(Object.keys(PLATFORM_LABEL) as TicketPlatform[]).map((p) => (
                <MenuItem key={p} value={p}>
                  {p === defaultIntegration.platform ? defaultIntegration.platformName : PLATFORM_LABEL[p]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {platform === 'custom' && (
            <TextField
              size="small"
              label="Platform name"
              value={platformName}
              onChange={(e) => setPlatformName(e.target.value)}
              placeholder="e.g. Analytics engine"
            />
          )}
        </Box>
        <TextField
          label="Description"
          size="small"
          variant="outlined"
          multiline
          minRows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', mb: 0.25 }}
          >
            Snapshots
          </Typography>
          <Stack>
            <FormControlLabel
              sx={{ '& .MuiFormControlLabel-label': { fontSize: 12.5, ml: 0.5 } }}
              control={<Switch size="small" checked={snapshots.captureCreation} onChange={setFlag('captureCreation')} />}
              label="Capture creation snapshot"
            />
            <FormControlLabel
              sx={{ '& .MuiFormControlLabel-label': { fontSize: 12.5, ml: 0.5 } }}
              control={<Switch size="small" checked={snapshots.captureCompletion} onChange={setFlag('captureCompletion')} />}
              label="Capture completion snapshot"
            />
            <FormControlLabel
              sx={{ '& .MuiFormControlLabel-label': { fontSize: 12.5, ml: 0.5 } }}
              control={<Switch size="small" checked={snapshots.showInImprovementHistory} onChange={setFlag('showInImprovementHistory')} />}
              label="Display in improvement history"
            />
          </Stack>
        </Box>
      </Stack>

      <Divider />
      <Stack direction="row" spacing={1} sx={{ p: 1.5, justifyContent: 'flex-end' }}>
        <Button size="small" variant="text" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="small" variant="contained" type="submit">
          Create ticket
        </Button>
      </Stack>
    </Box>
  )
}

function defaultZone(camera: CameraDevice) {
  const tail = camera.name.split(' — ')[1] ?? ''
  return ZONES.find((z) => z.toLowerCase() === tail.toLowerCase()) ?? ZONES[0]
}
