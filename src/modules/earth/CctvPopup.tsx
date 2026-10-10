import { useState, type MutableRefObject, type ReactNode } from 'react'
import { Box, Button, Chip, Dialog, IconButton, List, ListItemButton, ListItemText, Popover, Stack, Tooltip, Typography } from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import FullscreenRoundedIcon from '@mui/icons-material/FullscreenRounded'
import FullscreenExitRoundedIcon from '@mui/icons-material/FullscreenExitRounded'
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined'
import type { CameraDevice, CameraSite } from '../../data/cameras'
import { isHistoricalTicket, STATUS_COLOR, STATUS_LABEL, type Ticket } from '../../data/tickets'
import PanoramaViewer from './PanoramaViewer'
import TicketMarkerLayer, { type DraftMarker } from './TicketMarkerLayer'
import type { ViewerApi } from './viewerProjection'
import { CCTV_STATUS_COLOR } from './CctvLayer'
import { zoomFactor, type Direction } from './panoramaMath'
import { wrapDeg } from '../../utils/format'
import type { CreateDraft } from '../tickets/TicketEditorDialog'

interface Props {
  device: CameraDevice
  site: CameraSite
  anchor: { x: number; y: number }
  tickets: Ticket[]
  canEdit: boolean
  liveTicketView: boolean
  /** Marker for a ticket being created on this camera, kept visible while the form is open. */
  draft: DraftMarker | null
  apiRef: MutableRefObject<ViewerApi | null>
  onClose: () => void
  onCreate: (draft: CreateDraft) => void
  onOpenTicket: (ticket: Ticket) => void
}

const noop = () => {}

/** Fixed-lens CCTV feed: the camera cannot pan or zoom, but a click in pin mode or a right-click picks a point. */
function FixedFeed({
  device,
  site,
  tickets,
  compact,
  pinning,
  draft,
  apiRef,
  onPick,
  onCancelPin,
  onSelectTicket,
}: {
  device: CameraDevice
  site: CameraSite
  tickets: Ticket[]
  compact: boolean
  pinning: boolean
  draft: DraftMarker | null
  apiRef: MutableRefObject<ViewerApi | null>
  onPick?: (dir: Direction) => void
  onCancelPin: () => void
  onSelectTicket: (ticket: Ticket) => void
}) {
  const view = device.view ?? { yaw: 0, pitch: 0, fov: 40 }
  return (
    <Box
      sx={{ position: 'relative', width: '100%', height: '100%', bgcolor: '#000' }}
      onPointerMoveCapture={(e) => e.stopPropagation()}
      onWheelCapture={(e) => e.stopPropagation()}
    >
      <PanoramaViewer
        src={site.panorama}
        view={view}
        fovRange={[view.fov, view.fov]}
        pitchRange={[view.pitch, view.pitch]}
        onViewChange={noop}
        onPointClick={pinning && onPick ? (dir) => onPick(dir) : undefined}
        onPointContextMenu={onPick ? (dir) => onPick(dir) : undefined}
        apiRef={apiRef}
        pickCursor={pinning}
        cssFilter={device.status === 'offline' ? 'grayscale(1) brightness(0.4)' : 'contrast(1.04) saturate(0.92)'}
      >
        <TicketMarkerLayer tickets={tickets} selectedId={null} draft={draft} compact={compact} onSelect={onSelectTicket} />
      </PanoramaViewer>
      {pinning && (
        <Stack
          direction="row"
          spacing={1}
          role="status"
          sx={{
            position: 'absolute',
            left: 8,
            right: 8,
            bottom: 8,
            alignItems: 'center',
            px: 1.25,
            py: 0.75,
            borderRadius: '10px',
            bgcolor: 'rgba(10,132,255,0.92)',
            color: '#fff',
          }}
        >
          <Typography sx={{ flex: 1, fontSize: compact ? 11.5 : 13, fontWeight: 700, lineHeight: 1.3 }}>
            Pin Ticket Location: click on the camera view to mark the incident location.
          </Typography>
          <Button size="small" onClick={onCancelPin} sx={{ color: '#fff', fontWeight: 700, minWidth: 0, flexShrink: 0 }}>
            Cancel
          </Button>
        </Stack>
      )}
      <Stack
        direction="row"
        spacing={0.75}
        sx={{ position: 'absolute', left: 8, top: 8, alignItems: 'center', pointerEvents: 'none' }}
      >
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: device.status === 'offline' ? '#FF453A' : '#FF3B30', animation: device.status === 'offline' ? 'none' : 'pulse 1.6s infinite' }} />
        <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
          {device.status === 'offline' ? 'NO SIGNAL' : 'LIVE'} · {device.name}
        </Typography>
      </Stack>
    </Box>
  )
}

