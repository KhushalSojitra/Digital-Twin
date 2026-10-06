import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as maplibregl from 'maplibre-gl'
import type { MapSourceDataEvent, StyleSpecification } from 'maplibre-gl'
import { Box, Chip, CircularProgress, Fab, Paper, Stack, Tooltip, Typography } from '@mui/material'
import HomeRoundedIcon from '@mui/icons-material/HomeRounded'
import CloudOffRoundedIcon from '@mui/icons-material/CloudOffRounded'
import { HOME_LOCATION, SITES, siteCenter, type CameraSite } from '../../data/cameras'
import CameraPin from './CameraPin'
import TicketPin from './TicketPin'
import TicketCluster from './TicketCluster'
import type { Ticket } from '../../data/tickets'

/** Below this zoom the site labels collapse to the short name only. */
const LABEL_ZOOM = 15.6
/** Below this zoom individual ticket markers collapse into one badge per site. */
const TICKET_ZOOM = 16.4

interface Props {
  /** Site to fly to when the operator picks a camera from the header dropdown. */
  focusSiteId: string | null
  onSelectSite: (site: CameraSite) => void
  /** Tickets to plot as status-coloured markers (already filtered by the caller). */
  tickets: Ticket[]
  selectedTicketId: string | null
  onSelectTicket: (ticket: Ticket) => void
  flyToTicket?: { lat: number; lng: number; nonce: number } | null
  /** While true the next map click is reported through onPickLocation instead of panning. */
  pickMode?: boolean
  onPickLocation?: (lat: number, lng: number) => void
  /** Location of a ticket being drafted; rendered as a temporary marker. */
  draft?: { lat: number; lng: number } | null
}

type TicketOverlay =
  | { key: string; kind: 'ticket'; lat: number; lng: number; ticket: Ticket }
  | { key: string; kind: 'cluster'; lat: number; lng: number; siteId: string; siteName: string; tickets: Ticket[] }

interface TicketMarkerEntry {
  overlay: TicketOverlay
  marker: maplibregl.Marker
  el: HTMLDivElement
}

const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  projection: { type: 'globe' },
  sky: {
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0],
  },
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#05070c' } },
    { id: 'satellite', type: 'raster', source: 'satellite', paint: { 'raster-fade-duration': 200 } },
  ],
}

interface MarkerEntry {
  site: CameraSite
  el: HTMLDivElement
}

