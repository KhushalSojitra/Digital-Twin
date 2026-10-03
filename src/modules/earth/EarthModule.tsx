import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Box, IconButton, Stack, Tooltip, useTheme } from '@mui/material'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import { hudSurface } from '../../theme/hud'
import { getSite, selectionForCombo, type CameraSite } from '../../data/cameras'
import { isCompleted, type Ticket } from '../../data/tickets'
import { useCameraSelection } from '../../state/CameraSelectionContext'
import { useTickets } from '../../state/TicketsContext'
import { useAuth } from '../../auth/AuthContext'
import EarthMap from './EarthMap'
import LiveView, { type TicketFocus } from './LiveView'
import TicketMenu from '../tickets/TicketMenu'
import TicketManageDialog from '../tickets/TicketManageDialog'
import TicketEditorDialog from '../tickets/TicketEditorDialog'
import { applyTicketQuery } from '../tickets/ticketFilters'
import { useTicketQuery } from '../../state/TicketQueryContext'
import { isWithinStoreWindow } from '../../data/integrations'
import { useIntegrations } from '../../state/IntegrationsContext'

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
  const { integrations } = useIntegrations()
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

  const storedTickets = useMemo(() => tickets.filter((t) => isWithinStoreWindow(t, integrations)), [tickets, integrations])
  const visibleTickets = useMemo(
    () => applyTicketQuery(storedTickets, { tab: 'all', search: '', filters, me, assignedToMe: false }),
    [storedTickets, filters, me],
  )
  const completedCount = useMemo(() => visibleTickets.filter(isCompleted).length, [visibleTickets])
  const mapTickets = earthTicketView
    ? visibleTickets.filter(
        (t) => !isCompleted(t) || t.id === selectedTicketId || (showImprovements && t.snapshotConfig.showInImprovementHistory),
      )
    : []

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
    const cameraSite = getSite(ticket.siteId)
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
        />

        <Stack
          direction="row"
          spacing={0.75}
          sx={{ position: 'absolute', top: 10, right: 10, alignItems: 'center', zIndex: 3, maxWidth: 'calc(100% - 20px)' }}
        >
          <Tooltip title={earthTicketView ? 'Improvements' : 'Enable ticket view to show history'}>
            <Box component="span" sx={{ display: 'inline-flex' }}>
              <IconButton
                size="small"
                aria-label="Improvements"
                aria-pressed={showImprovements}
                disabled={!earthTicketView}
                onClick={() => setShowImprovements((v) => !v)}
                sx={{
                  ...glass,
                  width: 40,
                  height: 40,
                  borderRadius: '12px',
                  ...(showImprovements &&
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
          tickets={storedTickets}
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
            openTicketCamera(t, 'goto')
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
