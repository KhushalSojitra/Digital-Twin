import { Box, Tooltip, Typography } from '@mui/material'
import { PRIORITY_LABEL, STATUS_COLOR, STATUS_LABEL, cameraName, type Ticket } from '../../data/tickets'
import TicketGlyph from '../../components/TicketGlyph'
import { TICKET_SIZE_PX } from '../tickets/ticketFilters'
import { useTicketQuery } from '../../state/TicketQueryContext'

interface Props {
  ticket: Ticket
  selected: boolean
  onClick: () => void
}

function PreviewCopy({ ticket, color }: { ticket: Ticket; color: string }) {
  return (
    <>
      <Typography sx={{ fontSize: 12.5, fontWeight: 700, fontFamily: '"SF Mono", ui-monospace, Menlo, monospace' }}>
        {ticket.id}
      </Typography>
      <Typography sx={{ fontSize: 11.5 }}>
        <Box component="span" sx={{ color, fontWeight: 700 }}>
          {STATUS_LABEL[ticket.status]}
        </Box>
        {' · '}
        {PRIORITY_LABEL[ticket.priority]} priority
      </Typography>
      <Typography sx={{ fontSize: 11, opacity: 0.85, mt: 0.25 }}>{ticket.title}</Typography>
      <Typography sx={{ fontSize: 10.5, opacity: 0.7 }}>{cameraName(ticket.cameraId)}</Typography>
    </>
  )
}

export default function TicketPin({ ticket, selected, onClick }: Props) {
  const { ticketSize, earthTicketPreview } = useTicketQuery()
  const color = STATUS_COLOR[ticket.status]
  const px = TICKET_SIZE_PX[ticketSize]
  const pin = (
    <Box
      role="button"
      aria-label={`Ticket ${ticket.id}: ${STATUS_LABEL[ticket.status]}`}
      data-ticket-preview={earthTicketPreview ? 'open' : 'hover'}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      sx={{
        position: 'relative',
        width: px + 8,
        height: px,
        cursor: 'pointer',
        display: 'grid',
        placeItems: 'center',
        borderRadius: '8px',
        '&:hover svg': { transform: 'scale(1.18)' },
      }}
    >
      {earthTicketPreview && (
        <Box
          data-ticket-preview-card={ticket.id}
          sx={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            mb: 0.4,
            px: 0.75,
            py: 0.4,
            minWidth: 112,
            maxWidth: 188,
            borderRadius: '8px',
            bgcolor: 'rgba(0,0,0,0.74)',
            color: '#fff',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.18)',
            boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <PreviewCopy ticket={ticket} color={color} />
        </Box>
      )}
      <TicketGlyph color={color} size={px} selected={selected} critical={ticket.priority === 'critical'} />
    </Box>
  )

  if (earthTicketPreview) return pin

  return (
    <Tooltip
      arrow
      placement="top"
      enterDelay={120}
      title={
        <Box sx={{ p: 0.25 }}>
          <PreviewCopy ticket={ticket} color={color} />
        </Box>
      }
    >
      {pin}
    </Tooltip>
  )
}
