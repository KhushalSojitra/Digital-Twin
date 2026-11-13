import { useMemo, useRef, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import StarRoundedIcon from '@mui/icons-material/StarRounded'
import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded'
import MyLocationRoundedIcon from '@mui/icons-material/MyLocationRounded'
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded'
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import {
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_COLOR,
  STATUS_NEEDS_DARK_TEXT,
  ticketContextLabel,
  isCompleted,
  platformLabel,
  siteName,
  type Ticket,
} from '../../data/tickets'
import { stateOf, type WorkflowTransition } from '../../data/workflows'
import { formatDateTime } from '../../utils/format'
import { useTickets } from '../../state/TicketsContext'
import { useWorkflow } from '../../state/WorkflowContext'
import { useTicketActions } from './WorkflowActions'
import { useAuth } from '../../auth/AuthContext'
import { useCapture } from './captureContext'
import TicketAssignment from './TicketAssignment'
import TicketActivity from './TicketActivity'
import TicketComments from './TicketComments'
import ImprovementVerification from './ImprovementVerification'
import { useMarkTicketSeen } from '../../state/TicketReadsContext'
import TicketShare from './TicketShare'
import TicketWorkflowButton from './TicketWorkflowButton'

interface Props {
  ticket: Ticket
  onClose: () => void
  onGoToLocation: (ticket: Ticket) => void
  /** Shown on Earth view, where the camera is not open yet. */
  onOpenCamera?: (ticket: Ticket) => void
}

type Panel = 'details' | 'activity' | 'comments'

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{value}</Typography>
    </Box>
  )
}

function CountLabel({ label, count }: { label: string; count: number }) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      <span>{label}</span>
      <Typography component="span" variant="caption" sx={{ opacity: 0.7 }}>
        {count}
      </Typography>
    </Stack>
  )
}

