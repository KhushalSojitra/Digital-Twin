import { useMemo, useState, type ReactNode } from 'react'
import {
  Box,
  Button,
  Dialog,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  Menu,
  MenuItem,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded'
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined'
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined'
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined'
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined'
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import {
  LIFECYCLE_COLOR,
  LIFECYCLE_LABEL,
  NEXT_STATES,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
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

export type DetailTab = 'snapshot' | 'team' | 'camera' | 'comments' | 'activity'

interface Props {
  ticket: Ticket
  me: string
  canEdit: boolean
  canChangeState: boolean
  editing: boolean
  initialTab: DetailTab
  onClose: () => void
}

const menuZ = (t: { zIndex: { modal: number } }) => t.zIndex.modal + 10

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

function Panel({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={(t) => ({
        border: `1px solid ${t.palette.divider}`,
        borderRadius: '12px',
        p: 1.5,
        minWidth: 0,
        bgcolor: t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)',
      })}
    >
      {children}
    </Box>
  )
}

function SnapshotImage({ shot, ticket, label, onZoom }: { shot: Snapshot; ticket: Ticket; label: string; onZoom: () => void }) {
  return (
    <Box sx={{ position: 'relative', lineHeight: 0 }}>
      <Box
        component="img"
        src={shot.src}
        alt={`${label} snapshot for ${ticket.id}`}
        onClick={onZoom}
        sx={(t) => ({
          width: '100%',
          aspectRatio: '8 / 5',
          maxHeight: '48dvh',
          objectFit: 'cover',
          borderRadius: '10px',
          cursor: 'zoom-in',
          border: `1px solid ${t.palette.divider}`,
          bgcolor: '#000',
        })}
      />
      <Typography
        component="span"
        sx={{
          position: 'absolute',
          left: 10,
          bottom: 10,
          px: 1,
          py: 0.4,
          borderRadius: '8px',
          fontSize: 12.5,
          lineHeight: 1.3,
          color: '#fff',
          bgcolor: 'rgba(0,0,0,0.62)',
          backdropFilter: 'blur(6px)',
        }}
      >
        {formatDateTime(shot.at)}
      </Typography>
    </Box>
  )
}

function SnapshotPanel({ ticket }: { ticket: Ticket }) {
  const before = snapshotMatchesTicket(ticket, ticket.snapshots.before) ? ticket.snapshots.before : undefined
  const after = snapshotMatchesTicket(ticket, ticket.snapshots.after) ? ticket.snapshots.after : undefined
  const frames = [
    before && { key: 'before', label: 'Creation', shot: before },
    after && { key: 'after', label: 'Completion', shot: after },
  ].filter(Boolean) as { key: string; label: string; shot: Snapshot }[]
  const [selected, setSelected] = useState(0)
  const [zoomed, setZoomed] = useState(false)

  if (isCompleted(ticket)) return <ImprovementVerification ticket={ticket} />

  const current = frames[Math.min(selected, frames.length - 1)]
  if (!current) {
    return (
      <Box
        sx={(t) => ({
          py: 6,
          textAlign: 'center',
          border: `1px dashed ${t.palette.divider}`,
          borderRadius: '12px',
        })}
      >
        <ImageOutlinedIcon sx={{ fontSize: 30, color: 'text.disabled' }} />
        <Typography sx={{ fontWeight: 600, mt: 0.5 }}>No snapshot captured</Typography>
        <Typography variant="caption" color="text.secondary">
          This ticket was created without snapshot proof.
        </Typography>
      </Box>
    )
  }

  return (
    <Box>
      <SnapshotImage shot={current.shot} ticket={ticket} label={current.label} onZoom={() => setZoomed(true)} />
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        {current.label} snapshot · {current.shot.by}
      </Typography>
      {frames.length > 1 && (
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          {frames.map((f, i) => (
            <Box
              key={f.key}
              component="button"
              type="button"
              onClick={() => setSelected(i)}
              aria-label={`Show ${f.label.toLowerCase()} snapshot`}
              aria-pressed={i === selected}
              sx={(t) => ({
                p: 0,
                width: 120,
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

function InfoRow({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={(t) => ({ alignItems: 'center', py: 1.1, '&:not(:last-of-type)': { borderBottom: `1px solid ${t.palette.divider}` } })}
    >
      <Typography variant="body2" color="text.secondary" sx={{ width: 108, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontWeight: 600, wordBreak: 'break-word' }}>
        {value}
      </Typography>
      {copy && (
        <Tooltip title="Copy">
          <IconButton size="small" aria-label={`Copy ${label}`} onClick={() => void navigator.clipboard?.writeText(value)}>
            <ContentCopyRoundedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  )
}

function ContextPanel({ ticket }: { ticket: Ticket }) {
  const snapshot = ticket.snapshots.before ?? ticket.snapshots.after
  const shot = snapshotMatchesTicket(ticket, snapshot) ? snapshot : undefined
  const coords = ticket.cameraId
    ? `P ${ticket.yaw.toFixed(1)}° · T ${ticket.pitch.toFixed(1)}° · Z ${ticket.zoom.toFixed(1)}×`
    : `${ticket.lat.toFixed(5)}, ${ticket.lng.toFixed(5)}`
  const site = ticket.siteId ? siteName(ticket.siteId) : ''

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: shot ? '1fr 1fr' : '1fr' }, gap: 1.5 }}>
      <Panel>
        <InfoRow label="Source" value={TICKET_SOURCE_LABEL[ticket.source]} />
        {ticket.cameraId && <InfoRow label="Camera Name" value={ticketContextLabel(ticket)} />}
        {site && <InfoRow label="Site" value={site} />}
        {ticket.zone && <InfoRow label="Zone" value={ticket.zone} />}
        <InfoRow label={ticket.cameraId ? 'Pin Orientation' : 'Coordinates'} value={coords} copy />
        <InfoRow label="Creator" value={ticket.creator} />
        <InfoRow label="Created" value={formatDateTime(ticket.createdAt)} />
        <InfoRow label="Completed" value={ticket.completedAt ? formatDateTime(ticket.completedAt) : '—'} />
      </Panel>
      {shot && (
        <Panel>
          <SnapshotImage shot={shot} ticket={ticket} label="Ticket" onZoom={() => undefined} />
        </Panel>
      )}
    </Box>
  )
}

export default function TicketDetailView({ ticket, me, canEdit, canChangeState, editing, initialTab, onClose }: Props) {
  const { transition, updateDetails } = useTickets()
  const [tab, setTab] = useState<DetailTab>(initialTab)
  const [title, setTitle] = useState(ticket.title)
  const [description, setDescription] = useState(ticket.description)
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority)
  const [statusAnchor, setStatusAnchor] = useState<HTMLElement | null>(null)
  const next = useMemo(() => NEXT_STATES[ticket.status] ?? [], [ticket.status])
  const canTransition = canChangeState && next.length > 0

  const saveDetails = () => {
    if (!title.trim()) return
    updateDetails(ticket.id, { title: title.trim(), description: description.trim(), priority }, me)
  }

  const contextTab: DetailTab = 'camera'
  const contextLabel = ticket.cameraId ? 'Camera' : 'Location'

  return (
    <>
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: 2.25 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontFamily: '"SF Mono", ui-monospace, Menlo, monospace', fontSize: 11.5, color: 'text.secondary' }}>
              {ticket.id}
            </Typography>
            {editing ? (
              <TextField
                size="small"
                fullWidth
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                error={!title.trim()}
                slotProps={{ htmlInput: { 'aria-label': 'Title' } }}
              />
            ) : (
              <Typography component="h2" sx={{ fontSize: { xs: 18, sm: 22 }, fontWeight: 700, lineHeight: 1.25, wordBreak: 'break-word' }}>
                {ticket.title}
              </Typography>
            )}
          </Box>

          {editing ? (
            <FormControl size="small" sx={{ minWidth: 112 }}>
              <InputLabel>Priority</InputLabel>
              <Select
                label="Priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                MenuProps={{ sx: { zIndex: menuZ } }}
              >
                {(Object.keys(PRIORITY_LABEL) as TicketPriority[]).map((p) => (
                  <MenuItem key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <Stack
              direction="row"
              spacing={0.9}
              sx={{
                alignItems: 'center',
                px: 1.5,
                height: 36,
                borderRadius: '10px',
                border: `1px solid ${PRIORITY_COLOR[priority]}55`,
                bgcolor: `${PRIORITY_COLOR[priority]}22`,
              }}
            >
              <Dot color={PRIORITY_COLOR[priority]} />
              <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{PRIORITY_LABEL[priority]}</Typography>
            </Stack>
          )}

          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', sm: 'block' }, my: 0.5 }} />

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
              height: 36,
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

          <IconButton onClick={onClose} aria-label="Close" sx={{ ml: 0.5 }}>
            <CloseRoundedIcon />
          </IconButton>
        </Stack>

        <TextField
          label="Description"
          multiline
          fullWidth
          minRows={1}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          sx={{ mt: 2 }}
          slotProps={{
            input: { readOnly: !editing, sx: { fontSize: 14.5 } },
            inputLabel: { shrink: true },
          }}
        />
        {editing && canEdit && (
          <Button size="small" variant="contained" onClick={saveDetails} disabled={!title.trim()} sx={{ mt: 1 }}>
            Save details
          </Button>
        )}
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v as DetailTab)}
        variant="scrollable"
        scrollButtons="auto"
        sx={(t) => ({
          mt: 1.5,
          px: { xs: 1, sm: 2 },
          minHeight: 48,
          borderBottom: `1px solid ${t.palette.divider}`,
          '& .MuiTab-root': { minHeight: 48, textTransform: 'none', fontWeight: 600, fontSize: 14, gap: 0.5 },
        })}
      >
        <Tab value="snapshot" icon={<ImageOutlinedIcon fontSize="small" />} iconPosition="start" label="Snapshot" />
        <Tab value="team" icon={<GroupOutlinedIcon fontSize="small" />} iconPosition="start" label="Team" />
        <Tab
          value={contextTab}
          icon={ticket.cameraId ? <VideocamOutlinedIcon fontSize="small" /> : <PlaceOutlinedIcon fontSize="small" />}
          iconPosition="start"
          label={contextLabel}
        />
        <Tab
          value="comments"
          icon={<ChatBubbleOutlineRoundedIcon fontSize="small" />}
          iconPosition="start"
          label={`Comments${ticket.comments.length ? ` (${ticket.comments.length})` : ''}`}
        />
        <Tab value="activity" icon={<HistoryRoundedIcon fontSize="small" />} iconPosition="start" label="Activity" />
      </Tabs>

      <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {tab === 'snapshot' && <SnapshotPanel ticket={ticket} />}
        {tab === 'team' && <TicketTeamPanel ticket={ticket} me={me} />}
        {tab === 'camera' && <ContextPanel ticket={ticket} />}
        {tab === 'comments' && <TicketCommentThread ticket={ticket} me={me} />}
        {tab === 'activity' && <TicketActivity ticket={ticket} />}
      </Box>
    </>
  )
}
