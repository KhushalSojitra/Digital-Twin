import { useCallback, useEffect, useRef } from 'react'
import { Box, Tooltip, Typography } from '@mui/material'
import { PRIORITY_LABEL, STATUS_COLOR, STATUS_LABEL, type Ticket } from '../../data/tickets'
import TicketGlyph from '../../components/TicketGlyph'
import { useViewerFrame, type Projector } from './viewerProjection'
import { TICKET_SIZE_PX } from '../tickets/ticketFilters'
import { useTicketQuery } from '../../state/TicketQueryContext'

export interface DraftMarker {
  yaw: number
  pitch: number
}

interface Props {
  tickets: Ticket[]
  selectedId: string | null
  /** Ticket currently being navigated to; gets the target-area reticle. */
  targetId?: string | null
  draft?: DraftMarker | null
  compact?: boolean
  onSelect: (ticket: Ticket) => void
}

const DRAFT_KEY = '__draft'
const TARGET_KEY = '__target'

export default function TicketMarkerLayer({ tickets, selectedId, targetId = null, draft = null, compact = false, onSelect }: Props) {
  const { ticketSize } = useTicketQuery()
  const nodes = useRef(new Map<string, HTMLElement>())
  const ticketsRef = useRef(tickets)
  const draftRef = useRef(draft)
  const targetRef = useRef(targetId)
  const place = (key: string, project: Projector, dir: { yaw: number; pitch: number }) => {
    const el = nodes.current.get(key)
    if (!el) return
    const p = project(dir)
    if (!p.visible) {
      el.style.display = 'none'
      return
    }
    el.style.display = 'block'
    el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`
  }

  const onFrame = useCallback((project: Projector) => {
    for (const t of ticketsRef.current) place(t.id, project, t)
    if (draftRef.current) place(DRAFT_KEY, project, draftRef.current)
    const target = targetRef.current ? ticketsRef.current.find((t) => t.id === targetRef.current) : null
    if (target) place(TARGET_KEY, project, target)
  }, [])
  const hub = useViewerFrame(onFrame)
  useEffect(() => {
    ticketsRef.current = tickets
    draftRef.current = draft
    targetRef.current = targetId
    hub?.requestFrame()
  }, [tickets, draft, targetId, hub])

  const register = (key: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(key, el)
    else nodes.current.delete(key)
  }

  const size = Math.round(TICKET_SIZE_PX[ticketSize] * (compact ? 16 / 28 : 24 / 28))
  const target = targetId ? tickets.find((t) => t.id === targetId) : null

  return (
    <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {target && (
        <Box
          ref={register(TARGET_KEY)}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            display: 'none',
            width: compact ? 70 : 150,
            height: compact ? 70 : 150,
            borderRadius: '50%',
            border: `2px dashed ${STATUS_COLOR[target.status]}`,
            boxShadow: `0 0 0 1px rgba(0,0,0,0.5), inset 0 0 40px ${STATUS_COLOR[target.status]}33`,
            opacity: 0.85,
            '&::before, &::after': { content: '""', position: 'absolute', bgcolor: STATUS_COLOR[target.status], opacity: 0.8 },
            '&::before': { left: '50%', top: -10, bottom: -10, width: '1px', transform: 'translateX(-50%)' },
            '&::after': { top: '50%', left: -10, right: -10, height: '1px', transform: 'translateY(-50%)' },
          }}
        />
      )}

      {tickets.map((t) => {
        const color = STATUS_COLOR[t.status]
        const selected = t.id === selectedId
        return (
          <Tooltip
            key={t.id}
            arrow
            placement="top"
            enterDelay={100}
            title={
              <Box sx={{ p: 0.25 }}>
                <Typography sx={{ fontSize: 12.5, fontWeight: 700, fontFamily: '"SF Mono", ui-monospace, Menlo, monospace' }}>
                  {t.id}
                </Typography>
                <Typography sx={{ fontSize: 11.5 }}>
                  <Box component="span" sx={{ color, fontWeight: 700 }}>
                    {STATUS_LABEL[t.status]}
                  </Box>
                  {' · '}
                  {PRIORITY_LABEL[t.priority]} priority
                </Typography>
                <Typography sx={{ fontSize: 11, opacity: 0.8, mt: 0.25 }}>{t.title}</Typography>
              </Box>
            }
          >
            <Box
              ref={register(t.id)}
              role="button"
              aria-label={`Ticket ${t.id}: ${STATUS_LABEL[t.status]}, ${PRIORITY_LABEL[t.priority]} priority`}
              onClick={(e) => {
                e.stopPropagation()
                onSelect(t)
              }}
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                display: 'none',
                pointerEvents: 'auto',
                cursor: 'pointer',
                width: size + 16,
                height: size + 12,
                zIndex: selected ? 2 : 1,
                placeItems: 'center',
              }}
            >
              <TicketGlyph color={color} size={size} selected={selected} critical={t.priority === 'critical'} />
            </Box>
          </Tooltip>
        )
      })}

      {draft && (
        <Box
          ref={register(DRAFT_KEY)}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            display: 'none',
            width: 30,
            height: 22,
            borderRadius: '6px',
            border: '2px dashed #0A84FF',
            bgcolor: 'rgba(10,132,255,0.35)',
            boxShadow: '0 0 0 2px rgba(255,255,255,0.7)',
          }}
        />
      )}
    </Box>
  )
}
