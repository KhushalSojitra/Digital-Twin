import { Paper, Slide } from '@mui/material'
import type { Ticket } from '../../data/tickets'
import TicketDetailsContent from './TicketDetailsContent'

interface Props {
  ticket: Ticket | null
  onClose: () => void
  onGoToLocation: (ticket: Ticket) => void
}

/** Slides in over the ticket list only, so the live video stage is never covered. */
export default function TicketDetailsDrawer({ ticket, onClose, onGoToLocation }: Props) {
  return (
    <Slide direction="left" in={Boolean(ticket)} mountOnEnter unmountOnExit>
      <Paper
        elevation={0}
        square
        role="dialog"
        aria-label={ticket ? `Ticket ${ticket.id} details` : 'Ticket details'}
        sx={(t) => ({
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          borderLeft: `1px solid ${t.palette.divider}`,
          bgcolor: t.palette.mode === 'dark' ? '#10141b' : '#ffffff',
        })}
      >
        {ticket && <TicketDetailsContent ticket={ticket} onClose={onClose} onGoToLocation={onGoToLocation} />}
      </Paper>
    </Slide>
  )
}
