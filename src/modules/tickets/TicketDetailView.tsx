import { useId, useMemo, useState } from 'react'
import {
  alpha,
  Box,
  Button,
  Dialog,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  type Theme,
} from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded'
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined'
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined'
import TuneRoundedIcon from '@mui/icons-material/TuneRounded'
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded'
import CameraAltRoundedIcon from '@mui/icons-material/CameraAltRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import {
  LIFECYCLE_COLOR,
  LIFECYCLE_LABEL,
  NEXT_STATES,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  TICKETING_SYSTEM,
  TICKET_SOURCE_LABEL,
  isCompleted,
  siteName,
  snapshotMatchesTicket,
  ticketContextLabel,
  type Snapshot,
  type Ticket,
  type TicketPriority,
} from '../../data/tickets'
import { formatDateTime } from '../../utils/format'
import { useTickets } from '../../state/TicketsContext'
import TicketActivity from './TicketActivity'
import TicketCommentThread from './TicketCommentThread'
import TicketTeamPanel from './TicketTeamPanel'
import ImprovementVerification from './ImprovementVerification'
import SnapshotMarkup, { type MarkupShape } from './SnapshotMarkup'
import { fieldSx } from './TicketCreateLayout'
import { BREACH_OPTIONS } from './TicketAdditionalTab'

export type DetailTab = 'snapshot' | 'team' | 'additional' | 'comments' | 'activity'

interface Props {
  ticket: Ticket
  me: string
  canEdit: boolean
  canChangeState: boolean
  editing: boolean
  initialTab: DetailTab
  onClose: () => void
  onOpenCamera?: (ticket: Ticket) => void
}

const menuZ = (t: { zIndex: { modal: number } }) => t.zIndex.modal + 10
const menuProps = { sx: { zIndex: menuZ } }
const DEFAULT_DUE_TIME = '18:00'

const overlayButtonSx = {
  width: 40,
  height: 40,
  borderRadius: '10px',
  color: '#fff',
  bgcolor: 'rgba(8, 12, 20, 0.5)',
  backdropFilter: 'blur(6px)',
  '&:hover': { bgcolor: 'rgba(8, 12, 20, 0.65)' },
}

function Dot({ color, ring }: { color: string; ring?: boolean }) {
  return (
    <Box
      sx={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        flexShrink: 0,
        ...(ring ? { border: `2px solid ${color}` } : { bgcolor: color }),
      }}
    />
  )
}

