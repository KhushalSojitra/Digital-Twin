import { Box, Typography } from '@mui/material'
import { PRIORITY_LABEL, STATUS_COLOR, STATUS_LABEL, type Ticket } from '../../data/tickets'

/** Shared hover content for every ticket marker: title first, then state and priority. */
export default function TicketHoverCopy({ ticket }: { ticket: Ticket }) {
  return (
    <>
      <Typography sx={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
        {ticket.title}
      </Typography>
      <Typography sx={{ fontSize: 11.5, mt: 0.25 }}>
        <Box component="span" sx={{ color: STATUS_COLOR[ticket.status], fontWeight: 700 }}>
          {STATUS_LABEL[ticket.status]}
        </Box>
        {' · '}
        {PRIORITY_LABEL[ticket.priority]}
      </Typography>
    </>
  )
}
