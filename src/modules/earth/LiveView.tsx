import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Box, Button, Chip, IconButton, Menu, MenuItem, Paper, Stack, Tooltip, useMediaQuery, useTheme, type Theme } from '@mui/material'
import ArrowBackIosNewRoundedIcon from '@mui/icons-material/ArrowBackIosNewRounded'
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined'
import type { CameraDevice, CameraSite, DeviceKind, SelectionKind } from '../../data/cameras'
import { isCompleted, type NewTicketInput, type Ticket } from '../../data/tickets'
import PanoramaViewer, { type ViewerStatus } from './PanoramaViewer'
import LiveOverlay from './LiveOverlay'
import PtzControls from './PtzControls'
import TicketMarkerLayer from './TicketMarkerLayer'
import type { Direction, View } from './panoramaMath'
import { useCameraChannel } from './useCameraChannel'
import { clamp, wrapDeg } from '../../utils/format'
import { zoomFactor } from './panoramaMath'
import { useTickets } from '../../state/TicketsContext'
import { CaptureContext, type CaptureFn } from '../tickets/captureContext'
import type { ViewerApi } from './viewerProjection'
import { useAuth } from '../../auth/AuthContext'
import { useTicketQuery } from '../../state/TicketQueryContext'
import { isWithinLiveWindow, isWithinStoreWindow } from '../../data/integrations'
import { applyTicketQuery } from '../tickets/ticketFilters'
import { useIntegrations } from '../../state/IntegrationsContext'
import TicketMenu from '../tickets/TicketMenu'
import TicketManageDialog from '../tickets/TicketManageDialog'
import TicketEditorDialog, { type CreateDraft } from '../tickets/TicketEditorDialog'
import { hudSurface } from '../../theme/hud'

export interface TicketFocus {
  ticketId: string
  mode: 'select' | 'goto'
  nonce: number
}

interface Props {
  site: CameraSite
  selectionKind: SelectionKind
  focus?: TicketFocus | null
  onClose: () => void
}

const FOV_360: [number, number] = [45, 115]
const PITCH_360: [number, number] = [-88, 88]
const FOV_PTZ: [number, number] = [1.5, 60]
const PITCH_PTZ: [number, number] = [-90, 45]
const TOP_INSET = 44
const HIGHLIGHT_MS = 3000

const glass = (t: Theme) => hudSurface(t)