function formatDueDate(value: string) {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}-${month}-${year}` : value
}

function SnapshotPanel({
  ticket,
  editing,
  draft,
  onDraft,
}: {
  ticket: Ticket
  editing: boolean
  draft: Snapshot | null
  onDraft: (snapshot: Snapshot) => void
}) {
  const storedBefore = snapshotMatchesTicket(ticket, ticket.snapshots.before) ? ticket.snapshots.before : undefined
  const before = draft ?? storedBefore
  const after = snapshotMatchesTicket(ticket, ticket.snapshots.after) ? ticket.snapshots.after : undefined
  const frames = [
    before && { key: 'before', label: 'Creation', shot: before },
    after && { key: 'after', label: 'Completion', shot: after },
  ].filter(Boolean) as { key: string; label: string; shot: Snapshot }[]
  const [selected, setSelected] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const [marking, setMarking] = useState(false)

  if (isCompleted(ticket)) return <ImprovementVerification ticket={ticket} />

  const current = frames[Math.min(selected, frames.length - 1)]
  if (!current) {
    return (
      <Box
        sx={(t) => ({
          flex: 1,
          minHeight: 220,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          border: `1px dashed ${t.palette.divider}`,
          borderRadius: '16px',
        })}
      >
        <ImageOutlinedIcon sx={{ fontSize: 30, color: 'text.disabled' }} />
        <Typography sx={{ fontWeight: 600 }}>No snapshot captured</Typography>
      </Box>
    )
  }

  const isCreation = current.key === 'before'
  const canMark = editing && isCreation && !marking
  const base = current.shot.original ?? current.shot.src

  const finishMarkup = (shapes: MarkupShape[], image: string | null) => {
    const { original, markup, ...rest } = current.shot
    void markup
    if (shapes.length > 0 && image) {
      onDraft({ ...rest, src: image, original: original ?? rest.src, markup: shapes })
    } else {
      onDraft({ ...rest, src: original ?? rest.src })
    }
    setMarking(false)
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box
        sx={(t) => ({
          position: 'relative',
          flex: 1,
          minHeight: 240,
          overflow: 'hidden',
          borderRadius: '16px',
          bgcolor: alpha(t.palette.text.primary, 0.08),
        })}
      >
        <Box
          component="img"
          src={marking ? base : current.shot.src}
          alt={`${current.label} snapshot`}
          onClick={() => !marking && setZoomed(true)}
          sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', cursor: marking ? 'default' : 'zoom-in' }}
        />
        {marking && <SnapshotMarkup src={base} initialShapes={(current.shot.markup as MarkupShape[] | undefined) ?? []} onCancel={() => setMarking(false)} onDone={finishMarkup} />}
        {!marking && (
          <Typography
            component="span"
            sx={{
              position: 'absolute',
              left: 12,
              top: 12,
              px: 1.5,
              py: 0.75,
              borderRadius: '10px',
              fontSize: 14,
              fontWeight: 500,
              lineHeight: 1.3,
              color: '#fff',
              bgcolor: 'rgba(8, 12, 20, 0.5)',
              backdropFilter: 'blur(6px)',
            }}
          >
            {formatDateTime(current.shot.at)}
          </Typography>
        )}
        {canMark && (
          <Tooltip title="Mark up snapshot">
            <IconButton onClick={() => setMarking(true)} aria-label="Mark up snapshot" sx={{ ...overlayButtonSx, position: 'absolute', right: 12, bottom: 12 }}>
              <EditRoundedIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      {frames.length > 1 && (
        <Stack direction="row" spacing={1}>
          {frames.map((f, i) => (
            <Box
              key={f.key}
              component="button"
              type="button"
              onClick={() => {
                setSelected(i)
                setMarking(false)
              }}
              aria-label={`Show ${f.label.toLowerCase()} snapshot`}
              aria-pressed={i === selected}
              sx={(t) => ({
                p: 0,
                width: 96,
                lineHeight: 0,
                cursor: 'pointer',
                bgcolor: 'transparent',
                borderRadius: '8px',
                overflow: 'hidden',
                border: `2px solid ${i === selected ? t.palette.primary.main : t.palette.divider}`,
              })}
            >
              <Box component="img" src={f.shot.src} alt="" sx={{ width: '100%', aspectRatio: '8 / 5', objectFit: 'cover' }} />
            </Box>
          ))}
        </Stack>
      )}
      <Dialog open={zoomed} onClose={() => setZoomed(false)} maxWidth="lg" fullWidth sx={{ zIndex: (t) => t.zIndex.modal + 10 }}>
        <Box component="img" src={current.shot.src} alt={`${current.label} snapshot`} sx={{ width: '100%', display: 'block' }} />
      </Dialog>
    </Box>
  )
}

function ReadField({ label, value, copy, multiline }: { label: string; value: string; copy?: boolean; multiline?: boolean }) {
  return (
    <TextField
      label={label}
      value={value}
      fullWidth
      multiline={multiline}
      slotProps={{
        inputLabel: { shrink: true },
        input: {
          readOnly: true,
          endAdornment: copy ? (
            <InputAdornment position="end">
              <Tooltip title="Copy">
                <IconButton size="small" aria-label={`Copy ${label}`} onClick={() => void navigator.clipboard?.writeText(value)}>
                  <ContentCopyRoundedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </InputAdornment>
          ) : undefined,
        },
      }}
      sx={fieldSx}
    />
  )
}

function AdditionalPanel({ ticket }: { ticket: Ticket }) {
  const coords = ticket.cameraId
    ? `P ${ticket.yaw.toFixed(1)}° · T ${ticket.pitch.toFixed(1)}° · Z ${ticket.zoom.toFixed(1)}×`
    : `${ticket.lat.toFixed(5)}, ${ticket.lng.toFixed(5)}`
  const site = ticket.siteId ? siteName(ticket.siteId) : ''
  const breach = BREACH_OPTIONS.find((o) => o.value === ticket.additional?.onBreach)?.label
  const links = ticket.additional?.links ?? []
  const relationLabel = (relation: string) => (relation === 'blocks' ? 'Blocks this ticket' : relation === 'blocked_by' ? 'Blocked by this ticket' : '')

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 3, pt: 1 }}>
      <ReadField label="Source" value={TICKET_SOURCE_LABEL[ticket.source]} />
      {ticket.cameraId && <ReadField label="Camera Name" value={ticketContextLabel(ticket)} />}
      {site && <ReadField label="Site" value={site} />}
      {ticket.zone && <ReadField label="Zone" value={ticket.zone} />}
      <ReadField label={ticket.cameraId ? 'Pin Orientation' : 'Coordinates'} value={coords} copy />
      <ReadField label="Reporter" value={ticket.creator} />
      <ReadField label="Inspection Management System" value={ticket.platformName ?? TICKETING_SYSTEM} />
      <ReadField label="Created" value={formatDateTime(ticket.createdAt)} />
      <ReadField label="Completed" value={ticket.completedAt ? formatDateTime(ticket.completedAt) : '—'} />
      {breach && <ReadField label="On Breach" value={breach} />}
      {links.length > 0 && (
        <ReadField
          label="Ticket Dependencies"
          multiline
          value={links.map((l) => `${l.title}${relationLabel(l.relation) ? ` — ${relationLabel(l.relation)}` : ''}`).join('\n')}
        />
      )}
    </Box>
  )
}

export default function TicketDetailView({ ticket, me, canEdit, canChangeState, editing, initialTab, onClose, onOpenCamera }: Props) {
  const uid = useId()
  const { transition, updateDetails } = useTickets()
  const [tab, setTab] = useState<DetailTab>(initialTab)
  const [title, setTitle] = useState(ticket.title)
  const [description, setDescription] = useState(ticket.description)
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority)
  const [dueDate, setDueDate] = useState(ticket.additional?.dueDate ?? '')
  const [dueTime, setDueTime] = useState(ticket.additional?.dueTime ?? '')
  const [snapshotDraft, setSnapshotDraft] = useState<Snapshot | null>(null)
  const [statusAnchor, setStatusAnchor] = useState<HTMLElement | null>(null)
  const next = useMemo(() => NEXT_STATES[ticket.status] ?? [], [ticket.status])
  const canTransition = canChangeState && next.length > 0
  const canOpenCamera = Boolean(onOpenCamera && (ticket.cameraId || ticket.siteId))

  const saveDetails = () => {
    if (!title.trim()) return
    updateDetails(
      ticket.id,
      {
        title: title.trim(),
        description: description.trim(),
        priority,
        additional: { onBreach: '', links: [], ...ticket.additional, dueDate, dueTime: dueDate ? dueTime || DEFAULT_DUE_TIME : '' },
        ...(snapshotDraft ? { creationSnapshot: snapshotDraft } : {}),
      },
      me,
    )
  }

  const onDueDateChange = (value: string) => {
    setDueDate(value)
    if (!value) setDueTime('')
    else if (!dueTime) setDueTime(DEFAULT_DUE_TIME)
  }

  const tabId = (value: DetailTab) => `${uid}-tab-${value}`

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75, pt: 2.5, pb: 1.5, px: { xs: 2, sm: 3.5 } }}>
        <Box
          aria-hidden
          sx={{ width: 48, height: 48, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '50%', color: 'primary.contrastText', bgcolor: 'primary.main' }}
        >
          <ConfirmationNumberRoundedIcon sx={{ fontSize: 26 }} />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <TextField
              label="Title"
              fullWidth
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              error={!title.trim()}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'aria-label': 'Title' } }}
              sx={fieldSx}
            />
          ) : (
            <Typography
              component="h2"
              title={ticket.title}
              noWrap
              sx={{ fontSize: { xs: 20, sm: 26 }, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}
            >
              {ticket.title}
            </Typography>
          )}
        </Box>

        {editing ? (
          <TextField
            select
            label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TicketPriority)}
            slotProps={{ inputLabel: { shrink: true }, select: { MenuProps: menuProps } }}
            sx={{ ...fieldSx, minWidth: 130 }}
          >
            {(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((p) => (
              <MenuItem key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <Stack
            direction="row"
            spacing={0.9}
            sx={{
              alignItems: 'center',
              px: 1.5,
              height: 40,
              flexShrink: 0,
              borderRadius: '10px',
              border: `1px solid ${PRIORITY_COLOR[priority]}55`,
              bgcolor: `${PRIORITY_COLOR[priority]}22`,
            }}
          >
            <Dot color={PRIORITY_COLOR[priority]} />
            <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{PRIORITY_LABEL[priority]}</Typography>
          </Stack>
        )}

        <Button
          variant="outlined"
          color="inherit"
          disabled={!canTransition}
          onClick={(e) => setStatusAnchor(e.currentTarget)}
          aria-haspopup="menu"
          aria-label={`Status ${STATUS_LABEL[ticket.status]}${canTransition ? ', change status' : ''}`}
          endIcon={canTransition ? <KeyboardArrowDownRoundedIcon /> : undefined}
          startIcon={<Dot color={STATUS_COLOR[ticket.status]} ring />}
          sx={(t) => ({
            height: 40,
            flexShrink: 0,
            borderRadius: '10px',
            textTransform: 'none',
            fontWeight: 600,
            borderColor: t.palette.divider,
            '&.Mui-disabled': { color: t.palette.text.primary, borderColor: t.palette.divider },
          })}
        >
          {STATUS_LABEL[ticket.status]}
        </Button>
        <Menu open={Boolean(statusAnchor)} anchorEl={statusAnchor} onClose={() => setStatusAnchor(null)} sx={{ zIndex: menuZ }}>
          {next.map((state) => (
            <MenuItem
              key={state}
              dense
              onClick={() => {
                setStatusAnchor(null)
                transition(ticket.id, state, { by: me })
              }}
            >
              <Box sx={{ mr: 1 }}>
                <Dot color={LIFECYCLE_COLOR[state]} />
              </Box>
              {LIFECYCLE_LABEL[state]}
            </MenuItem>
          ))}
        </Menu>

        {canOpenCamera && (
          <Tooltip title="Open camera live view" placement="bottom">
            <IconButton
              onClick={() => onOpenCamera?.(ticket)}
              aria-label="Open camera live view"
              sx={{ width: 44, height: 44, flexShrink: 0, borderRadius: '12px', color: 'primary.main', bgcolor: (t: Theme) => alpha(t.palette.primary.main, 0.14) }}
            >
              <CameraAltRoundedIcon />
            </IconButton>
          </Tooltip>
        )}
        <Box aria-hidden sx={{ width: '1px', height: 28, flexShrink: 0, bgcolor: 'divider' }} />
        <IconButton onClick={onClose} aria-label="Close">
          <CloseRoundedIcon />
        </IconButton>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, px: { xs: 2, sm: 3.5 }, pt: 1.25, pb: 0.5, flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
        <TextField
          label="Description"
          multiline
          minRows={2}
          maxRows={2}
          fullWidth
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          slotProps={{ input: { readOnly: !editing }, inputLabel: { shrink: true } }}
          sx={{ ...fieldSx, flex: '1 1 260px', minWidth: 0 }}
        />
        {editing ? (
          <>
            <TextField
              label="Due Date"
              type="date"
              value={dueDate}
              onChange={(e) => onDueDateChange(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ ...fieldSx, width: 172, flexShrink: 0, '& input': { colorScheme: (t: Theme) => t.palette.mode } }}
            />
            <TextField
              label="Due Time"
              type="time"
              value={dueTime}
              disabled={!dueDate}
              onChange={(e) => setDueTime(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ ...fieldSx, width: 132, flexShrink: 0, '& input': { colorScheme: (t: Theme) => t.palette.mode } }}
            />
          </>
        ) : (
          <>
            <TextField
              label="Due Date"
              value={dueDate ? formatDueDate(dueDate) : '—'}
              slotProps={{ input: { readOnly: true }, inputLabel: { shrink: true } }}
              sx={{ ...fieldSx, width: 172, flexShrink: 0 }}
            />
            <TextField
              label="Due Time"
              value={dueDate && dueTime ? dueTime : '—'}
              slotProps={{ input: { readOnly: true }, inputLabel: { shrink: true } }}
              sx={{ ...fieldSx, width: 132, flexShrink: 0 }}
            />
          </>
        )}
        {editing && canEdit && (
          <Button
            variant="contained"
            onClick={saveDetails}
            disabled={!title.trim()}
            sx={{ flexShrink: 0, height: 56, borderRadius: 999, px: 2.5, fontWeight: 700 }}
          >
            Save details
          </Button>
        )}
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v: DetailTab) => setTab(v)}
        aria-label="Ticket sections"
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          mx: { xs: 2, sm: 3.5 },
          mt: 1,
          borderBottom: 1,
          borderColor: 'divider',
          minHeight: 52,
          '& .MuiTab-root': { minHeight: 52, minWidth: 0, mr: { xs: 1, sm: 4 }, px: 1.5, fontSize: 14, fontWeight: 800, letterSpacing: '0.04em', gap: 1, textTransform: 'none' },
          '& .MuiTab-root .MuiSvgIcon-root': { fontSize: 22 },
          '& .MuiTabs-indicator': { height: 3, borderRadius: 3 },
        }}
      >
        <Tab value="snapshot" id={tabId('snapshot')} aria-controls={`${uid}-panel`} icon={<ImageOutlinedIcon />} iconPosition="start" label="Snapshot" />
        <Tab value="team" id={tabId('team')} aria-controls={`${uid}-panel`} icon={<GroupOutlinedIcon />} iconPosition="start" label="Team" />
        <Tab value="additional" id={tabId('additional')} aria-controls={`${uid}-panel`} icon={<TuneRoundedIcon />} iconPosition="start" label="Additional" />
        <Tab
          value="comments"
          id={tabId('comments')}
          aria-controls={`${uid}-panel`}
          icon={<ChatBubbleOutlineRoundedIcon />}
          iconPosition="start"
          label={`Comments${ticket.comments.length ? ` (${ticket.comments.length})` : ''}`}
        />
        <Tab value="activity" id={tabId('activity')} aria-controls={`${uid}-panel`} icon={<HistoryRoundedIcon />} iconPosition="start" label="Activity" />
      </Tabs>

      <Box
        id={`${uid}-panel`}
        role="tabpanel"
        aria-labelledby={tabId(tab)}
        sx={{ px: { xs: 2, sm: 3.5 }, py: 2, flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
      >
        {tab === 'snapshot' && <SnapshotPanel ticket={ticket} editing={editing && canEdit} draft={snapshotDraft} onDraft={setSnapshotDraft} />}
        {tab === 'team' && <TicketTeamPanel ticket={ticket} me={me} />}
        {tab === 'additional' && <AdditionalPanel ticket={ticket} />}
        {tab === 'comments' && <TicketCommentThread ticket={ticket} me={me} />}
        {tab === 'activity' && <TicketActivity ticket={ticket} />}
      </Box>
    </Box>
  )
}
