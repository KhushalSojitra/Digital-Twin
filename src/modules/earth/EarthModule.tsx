import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Box, IconButton, Paper, Stack, Tooltip, Typography, useTheme } from '@mui/material'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import AddLocationAltRoundedIcon from '@mui/icons-material/AddLocationAltRounded'
import { hudSurface } from '../../theme/hud'
import { getSite, selectionForCombo, type CameraSite } from '../../data/cameras'
import { isHistoricalTicket, type Ticket } from '../../data/tickets'
import { useCameraSelection } from '../../state/CameraSelectionContext'
import { useTickets } from '../../state/TicketsContext'
import { useAuth } from '../../auth/AuthContext'
import EarthMap from './EarthMap'
import EarthTicketCreateDialog, { type EarthLocation } from './EarthTicketCreateDialog'
import LiveView, { type TicketFocus } from './LiveView'
import TicketMenu from '../tickets/TicketMenu'
import TicketManageDialog from '../tickets/TicketManageDialog'
import TicketEditorDialog from '../tickets/TicketEditorDialog'
import { applyTicketQuery } from '../tickets/ticketFilters'
import { useTicketQuery } from '../../state/TicketQueryContext'

export default function EarthModule() {
  const theme = useTheme()
  const { selection, select } = useCameraSelection()
  const { tickets } = useTickets()
  const { currentUser } = useAuth()
  const me = currentUser?.displayName ?? 'Ava Sharma'
  const canEdit = currentUser?.role !== 'Viewer'
  const site = selection ? (getSite(selection.siteId) ?? null) : null

  const {
    filters,
    setFilters,
    earthTicketView,
    setEarthTicketView,
    earthTicketPreview,
    setEarthTicketPreview,
    ticketSize,
    setTicketSize,
  } = useTicketQuery()
  const [params, setParams] = useSearchParams()
  const shared = tickets.find((t) => t.id === params.get('ticket'))
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(shared?.id ?? null)
  const [editorMode, setEditorMode] = useState<'view' | 'edit'>(shared ? 'view' : 'view')
  const [editorTab, setEditorTab] = useState<'details' | 'activity'>('details')
  const [editorOpen, setEditorOpen] = useState(Boolean(shared))
  const [manageOpen, setManageOpen] = useState(false)
  const [showImprovements, setShowImprovements] = useState(false)
  const [flyTo, setFlyTo] = useState<{ lat: number; lng: number; nonce: number } | null>(() =>
    shared ? { lat: shared.lat, lng: shared.lng, nonce: Date.now() } : null,
  )
  const [focus, setFocus] = useState<TicketFocus | null>(null)
  const [pickMode, setPickMode] = useState(false)
  const [createAt, setCreateAt] = useState<EarthLocation | null>(null)

  const earthTickets = useMemo(() => tickets.filter((t) => t.source === 'EARTH'), [tickets])
  const visibleTickets = useMemo(
    () => applyTicketQuery(earthTickets, { tab: 'all', search: '', filters, me, assignedToMe: false }),
    [earthTickets, filters, me],
  )
  const completedCount = useMemo(() => visibleTickets.filter(isHistoricalTicket).length, [visibleTickets])
  const improvementsOn = showImprovements && completedCount > 0
  const mapTickets = earthTicketView
    ? visibleTickets.filter((ticket) => !isHistoricalTicket(ticket) || ticket.id === selectedTicketId || improvementsOn)
    : []

  useEffect(() => {
    if (!pickMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickMode(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickMode])

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) ?? null

  const openSite = useCallback(
    (next: CameraSite) => {
      setFocus(null)
      setEditorOpen(false)
      setSelectedTicketId(null)
      setManageOpen(false)
      select(selectionForCombo(next.id).id)
    },
    [select],
  )
  const close = useCallback(() => {
    setFocus(null)
    setEditorOpen(false)
    setSelectedTicketId(null)
    select(null)
  }, [select])

  const openTicketCamera = (ticket: Ticket, mode: TicketFocus['mode']) => {
    const cameraSite = ticket.siteId ? getSite(ticket.siteId) : undefined
    if (!cameraSite) return
    setEditorOpen(false)
    setManageOpen(false)
    setFocus({ ticketId: ticket.id, mode, nonce: Date.now() })
    select(selectionForCombo(cameraSite.id).id)
  }

  const handleSelectTicket = (ticket: Ticket) => {
    setSelectedTicketId(ticket.id)
    setEditorMode('view')
    setEditorTab('details')
    setEditorOpen(true)
  }

  useEffect(() => {
    if (params.has('ticket')) setParams({}, { replace: true })
  }, [params, setParams])

  const glass = hudSurface(theme)

  return (
    <Box sx={{ position: 'absolute', inset: 0 }}>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          visibility: site ? 'hidden' : 'visible',
          pointerEvents: site ? 'none' : 'auto',
        }}
      >
        <EarthMap
          focusSiteId={selection?.siteId ?? null}
          onSelectSite={openSite}
          tickets={mapTickets}
          selectedTicketId={selectedTicketId}
          onSelectTicket={handleSelectTicket}
          flyToTicket={flyTo}
          pickMode={pickMode}
          onPickLocation={(lat, lng) => {
            setPickMode(false)
            setCreateAt({ lat, lng })
          }}
          draft={createAt}
        />

        {pickMode && (
          <Paper
            elevation={0}
            role="status"
            sx={{
              position: 'absolute',
              top: 14,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 3,
              px: 1.75,
              py: 0.75,
              borderRadius: '999px',
              bgcolor: 'rgba(0,0,0,0.72)',
              color: '#fff',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(10,132,255,0.6)',
            }}
          >
            <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>Click the map to place the ticket · Esc to cancel</Typography>
          </Paper>
        )}

        <Stack
          direction="row"
          spacing={0.75}
          sx={{ position: 'absolute', top: 10, right: 10, alignItems: 'center', zIndex: 3, maxWidth: 'calc(100% - 20px)' }}
        >
          {canEdit && (
            <Tooltip title={pickMode ? 'Cancel placing ticket' : 'Create Ticket'}>
              <IconButton
                size="small"
                aria-label="Create Ticket"
                aria-pressed={pickMode}
                onClick={() => {
                  setEarthTicketView(true)
                  setPickMode((v) => !v)
                }}
                sx={{
                  ...glass,
                  width: 40,
                  height: 40,
                  borderRadius: '12px',
                  ...(pickMode && { bgcolor: '#0A84FF', color: '#fff', borderColor: '#0A84FF', '&:hover': { bgcolor: '#0870d8' } }),
                }}
              >
                <AddLocationAltRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip
            title={
              !earthTicketView
                ? 'Enable ticket view to show history'
                : completedCount === 0
                  ? 'No historical events on Earth'
                  : 'Improvements'
            }
          >
            <Box component="span" sx={{ display: 'inline-flex' }}>
              <IconButton
                size="small"
                aria-label="Improvements"
                aria-pressed={improvementsOn}
                disabled={!earthTicketView || completedCount === 0}
                onClick={() => setShowImprovements((v) => !v)}
                sx={{
                  ...glass,
                  width: 40,
                  height: 40,
                  borderRadius: '12px',
                  ...(improvementsOn &&
                    earthTicketView && { bgcolor: '#30D158', color: '#fff', borderColor: '#30D158', '&:hover': { bgcolor: '#28b84c' } }),
                }}
              >
                <Badge badgeContent={completedCount} color="success" slotProps={{ badge: { sx: { fontSize: 10, height: 16, minWidth: 16 } } }}>
                  <HistoryRoundedIcon fontSize="small" />
                </Badge>
              </IconButton>
            </Box>
          </Tooltip>
          <TicketMenu
            tickets={visibleTickets}
            filters={filters}
            onFiltersChange={setFilters}
            onManage={() => setManageOpen(true)}
            scopeLabel="All sites in view"
            ticketViewEnabled={earthTicketView}
            onToggleTicketView={() => {
              if (earthTicketView) setShowImprovements(false)
              setEarthTicketView(!earthTicketView)
            }}
            ticketPreviewEnabled={earthTicketPreview}
            onToggleTicketPreview={() => setEarthTicketPreview(!earthTicketPreview)}
            ticketSize={ticketSize}
            onTicketSizeChange={setTicketSize}
            buttonSx={{ ...glass, width: 40, height: 40, borderRadius: '12px' }}
          />
        </Stack>

        <TicketManageDialog
          open={manageOpen}
          tickets={tickets}
          filters={filters}
          onFiltersChange={setFilters}
          me={me}
          canEdit={canEdit}
          onClose={() => setManageOpen(false)}
          onOpen={(t) => {
            setSelectedTicketId(t.id)
            setEditorMode('view')
            setEditorTab('details')
            setEditorOpen(true)
          }}
          onHistory={(t) => {
            setSelectedTicketId(t.id)
            setEditorMode('view')
            setEditorTab('activity')
            setEditorOpen(true)
          }}
          onEdit={(t) => {
            setSelectedTicketId(t.id)
            setEditorMode('edit')
            setEditorTab('details')
            setEditorOpen(true)
          }}
          onGoToLocation={(t) => {
            setManageOpen(false)
            setFlyTo({ lat: t.lat, lng: t.lng, nonce: Date.now() })
          }}
          onGoToCamera={(t) => openTicketCamera(t, 'goto')}
        />

        <EarthTicketCreateDialog
          location={createAt}
          creator={me}
          onClose={() => setCreateAt(null)}
          onCreated={(ticket) => {
            setCreateAt(null)
            setFlyTo({ lat: ticket.lat, lng: ticket.lng, nonce: Date.now() })
            setSelectedTicketId(ticket.id)
            setEditorMode('view')
            setEditorTab('details')
            setEditorOpen(true)
          }}
        />

        <TicketEditorDialog
          open={editorOpen && Boolean(selectedTicket)}
          mode={editorMode}
          ticket={selectedTicket}
          initialTab={editorTab}
          onClose={() => {
            setEditorOpen(false)
            setSelectedTicketId(null)
            setEditorTab('details')
          }}
        />
      </Box>

      {site && selection && (
        <Box sx={{ position: 'absolute', inset: 0, zIndex: 2 }}>
          <LiveView key={selection.id} site={site} selectionKind={selection.kind} focus={focus} onClose={close} />
        </Box>
      )}
    </Box>
  )
}