export default function CctvPopup({ device, site, anchor, tickets, canEdit, liveTicketView, draft, apiRef, onClose, onCreate, onOpenTicket }: Props) {
  const [fullscreen, setFullscreen] = useState(false)
  const [pinning, setPinning] = useState(false)
  const openTickets = tickets.filter((t) => !isHistoricalTicket(t))
  const markerTickets = liveTicketView ? openTickets : []
  const view = device.view ?? { yaw: 0, pitch: 0, fov: 40 }

  const draftAt = (dir: Direction): CreateDraft => ({
    camera: device,
    yaw: wrapDeg(dir.yaw),
    pitch: dir.pitch,
    zoom: zoomFactor(view.fov),
    view: { yaw: view.yaw, pitch: view.pitch, fov: view.fov },
  })
  const pick = canEdit
    ? (dir: Direction) => {
        setPinning(false)
        onCreate(draftAt(dir))
      }
    : undefined
  const feedProps = { device, site, tickets: markerTickets, pinning, draft, apiRef, onPick: pick, onCancelPin: () => setPinning(false), onSelectTicket: onOpenTicket }

  const header = (trailing: ReactNode) => (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1.75, py: 1.25 }}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 800, lineHeight: 1.25 }} noWrap>
          {device.name}
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }} noWrap>
          {site.name} · {device.zone}
        </Typography>
      </Box>
      <Chip
        size="small"
        label={device.status}
        sx={{
          textTransform: 'capitalize',
          fontWeight: 700,
          bgcolor: `${CCTV_STATUS_COLOR[device.status]}22`,
          color: CCTV_STATUS_COLOR[device.status],
          border: `1px solid ${CCTV_STATUS_COLOR[device.status]}66`,
        }}
      />
      {trailing}
    </Stack>
  )

  const createButton = canEdit && (
    <Button
      size="small"
      variant="contained"
      startIcon={<ConfirmationNumberOutlinedIcon fontSize="small" />}
      onClick={() => setPinning(true)}
      disabled={pinning}
      sx={{ borderRadius: '999px', fontWeight: 700 }}
    >
      Create Ticket
    </Button>
  )

  if (fullscreen) {
    return (
      <Dialog fullScreen open onClose={() => setFullscreen(false)} aria-label={`${device.name} full screen`}>
        <Stack sx={{ height: '100%', bgcolor: '#000' }}>
          <Box sx={{ bgcolor: 'background.paper' }}>
            {header(
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                {createButton}
                <Tooltip title="Exit full screen">
                  <IconButton aria-label="Exit full screen" onClick={() => setFullscreen(false)}>
                    <FullscreenExitRoundedIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Close">
                  <IconButton aria-label="Close CCTV" onClick={onClose}>
                    <CloseRoundedIcon />
                  </IconButton>
                </Tooltip>
              </Stack>,
            )}
          </Box>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <FixedFeed {...feedProps} compact={false} />
          </Box>
          {canEdit && (
            <Typography sx={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', textAlign: 'center', py: 0.75 }}>
              Use Create Ticket, then click the feed to pin the incident location.
            </Typography>
          )}
        </Stack>
      </Dialog>
    )
  }

  return (
    <Popover
      open
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={{ top: anchor.y, left: anchor.x }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      marginThreshold={12}
      slotProps={{ paper: { sx: { width: 'min(380px, calc(100vw - 24px))', borderRadius: '14px', overflow: 'hidden' } } }}
    >
      {header(
        <Stack direction="row" sx={{ alignItems: 'center' }}>
          <Tooltip title="Full screen">
            <IconButton size="small" aria-label="Full screen" onClick={() => setFullscreen(true)}>
              <FullscreenRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Close">
            <IconButton size="small" aria-label="Close CCTV" onClick={onClose}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>,
      )}
      <Box sx={{ aspectRatio: '16 / 9', width: '100%' }}>
        <FixedFeed {...feedProps} compact />
      </Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', px: 1.75, pt: 1.25 }}>
        <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }} noWrap>
          {device.model} · {device.ip}
        </Typography>
        {createButton}
      </Stack>
      <Box sx={{ px: 1.75, pt: 1.25, pb: 0.5 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 700, color: 'text.secondary' }}>
          Open tickets ({openTickets.length})
        </Typography>
      </Box>
      {openTickets.length === 0 ? (
        <Typography sx={{ fontSize: 12.5, color: 'text.secondary', px: 1.75, pb: 1.5 }}>No open tickets on this camera.</Typography>
      ) : (
        <List dense disablePadding sx={{ maxHeight: 168, overflowY: 'auto', pb: 0.75 }}>
          {openTickets.map((ticket) => (
            <ListItemButton key={ticket.id} onClick={() => onOpenTicket(ticket)} sx={{ px: 1.75 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: STATUS_COLOR[ticket.status], mr: 1.25, flexShrink: 0 }} />
              <ListItemText
                primary={ticket.title}
                secondary={STATUS_LABEL[ticket.status]}
                slotProps={{ primary: { noWrap: true, sx: { fontSize: 13, fontWeight: 600 } }, secondary: { sx: { fontSize: 11.5 } } }}
              />
            </ListItemButton>
          ))}
        </List>
      )}
    </Popover>
  )
}