export default function LiveView({ site, selectionKind, focus = null, onClose }: Props) {
  const theme = useTheme()
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'))
  const { tickets, addTicket } = useTickets()
  const { currentUser } = useAuth()
  const { filters, setFilters, isLiveTicketView, toggleLiveTicketView, ticketSize, setTicketSize } = useTicketQuery()
  const { integrations } = useIntegrations()
  const liveTicketView = isLiveTicketView(site.id)
  const me = currentUser?.displayName ?? 'Ava Sharma'
  const canEdit = currentUser?.role !== 'Viewer'

  const [primary, setPrimary] = useState<DeviceKind>(selectionKind === 'ptz' ? 'ptz' : '360')
  const [status360, setStatus360] = useState<ViewerStatus>('loading')
  const [statusPtz, setStatusPtz] = useState<ViewerStatus>('loading')
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [targetTicketId, setTargetTicketId] = useState<string | null>(null)
  const [showImprovements, setShowImprovements] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [editor, setEditor] = useState<{
    mode: 'create' | 'view' | 'edit'
    ticket?: Ticket | null
    draft?: CreateDraft | null
    tab?: 'details' | 'activity'
  } | null>(null)
  const [context, setContext] = useState<{ device: CameraDevice; draft: CreateDraft; x: number; y: number } | null>(null)
  const api360 = useRef<ViewerApi | null>(null)
  const apiPtz = useRef<ViewerApi | null>(null)

  const capture = useCallback<CaptureFn>(
    (cameraId, dir, treatment) => {
      const ref = cameraId === site.ptz.id ? apiPtz : api360
      return ref.current?.captureAt(dir, 26, treatment) ?? api360.current?.captureAt(dir, 26, treatment) ?? null
    },
    [site.ptz.id],
  )

  const home360: View = { yaw: site.home.yaw, pitch: 0, fov: 90 }
  const cam360 = useCameraChannel(home360, { latencyMs: 180 })
  const ptz = useCameraChannel(site.home, { latencyMs: 420 })

  const siteTickets = useMemo(
    () => tickets.filter((t) => t.siteId === site.id && isWithinStoreWindow(t, integrations) && isWithinLiveWindow(t, integrations)),
    [tickets, site.id, integrations],
  )
  const openedCameraIds = useMemo(() => {
    if (selectionKind === 'ptz') return [site.ptz.id]
    if (selectionKind === '360') return [site.cam360.id]
    return [site.cam360.id, site.ptz.id]
  }, [selectionKind, site])
  const scopedTickets = useMemo(
    () => tickets.filter((t) => openedCameraIds.includes(t.cameraId) && isWithinStoreWindow(t, integrations) && isWithinLiveWindow(t, integrations)),
    [tickets, openedCameraIds, integrations],
  )
  const manageTickets = useMemo(
    () => applyTicketQuery(scopedTickets, { tab: 'all', search: '', filters, me, assignedToMe: false }),
    [scopedTickets, filters, me],
  )
  const filteredSiteTickets = useMemo(
    () => applyTicketQuery(siteTickets, { tab: 'all', search: '', filters, me, assignedToMe: false }),
    [siteTickets, filters, me],
  )
  const completedCount = useMemo(() => manageTickets.filter(isCompleted).length, [manageTickets])
  const overlayTickets = useMemo(
    () =>
      liveTicketView
        ? filteredSiteTickets.filter(
            (t) =>
              !isCompleted(t) || t.id === selectedTicketId || t.id === targetTicketId || (showImprovements && t.snapshotConfig.showInImprovementHistory),
          )
        : [],
    [filteredSiteTickets, showImprovements, selectedTicketId, targetTicketId, liveTicketView],
  )

  const mainDevice = primary === '360' ? site.cam360 : site.ptz
  const pipDevice = primary === '360' ? site.ptz : site.cam360
  const cameraName =
    selectionKind === 'ptz' ? site.ptz.name : selectionKind === '360' ? site.cam360.name : site.name

  const aimPtz = useCallback(
    (dir: Direction, fov?: number) =>
      ptz.command((v) => ({ ...v, yaw: wrapDeg(dir.yaw), pitch: clamp(dir.pitch, PITCH_PTZ[0], PITCH_PTZ[1]), fov: fov ?? v.fov })),
    [ptz],
  )
  const aim360 = useCallback(
    (dir: Direction) => cam360.command((v) => ({ ...v, yaw: wrapDeg(dir.yaw), pitch: clamp(dir.pitch, PITCH_360[0], PITCH_360[1]) })),
    [cam360],
  )

  const handlePointClick = useCallback(
    (device: CameraDevice, dir: Direction) => {
      if (device.kind === '360') aimPtz(dir)
      else aim360(dir)
    },
    [aimPtz, aim360],
  )

  const handlePointContextMenu = useCallback(
    (device: CameraDevice, dir: Direction, screen: { clientX: number; clientY: number }) => {
      if (!canEdit) return
      setContext({
        device,
        draft: { camera: device, yaw: wrapDeg(dir.yaw), pitch: dir.pitch, zoom: zoomFactor(ptz.actual.fov) },
        x: screen.clientX,
        y: screen.clientY,
      })
    },
    [canEdit, ptz.actual.fov],
  )

  const main = primary === '360' ? cam360 : ptz
  const mainPitch = primary === '360' ? PITCH_360 : PITCH_PTZ
  const mainFov = primary === '360' ? FOV_360 : FOV_PTZ
  const mainHome = primary === '360' ? home360 : site.home

  const pan = useCallback(
    (dx: number, dy: number) =>
      main.command((v) => {
        const step = Math.max(0.15, v.fov * 0.035)
        return { ...v, yaw: wrapDeg(v.yaw + dx * step), pitch: clamp(v.pitch + dy * step, mainPitch[0], mainPitch[1]) }
      }),
    [main, mainPitch],
  )
  const zoom = useCallback(
    (direction: 1 | -1) => main.command((v) => ({ ...v, fov: clamp(v.fov * (direction === 1 ? 0.93 : 1 / 0.93), mainFov[0], mainFov[1]) })),
    [main, mainFov],
  )
  const goHome = useCallback(() => main.command(() => mainHome), [main, mainHome])
  const swap = () => setPrimary((p) => (p === '360' ? 'ptz' : '360'))

  const targetTimer = useRef<number | null>(null)
  const goToTicket = useCallback(
    (ticket: Ticket) => {
      const device = ticket.cameraId === site.ptz.id ? site.ptz : site.cam360
      setPrimary(device.kind)
      setSelectedTicketId(ticket.id)
      setTargetTicketId(ticket.id)
      aim360(ticket)
      aimPtz(ticket, clamp(60 / (ticket.zoom || 1), FOV_PTZ[0], FOV_PTZ[1]))
      if (targetTimer.current) window.clearTimeout(targetTimer.current)
      targetTimer.current = window.setTimeout(() => setTargetTicketId(null), HIGHLIGHT_MS)
    },
    [site, aim360, aimPtz],
  )
  useEffect(
    () => () => {
      if (targetTimer.current) window.clearTimeout(targetTimer.current)
    },
    [],
  )

  const selectTicket = useCallback((ticket: Ticket, mode: 'view' | 'edit' = 'view', tab: 'details' | 'activity' = 'details') => {
    setSelectedTicketId(ticket.id)
    setEditor({ mode, ticket, tab })
  }, [])

  const ready = status360 === 'ready' && statusPtz === 'ready'
  const handledFocus = useRef<number | null>(null)
  useEffect(() => {
    if (!focus || !ready || handledFocus.current === focus.nonce) return
    const ticket = siteTickets.find((t) => t.id === focus.ticketId)
    if (!ticket) return
    handledFocus.current = focus.nonce
    if (focus.mode === 'goto') goToTicket(ticket)
    setSelectedTicketId(ticket.id)
    setEditor({ mode: 'view', ticket })
  }, [focus, ready, siteTickets, goToTicket])

  const createTicket = (input: NewTicketInput) => {
    const created = addTicket(input)
    setEditor({ mode: 'view', ticket: created })
    setSelectedTicketId(created.id)
    setContext(null)
  }

  const markerLayer = (compact: boolean) => (
    <TicketMarkerLayer
      tickets={overlayTickets}
      selectedId={selectedTicketId}
      targetId={targetTicketId}
      draft={editor?.mode === 'create' && editor.draft && !compact ? { yaw: editor.draft.yaw, pitch: editor.draft.pitch } : null}
      compact={compact}
      onSelect={(t) => selectTicket(t)}
    />
  )

  const render360 = (compact: boolean) => (
    <PanoramaViewer
      key="360"
      src={site.panorama}
      view={cam360.target}
      fovRange={FOV_360}
      pitchRange={PITCH_360}
      smoothing={9}
      onViewChange={cam360.steer}
      onCurrentChange={cam360.setActual}
      onSettled={cam360.onSettled}
      onPointClick={(dir) => handlePointClick(site.cam360, dir)}
      onPointContextMenu={(dir, screen) => handlePointContextMenu(site.cam360, dir, screen)}
      onStatus={setStatus360}
      apiRef={api360}
      pairedView={ptz.target}
      pairedColor="#5AC8FA"
    >
      <LiveOverlay
        device={site.cam360}
        view={cam360.actual}
        status={status360}
        compact={compact}
        topInset={compact ? 0 : TOP_INSET}
        phase={cam360.phase}
      />
      {markerLayer(compact)}
    </PanoramaViewer>
  )

  const renderPtz = (compact: boolean) => (
    <PanoramaViewer
      key="ptz"
      src={site.panorama}
      view={ptz.target}
      fovRange={FOV_PTZ}
      pitchRange={PITCH_PTZ}
      smoothing={5}
      onViewChange={ptz.steer}
      onCurrentChange={ptz.setActual}
      onSettled={ptz.onSettled}
      onPointClick={(dir) => handlePointClick(site.ptz, dir)}
      onPointContextMenu={(dir, screen) => handlePointContextMenu(site.ptz, dir, screen)}
      onStatus={setStatusPtz}
      apiRef={apiPtz}
      cssFilter="contrast(1.06) saturate(1.08)"
    >
      <LiveOverlay
        device={site.ptz}
        view={ptz.actual}
        status={statusPtz}
        compact={compact}
        showCrosshair
        topInset={compact ? 0 : TOP_INSET}
        phase={ptz.phase}
      />
      {markerLayer(compact)}
    </PanoramaViewer>
  )

  const pipWidth = isSmall ? 'min(42vw, 200px)' : 'clamp(220px, 24%, 380px)'
  const liveTicket = editor?.ticket ? (tickets.find((t) => t.id === editor.ticket?.id) ?? editor.ticket) : null

  return (
    <CaptureContext.Provider value={capture}>
      <Box
        component="section"
        aria-label="Live view"
        sx={{ position: 'absolute', inset: 0, display: 'flex', bgcolor: '#000', overflow: 'hidden' }}
      >
        <Box sx={{ position: 'relative', flex: 1, minWidth: 0, height: '100%' }}>
          {primary === '360' ? render360(false) : renderPtz(false)}

          <Stack
            direction="row"
            spacing={0.75}
            sx={{ position: 'absolute', top: 10, left: 10, alignItems: 'center', maxWidth: { xs: 'calc(100% - 148px)', sm: 'calc(100% - 168px)' }, zIndex: 3 }}
          >
            <Button
              size="small"
              startIcon={<ArrowBackIosNewRoundedIcon sx={{ fontSize: '13px !important' }} />}
              onClick={onClose}
              sx={(t) => ({
                ...glass(t),
                height: 36,
                px: 1.25,
                borderRadius: '999px',
                fontWeight: 700,
                flexShrink: 0,
                '& .MuiButton-startIcon': { mr: 0.5 },
              })}
            >
              Earth
            </Button>
            <Chip
              size="small"
              label={cameraName}
              sx={(t) => ({
                ...glass(t),
                height: 36,
                fontSize: { xs: 13.5, sm: 15 },
                fontWeight: 800,
                borderRadius: '999px',
                maxWidth: '100%',
                '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
              })}
            />
          </Stack>

          <Stack direction="row" spacing={0.75} sx={{ position: 'absolute', top: 10, right: 10, alignItems: 'center', zIndex: 3 }}>
            <Tooltip title={liveTicketView ? 'Improvements' : 'Enable ticket view to show history'}>
              <Box component="span" sx={{ display: 'inline-flex' }}>
                <IconButton
                  size="small"
                  aria-label="Improvements"
                  aria-pressed={showImprovements}
                  disabled={!liveTicketView}
                  onClick={() => setShowImprovements((v) => !v)}
                  sx={(t) => ({
                    ...glass(t),
                    width: 36,
                    height: 36,
                    ...(showImprovements &&
                      liveTicketView && { bgcolor: '#30D158', color: '#fff', borderColor: '#30D158', '&:hover': { bgcolor: '#28b84c' } }),
                  })}
                >
                  <Badge badgeContent={completedCount} color="success" slotProps={{ badge: { sx: { fontSize: 10, height: 16, minWidth: 16 } } }}>
                    <HistoryRoundedIcon sx={{ fontSize: 18 }} />
                  </Badge>
                </IconButton>
              </Box>
            </Tooltip>
            <TicketMenu
              tickets={manageTickets}
              filters={filters}
              onFiltersChange={setFilters}
              hideFilters={['cameraId']}
              onManage={() => setManageOpen(true)}
              scopeLabel={cameraName}
              ticketViewEnabled={liveTicketView}
              onToggleTicketView={() => {
                if (liveTicketView) setShowImprovements(false)
                toggleLiveTicketView(site.id)
              }}
              ticketSize={ticketSize}
              onTicketSizeChange={setTicketSize}
              buttonSx={(t: Theme) => ({ ...glass(t), width: 36, height: 36 })}
            />
            <Tooltip title="Close live view">
              <IconButton size="small" onClick={onClose} aria-label="Close live view" sx={(t) => ({ ...glass(t), width: 36, height: 36 })}>
                <CloseRoundedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Stack>

          <Box sx={{ position: 'absolute', left: 12, bottom: 12, transform: isSmall ? 'scale(0.82)' : 'none', transformOrigin: 'bottom left' }}>
            <PtzControls targetLabel={mainDevice.kind === '360' ? '360° camera' : 'PTZ camera'} onPan={pan} onZoom={zoom} onHome={goHome} />
          </Box>

          <Paper
            elevation={0}
            sx={(t) => ({
              position: 'absolute',
              right: 12,
              bottom: 12,
              width: pipWidth,
              aspectRatio: '16 / 9',
              borderRadius: '12px',
              overflow: 'hidden',
              border: `1px solid ${t.palette.mode === 'dark' ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.8)'}`,
              boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
              bgcolor: '#000',
            })}
          >
            {primary === '360' ? renderPtz(true) : render360(true)}
            <Tooltip title={`Swap — bring ${pipDevice.kind === '360' ? '360°' : 'PTZ'} to main window`}>
              <IconButton
                size="small"
                onClick={swap}
                aria-label="Swap main and picture-in-picture views"
                sx={{
                  position: 'absolute',
                  right: 6,
                  bottom: 6,
                  bgcolor: 'rgba(0,0,0,0.55)',
                  color: '#fff',
                  backdropFilter: 'blur(8px)',
                  '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
                }}
              >
                <SwapHorizRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Paper>
        </Box>

        <Menu
          open={Boolean(context)}
          onClose={() => setContext(null)}
          anchorReference="anchorPosition"
          anchorPosition={context ? { top: context.y, left: context.x } : undefined}
          slotProps={{ paper: { sx: { borderRadius: '12px', minWidth: 180 } } }}
        >
          <MenuItem
            onClick={() => {
              if (!context) return
              setEditor({ mode: 'create', draft: context.draft })
              setContext(null)
            }}
          >
            <ConfirmationNumberOutlinedIcon fontSize="small" sx={{ mr: 1 }} />
            Create Ticket
          </MenuItem>
        </Menu>

        <TicketManageDialog
          open={manageOpen}
          tickets={manageTickets}
          filters={filters}
          onFiltersChange={setFilters}
          hideFilters={['cameraId']}
          me={me}
          canEdit={canEdit}
          onClose={() => setManageOpen(false)}
          onOpen={(t) => selectTicket(t, 'view')}
          onHistory={(t) => selectTicket(t, 'view', 'activity')}
          onEdit={(t) => selectTicket(t, 'edit')}
          onGoToLocation={(t) => {
            setManageOpen(false)
            goToTicket(t)
          }}
        />

        <TicketEditorDialog
          open={Boolean(editor) && (editor?.mode === 'create' ? Boolean(editor.draft) : Boolean(liveTicket))}
          mode={editor?.mode ?? 'view'}
          ticket={liveTicket}
          draft={editor?.draft}
          initialTab={editor?.tab ?? 'details'}
          onClose={() => setEditor(null)}
          onCreate={createTicket}
        />
      </Box>
    </CaptureContext.Provider>
  )
}
