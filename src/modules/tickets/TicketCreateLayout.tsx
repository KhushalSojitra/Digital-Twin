import { useId, useState, type FormEvent, type ReactNode } from 'react'
import {
  alpha,
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import MicNoneRoundedIcon from '@mui/icons-material/MicNoneRounded'
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded'
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded'
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import { ASSIGNEES, PRIORITY_COLOR, PRIORITY_LABEL, type TicketPriority } from '../../data/tickets'

type TicketTab = 'general' | 'additional' | 'activity'

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

const fieldSx = {
  '& .MuiInputBase-root': {
    borderRadius: 2,
    minHeight: 42,
    fontSize: 14,
    bgcolor: (t: Theme) => alpha(t.palette.text.primary, 0.04),
  },
  '& .MuiOutlinedInput-notchedOutline': {
    borderWidth: 1.5,
    borderColor: (t: Theme) => alpha(t.palette.text.primary, 0.34),
  },
  '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: (t: Theme) => alpha(t.palette.text.primary, 0.6),
  },
  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main', borderWidth: 2 },
  '& .MuiOutlinedInput-root.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: 'error.main' },
  '& .MuiFormHelperText-root': { mx: 0.25 },
}

const tabSx = {
  px: { xs: 1, sm: 2.25 },
  borderBottom: 1,
  borderColor: 'divider',
  minHeight: 56,
  '& .MuiTab-root': { minHeight: 56, alignItems: 'center', textTransform: 'none', px: 1.5 },
}

function IconTile({ children, size = 36, solid = false }: { children: ReactNode; size?: number; solid?: boolean }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 2,
        color: solid ? 'primary.contrastText' : 'primary.main',
        bgcolor: solid ? 'primary.main' : (t: Theme) => alpha(t.palette.primary.main, 0.14),
        '& svg': { fontSize: size * 0.56 },
      }}
    >
      {children}
    </Box>
  )
}

function FieldRow({
  label,
  labelId,
  htmlFor,
  action,
  children,
}: {
  label: string
  labelId: string
  htmlFor?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, minHeight: action ? 36 : 24, mb: 0.5 }}>
        <Typography id={labelId} component="label" htmlFor={htmlFor} sx={{ fontSize: 14, fontWeight: 700 }}>
          {label}
        </Typography>
        {action}
      </Box>
      {children}
    </Box>
  )
}

function ContextBadge({ context }: { context: TicketCreateContext }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
      <IconTile size={40}>{context.icon === 'earth' ? <PublicRoundedIcon /> : <CameraAltRoundedIcon />}</IconTile>
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: 15, fontWeight: 800, lineHeight: 1.25 }}>
          {context.name}
        </Typography>
        <Typography noWrap variant="caption" color="text.secondary" component="div">
          {context.subtitle}
        </Typography>
      </Box>
    </Box>
  )
}

