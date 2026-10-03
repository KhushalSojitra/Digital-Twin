import { Box, Tooltip, Typography } from '@mui/material'
import { STATUS_COLOR, STATUS_LABEL, type Ticket, type TicketStatus } from '../../data/tickets'
import { TICKET_SIZE_PX } from '../tickets/ticketFilters'
import { useTicketQuery } from '../../state/TicketQueryContext'

const ORDER: TicketStatus[] = ['open', 'in_progress', 'done', 'accepted', 'failed']

interface Props {
  siteName: string
  tickets: Ticket[]
  onClick: () => void
}

function ClusterCopy({
  siteName,
  tickets,
  counts,
  hint = false,
}: {
  siteName: string
  tickets: Ticket[]
  counts: { status: TicketStatus; n: number }[]
  hint?: boolean
}) {
  return (
    <>
      <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>
        {siteName} · {tickets.length} tickets
      </Typography>
      {counts.map(({ status, n }) => (
        <Typography key={status} sx={{ fontSize: 11.5 }}>
          <Box component="span" sx={{ color: STATUS_COLOR[status], fontWeight: 700 }}>
            {n}
          </Box>{' '}
          {STATUS_LABEL[status]}
        </Typography>
      ))}
      {hint && (
        <Typography sx={{ fontSize: 10.5, opacity: 0.7, mt: 0.25 }}>Click to zoom in</Typography>
      )}
    </>
  )
}

/** One ticket-shaped badge per site while the map is zoomed out. */
export default function TicketCluster({ siteName, tickets, onClick }: Props) {
  const { ticketSize, earthTicketPreview } = useTicketQuery()
  const counts = ORDER.map((status) => ({ status, n: tickets.filter((t) => t.status === status).length })).filter((s) => s.n > 0)
  const lead = counts[0]?.status ?? 'open'
  const px = Math.round(TICKET_SIZE_PX[ticketSize] * (40 / 28))

  const badge = (
    <Box
      role="button"
      aria-label={`${tickets.length} tickets at ${siteName}`}
      data-ticket-preview={earthTicketPreview ? 'open' : 'hover'}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      sx={{
        position: 'relative',
        width: px,
        height: Math.round(px * 0.8),
        cursor: 'pointer',
        display: 'grid',
        placeItems: 'center',
        '&:hover svg': { transform: 'scale(1.1)' },
      }}
    >
      {earthTicketPreview && (
        <Box
          data-ticket-preview-card={siteName}
          sx={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            mb: 0.4,
            px: 0.75,
            py: 0.4,
            minWidth: 120,
            maxWidth: 200,
            borderRadius: '8px',
            bgcolor: 'rgba(0,0,0,0.74)',
            color: '#fff',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.18)',
            boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
            zIndex: 2,
            whiteSpace: 'nowrap',
          }}
        >
          <ClusterCopy siteName={siteName} tickets={tickets} counts={counts} />
        </Box>
      )}
      <Box
        component="svg"
        viewBox="0 0 40 28"
        sx={{ width: px, height: Math.round(px * 0.7), transition: 'transform 150ms', filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.55))' }}
      >
        <path
          d="M3.4 3.6 h22.4 a2.8 2.8 0 0 1 0 6.4 a2.8 2.8 0 0 1 0 7.2 H3.4 a2.8 2.8 0 0 1 0 -7.2 a2.8 2.8 0 0 1 0 -6.4 z"
          fill={STATUS_COLOR[lead]}
          stroke="#fff"
          strokeWidth="1.4"
        />
        <path d="M12.2 3.8 v20.4" stroke="#fff" strokeWidth="1.1" strokeDasharray="1.5 1.7" opacity="0.85" />
        <text x="24" y="15.2" textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="11" fontWeight="700" fontFamily="inherit">
          {tickets.length}
        </text>
      </Box>
    </Box>
  )

  if (earthTicketPreview) return badge

  return (
    <Tooltip
      arrow
      placement="top"
      title={
        <Box sx={{ p: 0.25 }}>
          <ClusterCopy siteName={siteName} tickets={tickets} counts={counts} hint />
        </Box>
      }
    >
      {badge}
    </Tooltip>
  )
}