export default function TicketDetailsContent({ ticket, onClose, onGoToLocation, onOpenCamera }: Props) {
  const { toggleFollow, attachSnapshot } = useTickets()
  const { stateLabel, versionFor, typeLabel } = useWorkflow()
  const { currentUser } = useAuth()
  const capture = useCapture()
  const me = currentUser?.displayName ?? 'Operator'
  useMarkTicketSeen(ticket)

  const [panel, setPanel] = useState<Panel>('details')
  const verificationRef = useRef<HTMLDivElement>(null)

  const following = ticket.followers.includes(me)
  const ticketActions = useTicketActions(me)
  const actions = ticketActions.actionsFor(ticket)

  const grabSnapshot = () => {
    const src = ticket.cameraId ? capture?.(ticket.cameraId, { yaw: ticket.yaw, pitch: ticket.pitch }, 'after') : undefined
    if (!src) return undefined
    return { src, at: new Date().toISOString(), by: me, yaw: ticket.yaw, pitch: ticket.pitch }
  }

  const run = (action: WorkflowTransition) => {
    const group = stateOf(versionFor(ticket)?.definition, action.to)?.group
    if ((group === 'done' || group === 'accepted') && ticket.snapshotConfig.captureCompletion && capture) {
      const snapshot = grabSnapshot()
      if (snapshot) attachSnapshot(ticket.id, 'after', snapshot)
    }
    ticketActions.run(ticket, action)
  }

  const snapshotFlags = useMemo(
    () =>
      [
        ticket.snapshotConfig.captureCreation && 'Creation snapshot',
        ticket.snapshotConfig.captureCompletion && 'Completion snapshot',
        ticket.snapshotConfig.showInImprovementHistory && 'Improvement history',
      ].filter(Boolean) as string[],
    [ticket.snapshotConfig],
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', px: 1.5, py: 1 }}>

        <Chip
          size="small"
          label={stateLabel(ticket)}
          sx={{
            height: 20,
            fontSize: 10.5,
            color: STATUS_NEEDS_DARK_TEXT.includes(ticket.status) ? '#1C1C1E' : '#fff',
            bgcolor: STATUS_COLOR[ticket.status],
          }}
        />
        <Chip
          size="small"
          variant="outlined"
          label={PRIORITY_LABEL[ticket.priority]}
          sx={{ height: 20, fontSize: 10.5, borderColor: PRIORITY_COLOR[ticket.priority], color: PRIORITY_COLOR[ticket.priority] }}
        />
        <Box sx={{ flex: 1 }} />
        <TicketShare ticket={ticket} me={me} />
        <Tooltip title={following ? 'Unfollow' : 'Follow ticket'}>
          <IconButton size="small" onClick={() => toggleFollow(ticket.id, me)} aria-label={following ? 'Unfollow ticket' : 'Follow ticket'}>
            {following ? <StarRoundedIcon fontSize="small" sx={{ color: '#FFD60A' }} /> : <StarBorderRoundedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <TicketWorkflowButton ticket={ticket} />
        <IconButton size="small" onClick={onClose} aria-label="Close ticket details">
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Tabs
        value={panel}
        onChange={(_, v) => setPanel(v as Panel)}
        sx={(t) => ({
          minHeight: 32,
          borderBottom: `1px solid ${t.palette.divider}`,
          '& .MuiTab-root': { minHeight: 32, minWidth: 0, px: 1.25, fontSize: 12, textTransform: 'none', fontWeight: 600 },
        })}
      >
        <Tab value="details" label="Details" />
        <Tab value="activity" label={<CountLabel label="Activity" count={ticket.timeline.length} />} />
        <Tab value="comments" label={<CountLabel label="Comments" count={ticket.comments.length} />} />
      </Tabs>

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 1.5, py: 1.5, display: 'flex', flexDirection: 'column' }}>
        {panel === 'details' && (
          <>
            <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{ticket.title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              {ticket.description}
            </Typography>

            <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}>
              <Button size="small" variant="contained" startIcon={<MyLocationRoundedIcon />} onClick={() => onGoToLocation(ticket)}>
                Go to location
              </Button>
              {onOpenCamera && (
                <Button size="small" variant="outlined" startIcon={<VideocamRoundedIcon />} onClick={() => onOpenCamera(ticket)}>
                  Open camera
                </Button>
              )}
              {isCompleted(ticket) && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<HistoryRoundedIcon />}
                  onClick={() => {
                    onGoToLocation(ticket)
                    // Bring the before/after proof into view alongside the camera move.
                    requestAnimationFrame(() => verificationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
                  }}
                >
                  View original position
                </Button>
              )}
            </Stack>

            <Stack direction="row" spacing={0.75} sx={{ mt: 1.25, flexWrap: 'wrap', gap: 0.75 }}>
              {actions.map((action) => (
                <Button key={action.id} size="small" variant="outlined" onClick={() => run(action)} sx={{ height: 26, px: 1.25, fontSize: 11.5 }}>
                  {action.label}
                </Button>
              ))}
            </Stack>
            {ticketActions.dialog}

            <Divider sx={{ my: 1.5 }} />
            <TicketAssignment ticket={ticket} me={me} />
            <Divider sx={{ my: 1.5 }} />

            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
              <Field label="Type" value={typeLabel(ticket.type)} />
              <Field label="Platform" value={platformLabel(ticket)} />
              <Field label="Site" value={siteName(ticket.siteId)} />
              <Field label="Zone" value={ticket.zone} />
              <Box sx={{ gridColumn: '1 / -1' }}>
                <Field
            label={ticket.cameraId ? 'Camera' : 'Location'}
            value={ticket.cameraId ? ticketContextLabel(ticket) : `Earth · ${ticket.lat.toFixed(5)}, ${ticket.lng.toFixed(5)}`}
          />
              </Box>
              <Field label="PTZ pan" value={`${ticket.yaw.toFixed(1)}°`} />
              <Field label="PTZ tilt" value={`${ticket.pitch.toFixed(1)}°`} />
              <Field label="PTZ zoom" value={`${ticket.zoom.toFixed(1)}×`} />
              <Field label="Distance from head" value={`${ticket.distanceM} m`} />
              <Field label="Creator" value={ticket.creator} />
              <Field label="Created" value={formatDateTime(ticket.createdAt)} />
              <Field label="Completed" value={ticket.completedAt ? formatDateTime(ticket.completedAt) : '—'} />
              <Field label="Last updated" value={formatDateTime(ticket.updatedAt)} />
            </Box>

            {snapshotFlags.length > 0 && (
              <Stack direction="row" spacing={0.5} sx={{ mt: 1.25, flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                <PhotoCameraRoundedIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
                {snapshotFlags.map((f) => (
                  <Chip key={f} size="small" variant="outlined" label={f} sx={{ height: 20, fontSize: 10.5 }} />
                ))}
              </Stack>
            )}

            {isCompleted(ticket) ? (
              <Box ref={verificationRef}>
                <Divider sx={{ my: 1.5 }} />
                <ImprovementVerification ticket={ticket} />
              </Box>
            ) : (
              ticket.snapshots.before && (
                <Box sx={{ mt: 1.25 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 700, mb: 0.5 }}>
                    Creation snapshot · {formatDateTime(ticket.snapshots.before.at)}
                  </Typography>
                  <Box
                    component="img"
                    src={ticket.snapshots.before.src}
                    alt={`Creation snapshot for ${ticket.id}`}
                    sx={(t) => ({ width: '100%', borderRadius: '10px', border: `1px solid ${t.palette.divider}` })}
                  />
                </Box>
              )
            )}
          </>
        )}

        {panel === 'activity' && <TicketActivity ticket={ticket} />}
        {panel === 'comments' && <TicketComments ticket={ticket} me={me} />}
      </Box>
    </Box>
  )
}