function SnapshotCard({ snapshot, previewSrc }: { snapshot: SnapshotControl; previewSrc?: string | null }) {
  const checked = snapshot.mode === 'toggle' ? snapshot.checked : snapshot.mode === 'locked-on'
  const disabled = snapshot.mode !== 'toggle'
  const note =
    snapshot.mode === 'unavailable'
      ? 'Snapshots are not captured for tickets raised on Earth.'
      : snapshot.mode === 'locked-on'
        ? 'Your ticketing policy always captures the current camera view when the ticket is created.'
        : snapshot.mode === 'locked-off'
          ? 'Snapshot capture is turned off by your ticketing policy.'
          : checked
            ? 'Current camera view will be captured when you create the ticket.'
            : 'No snapshot will be attached to this ticket.'
  return (
    <Box
      sx={{
        p: 1.75,
        border: 1,
        borderColor: (t: Theme) => alpha(t.palette.primary.main, 0.35),
        borderRadius: 3,
        bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.07),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <IconTile>
          <CameraAltRoundedIcon />
        </IconTile>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography id="snapshot-proof-label" sx={{ fontSize: 14, fontWeight: 800 }}>
            Capture Snapshot as Proof
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            Save current camera view as evidence for this ticket
          </Typography>
        </Box>
        <Switch
          checked={checked}
          disabled={disabled}
          onChange={snapshot.mode === 'toggle' ? (_, value) => snapshot.onChange(value) : undefined}
          slotProps={{ input: { 'aria-labelledby': 'snapshot-proof-label' } }}
        />
      </Box>
      {checked && previewSrc ? (
        <Box
          component="img"
          src={previewSrc}
          alt="Snapshot of the current camera view that will be attached to this ticket"
          sx={{
            mt: 1.5,
            display: 'block',
            width: '100%',
            aspectRatio: '16 / 10',
            objectFit: 'cover',
            borderRadius: 2,
            border: 1,
            borderColor: (t: Theme) => alpha(t.palette.primary.main, 0.45),
          }}
        />
      ) : (
        <Box
          sx={{
            mt: 1.5,
            p: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            border: '1.5px dashed',
            borderColor: (t: Theme) => alpha(t.palette.primary.main, 0.45),
            borderRadius: 2,
            opacity: checked ? 1 : 0.7,
          }}
        >
          <CameraAltRoundedIcon sx={{ color: 'text.secondary', fontSize: 28, flexShrink: 0 }} />
          <Typography variant="body2" color="text.secondary">
            {note}
          </Typography>
        </Box>
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

function TabLabel({ icon, title, caption }: { icon: ReactNode; title: string; caption: string }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, textAlign: 'left' }}>
      <Box sx={{ display: 'grid', placeItems: 'center', '& svg': { fontSize: 22 } }}>{icon}</Box>
      <Box>
        <Typography component="div" sx={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.3 }}>
          {title}
        </Typography>
        <Typography component="div" sx={{ display: { xs: 'none', md: 'block' }, fontSize: 12, fontWeight: 500, color: 'text.secondary', lineHeight: 1.3 }}>
          {caption}
        </Typography>
      </Box>
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
  const titleInvalid = touched && !title.trim()
  const menuProps = { sx: { zIndex: (t: Theme) => t.zIndex.modal + 10 } }

  const handleSubmit = (e: FormEvent) => {
    if (!title.trim()) setTab('general')
    onSubmit(e)
  }

  const tabId = (value: TicketTab) => `${uid}-tab-${value}`

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <DialogTitle component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2, px: { xs: 2, sm: 2.75 } }}>
        <IconTile size={48} solid>
          <ConfirmationNumberRoundedIcon />
        </IconTile>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" sx={{ fontSize: { xs: 22, sm: 26 }, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            Create Ticket
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            Report an issue, assign it to the right person and track it to closure.
          </Typography>
        </Box>
        <Box sx={{ display: { xs: 'none', sm: 'flex' }, pl: 2, borderLeft: 1, borderColor: 'divider', minWidth: 0, maxWidth: '38%' }}>
          <ContextBadge context={context} />
        </Box>
        <IconButton size="small" onClick={onClose} aria-label="Close" sx={{ alignSelf: 'flex-start' }}>
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <Box sx={{ display: { xs: 'flex', sm: 'none' }, px: 2, pb: 1.5 }}>
        <ContextBadge context={context} />
      </Box>

      <Tabs value={tab} onChange={(_, value: TicketTab) => setTab(value)} variant="fullWidth" aria-label="Ticket sections" sx={tabSx}>
        <Tab
          value="general"
          id={tabId('general')}
          aria-controls={`${uid}-panel`}
          label={<TabLabel icon={<DescriptionRoundedIcon />} title="General" caption="Basic ticket details" />}
        />
        <Tab
          value="additional"
          id={tabId('additional')}
          aria-controls={`${uid}-panel`}
          label={<TabLabel icon={<PlaceRoundedIcon />} title="Additional" caption="Location, reporter and system" />}
        />
        <Tab
          value="activity"
          id={tabId('activity')}
          aria-controls={`${uid}-panel`}
          label={<TabLabel icon={<HistoryRoundedIcon />} title="Activity" caption="State history and updates" />}
        />
      </Tabs>

      <DialogContent
        id={`${uid}-panel`}
        role="tabpanel"
        aria-labelledby={tabId(tab)}
        sx={{ p: { xs: 2, sm: 2.75 }, bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.03) }}
      >
        {tab === 'general' && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.45fr) minmax(0, 1fr)' }, gap: 3, alignItems: 'start' }}>
            <Stack spacing={2.25}>
              <FieldRow
                label="Title"
                labelId={`${uid}-title-label`}
                htmlFor={`${uid}-title`}
                action={
                  <Tooltip title="Click to speak. AI can fill ticket details automatically." describeChild>
                    <Button
                      type="button"
                      size="small"
                      variant="outlined"
                      startIcon={<MicNoneRoundedIcon />}
                      sx={{ borderRadius: 999, textTransform: 'none', fontWeight: 700, py: 0.25, px: 1.5, whiteSpace: 'nowrap' }}
                    >
                      Use Voice Input
                    </Button>
                  </Tooltip>
                }
              >
                <TextField
                  variant="outlined"
                  id={`${uid}-title`}
                  fullWidth
                  size="small"
                  placeholder="Enter ticket title..."
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  error={titleInvalid}
                  helperText={titleInvalid ? 'Title is required' : undefined}
                  required
                  sx={fieldSx}
                />
              </FieldRow>

              <FieldRow label="Description" labelId={`${uid}-description-label`} htmlFor={`${uid}-description`}>
                <TextField
                  variant="outlined"
                  id={`${uid}-description`}
                  fullWidth
                  size="small"
                  placeholder="Enter detailed description of the issue..."
                  value={description}
                  onChange={(e) => onDescriptionChange(e.target.value)}
                  multiline
                  minRows={4}
                  sx={fieldSx}
                />
              </FieldRow>

              <FieldRow label="Priority" labelId={`${uid}-priority-label`}>
                <Select
                  fullWidth
                  size="small"
                  labelId={`${uid}-priority-label`}
                  value={priority}
                  onChange={(e) => onPriorityChange(e.target.value as TicketPriority)}
                  MenuProps={menuProps}
                  sx={fieldSx}
                  renderValue={(value) => <PriorityOption priority={value as TicketPriority} />}
                >
                  {(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((p) => (
                    <MenuItem key={p} value={p}>
                      <PriorityOption priority={p} />
                    </MenuItem>
                  ))}
                </Select>
              </FieldRow>

              <FieldRow label="Assignee" labelId={`${uid}-assignee-label`}>
                <Select
                  fullWidth
                  size="small"
                  labelId={`${uid}-assignee-label`}
                  value={assignee}
                  onChange={(e) => onAssigneeChange(e.target.value)}
                  MenuProps={menuProps}
                  sx={fieldSx}
                >
                  {ASSIGNEES.map((person) => (
                    <MenuItem key={person} value={person}>
                      {person}
                    </MenuItem>
                  ))}
                </Select>
              </FieldRow>
            </Stack>

            <SnapshotCard snapshot={snapshot} previewSrc={snapshotPreview} />
          </Box>
        )}

        {tab === 'additional' && (
          <Stack spacing={2.25} sx={{ maxWidth: 560 }}>
            <FieldRow label={coordinates.label} labelId={`${uid}-coordinates-label`} htmlFor={`${uid}-coordinates`}>
              <TextField
                variant="outlined"
                id={`${uid}-coordinates`}
                fullWidth
                size="small"
                value={coordinates.value}
                helperText={coordinates.hint}
                slotProps={{ htmlInput: { readOnly: true } }}
                sx={fieldSx}
              />
            </FieldRow>
            <FieldRow label="Reporter" labelId={`${uid}-reporter-label`} htmlFor={`${uid}-reporter`}>
              <TextField variant="outlined" id={`${uid}-reporter`} fullWidth size="small" value={reporter} slotProps={{ htmlInput: { readOnly: true } }} sx={fieldSx} />
            </FieldRow>
            <FieldRow label="Inspection Management System" labelId={`${uid}-system-label`} htmlFor={`${uid}-system`}>
              <TextField variant="outlined" id={`${uid}-system`} fullWidth size="small" value={system} slotProps={{ htmlInput: { readOnly: true } }} sx={fieldSx} />
            </FieldRow>
          </Stack>
        )}

        {tab === 'activity' && (
          <Box sx={{ maxWidth: 560 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              History starts when the ticket is created.
            </Typography>
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
