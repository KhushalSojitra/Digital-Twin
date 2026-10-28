import { Box, Tooltip } from '@mui/material'
import { STATUS_COLOR, STATUS_LABEL, type Ticket } from '../../data/tickets'
import TicketHoverCopy from '../tickets/TicketHoverCopy'
import TicketGlyph from '../../components/TicketGlyph'
import { TICKET_SIZE_PX } from '../tickets/ticketFilters'
import { useTicketQuery } from '../../state/TicketQueryContext'
import { useTicketMarkerMenu } from '../tickets/TicketMarkerMenu'

interface Props {
  ticket: Ticket
  selected: boolean
  onClick: () => void
}

export default function TicketPin({ ticket, selected, onClick }: Props) {
  const { ticketSize, earthTicketPreview } = useTicketQuery()
  const { onContextMenu, menu } = useTicketMarkerMenu()
  const color = STATUS_COLOR[ticket.status]
  const px = TICKET_SIZE_PX[ticketSize]
  const pin = (
    <Box
      role="button"
      aria-label={`${ticket.title}: ${STATUS_LABEL[ticket.status]}`}
      data-ticket-preview={earthTicketPreview ? 'open' : 'hover'}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onContextMenu={(e) => onContextMenu(e, ticket)}
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
          <TicketHoverCopy ticket={ticket} />
        </Box>
      )}
      <TicketGlyph color={color} size={px} selected={selected} critical={ticket.priority === 'critical'} />
    </Box>
  )

  if (earthTicketPreview) {
    return (
      <>
        {pin}
        {menu}
      </>
    )
  }

  return (
    <>
      <Tooltip
        arrow
        placement="top"
        enterDelay={120}
        title={
          <Box sx={{ p: 0.25 }}>
            <TicketHoverCopy ticket={ticket} />
          </Box>
        }
      >
        {pin}
      </Tooltip>
      {menu}
    </>
  )
}