export default function EarthMap({
  focusSiteId,
  onSelectSite,
  tickets,
  selectedTicketId,
  onSelectTicket,
  flyToTicket = null,
  pickMode = false,
  onPickLocation,
  draft = null,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [markers, setMarkers] = useState<MarkerEntry[]>([])
  const [imagery, setImagery] = useState<'loading' | 'ready' | 'error'>('loading')
  const [zoomedOut, setZoomedOut] = useState(true)
  const [clustered, setClustered] = useState(true)
  const ticketMarkersRef = useRef(new Map<string, TicketMarkerEntry>())
  const [ticketEntries, setTicketEntries] = useState<TicketMarkerEntry[]>([])
  const [mapReady, setMapReady] = useState(false)
  const onSelectRef = useRef(onSelectSite)
  useEffect(() => {
    onSelectRef.current = onSelectSite
  }, [onSelectSite])
  const pickModeRef = useRef(pickMode)
  const onPickRef = useRef(onPickLocation)
  useEffect(() => {
    pickModeRef.current = pickMode
    onPickRef.current = onPickLocation
  }, [pickMode, onPickLocation])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const map = new maplibregl.Map({
      container,
      style: SATELLITE_STYLE,
      center: [-40, 28],
      zoom: 1.6,
      pitch: 0,
      bearing: 0,
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
    })
    mapRef.current = map
    setMapReady(true)

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
    map.dragRotate.enable()
    map.touchZoomRotate.enableRotation()

    const entries: MarkerEntry[] = SITES.map((site) => {
      const el = document.createElement('div')
      el.style.zIndex = '2'
      const center = siteCenter(site)
      new maplibregl.Marker({ element: el, anchor: 'top', offset: [0, -44] }).setLngLat([center.lng, center.lat]).addTo(map)
      return { site, el }
    })
    setMarkers(entries)

    const flyHome = () => {
      map.flyTo({ ...HOME_LOCATION, duration: 4200, curve: 1.3, essential: true })
    }

    const syncZoom = () => {
      const z = map.getZoom()
      setZoomedOut(z < LABEL_ZOOM)
      setClustered(z < TICKET_ZOOM)
    }
    syncZoom()
    map.on('zoom', syncZoom)
    map.on('click', (e) => {
      if (pickModeRef.current) onPickRef.current?.(e.lngLat.lat, e.lngLat.lng)
    })

    let tileOk = false
    let tileErr = false
    const markReady = () => setImagery('ready')

    map.on('load', () => {
      window.setTimeout(flyHome, 450)
    })
    map.once('idle', () => {
      if (tileErr && !tileOk) setImagery('error')
      else markReady()
    })
    map.on('error', (e) => {
      if ((e as { sourceId?: string }).sourceId === 'satellite') {
        tileErr = true
        if (!tileOk) setImagery('error')
      }
    })
    map.on('sourcedata', (e: MapSourceDataEvent) => {
      if (e.sourceId === 'satellite' && (e.isSourceLoaded || e.tile)) {
        tileOk = true
        tileErr = false
        markReady()
      }
    })
    const timeout = window.setTimeout(() => {
      setImagery((prev) => {
        if (prev === 'ready') return prev
        return tileOk ? 'ready' : 'error'
      })
    }, 8000)

    const ticketMarkers = ticketMarkersRef.current
    return () => {
      window.clearTimeout(timeout)
      map.remove()
      mapRef.current = null
      ticketMarkers.clear()
      setMarkers([])
      setTicketEntries([])
      setMapReady(false)
    }
  }, [])

  const overlays = useMemo<TicketOverlay[]>(() => {
    if (!clustered) return tickets.map((t) => ({ key: `t:${t.id}`, kind: 'ticket', lat: t.lat, lng: t.lng, ticket: t }))
    return SITES.flatMap((site) => {
      const own = tickets.filter((t) => t.siteId === site.id)
      if (own.length === 0) return []
      return [
        {
          key: `c:${site.id}`,
          kind: 'cluster' as const,
          lat: own.reduce((a, t) => a + t.lat, 0) / own.length,
          lng: own.reduce((a, t) => a + t.lng, 0) / own.length,
          siteId: site.id,
          siteName: site.name,
          tickets: own,
        },
      ]
    })
  }, [tickets, clustered])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const live = ticketMarkersRef.current
    const wanted = new Set(overlays.map((o) => o.key))
    for (const [key, entry] of live) {
      if (!wanted.has(key)) {
        entry.marker.remove()
        live.delete(key)
      }
    }
    for (const overlay of overlays) {
      const existing = live.get(overlay.key)
      if (existing) {
        existing.overlay = overlay
        existing.marker.setLngLat([overlay.lng, overlay.lat])
        existing.el.style.zIndex = overlay.kind === 'cluster' ? '3' : overlay.ticket.id === selectedTicketId ? '4' : '1'
        continue
      }
      const el = document.createElement('div')
      el.style.zIndex = overlay.kind === 'cluster' ? '3' : '1'
      const marker = new maplibregl.Marker({ element: el, anchor: 'center', offset: overlay.kind === 'cluster' ? [-42, -16] : [0, 0] })
        .setLngLat([overlay.lng, overlay.lat])
        .addTo(map)
      live.set(overlay.key, { overlay, marker, el })
    }
    setTicketEntries([...live.values()])
  }, [overlays, mapReady, selectedTicketId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !flyToTicket) return
    map.flyTo({
      center: [flyToTicket.lng, flyToTicket.lat],
      zoom: Math.max(map.getZoom(), 17.6),
      pitch: 60,
      duration: 1600,
      essential: true,
    })
  }, [flyToTicket])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusSiteId) return
    const site = SITES.find((s) => s.id === focusSiteId)
    if (!site) return
    const center = siteCenter(site)
    map.flyTo({ center: [center.lng, center.lat], zoom: 17.2, pitch: 62, bearing: -30, duration: 2200, essential: true })
  }, [focusSiteId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    map.getCanvas().style.cursor = pickMode ? 'crosshair' : ''
  }, [pickMode, mapReady])

  const draftLat = draft?.lat
  const draftLng = draft?.lng
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || draftLat === undefined || draftLng === undefined) return
    const el = document.createElement('div')
    el.style.cssText =
      'width:18px;height:18px;border-radius:50%;background:#0A84FF;border:3px solid #fff;box-shadow:0 0 0 6px rgba(10,132,255,0.35);'
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([draftLng, draftLat]).addTo(map)
    return () => {
      marker.remove()
    }
  }, [draftLat, draftLng, mapReady])

  const zoomTo = (lng: number, lat: number) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom: 17.6, pitch: 55, duration: 1500, essential: true })
  }

  const goHome = () => {
    mapRef.current?.flyTo({ ...HOME_LOCATION, duration: 2600, essential: true })
  }

  return (
    <Box sx={{ position: 'absolute', inset: 0, bgcolor: '#05070c' }}>
      <Box
        ref={containerRef}
        sx={{
          position: 'absolute',
          inset: 0,
          '& .maplibregl-ctrl-bottom-right': { bottom: 56, right: 12 },
          '& .oe-pin-label': { display: zoomedOut ? 'none' : 'block' },
          '& .oe-site-label': { display: zoomedOut ? 'block' : 'none' },
          '& .maplibregl-marker:hover': { zIndex: '5 !important' },
          '& .maplibregl-marker:hover .oe-pin-label': { display: 'block' },
          '& .maplibregl-marker:hover .oe-site-label': { display: 'none' },
        }}
      />

      {markers.map(({ site, el }) =>
        createPortal(<CameraPin site={site} onClick={() => onSelectRef.current(site)} />, el, site.id),
      )}
      {ticketEntries.map(({ overlay, el }) =>
        createPortal(
          overlay.kind === 'ticket' ? (
            <TicketPin
              ticket={overlay.ticket}
              selected={overlay.ticket.id === selectedTicketId}
              onClick={() => onSelectTicket(overlay.ticket)}
            />
          ) : (
            <TicketCluster siteName={overlay.siteName} tickets={overlay.tickets} onClick={() => zoomTo(overlay.lng, overlay.lat)} />
          ),
          el,
          overlay.key,
        ),
      )}

      {imagery === 'loading' && (
        <Paper
          elevation={0}
          sx={{
            position: 'absolute',
            top: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            px: 1.5,
            py: 0.75,
            borderRadius: '999px',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: 'rgba(0,0,0,0.6)',
            color: '#fff',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.14)',
          }}
        >
          <CircularProgress size={14} thickness={5} sx={{ color: '#5AC8FA' }} />
          <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>Loading Earth imagery…</Typography>
        </Paper>
      )}

      {imagery === 'error' && (
        <Paper
          elevation={0}
          sx={{
            position: 'absolute',
            top: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            px: 1.5,
            py: 0.75,
            borderRadius: '999px',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: 'rgba(0,0,0,0.72)',
            color: '#fff',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,159,10,0.45)',
          }}
        >
          <CloudOffRoundedIcon sx={{ fontSize: 18, color: '#FF9F0A' }} />
          <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>Earth imagery unavailable — check network</Typography>
        </Paper>
      )}

      {imagery === 'error' && (
        <Chip
          icon={<CloudOffRoundedIcon />}
          color="warning"
          size="small"
          label="Satellite imagery unavailable"
          sx={{ position: 'absolute', bottom: 48, left: 12 }}
        />
      )}

      <Paper
        elevation={0}
        sx={{
          position: 'absolute',
          left: 12,
          bottom: 12,
          px: 1.25,
          py: 0.5,
          borderRadius: '999px',
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          bgcolor: 'rgba(0,0,0,0.55)',
          color: '#fff',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.14)',
        }}
      >
        <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{SITES.length} combo cameras</Typography>
        <Legend color="#0A84FF" label="360 + PTZ" />
      </Paper>

      <Typography
        sx={{
          position: 'absolute',
          bottom: 4,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 10,
          color: 'rgba(255,255,255,0.7)',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        © 2026 OominiEye. All rights reserved.
      </Typography>

      <Tooltip title="Return to home location" placement="left">
        <Fab
          size="small"
          color="primary"
          onClick={goHome}
          aria-label="Return to home location"
          sx={{ position: 'absolute', right: 12, bottom: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}
        >
          <HomeRoundedIcon fontSize="small" />
        </Fab>
      </Tooltip>
    </Box>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, border: '1.5px solid rgba(255,255,255,0.9)' }} />
      <Typography sx={{ fontSize: 12.5, opacity: 0.9 }}>{label}</Typography>
    </Stack>
  )
}
