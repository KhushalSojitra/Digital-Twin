import { Box, Typography } from '@mui/material'
import { PRIORITY_LABEL, STATUS_COLOR, type Ticket } from '../../data/tickets'
import { useWorkflow } from '../../state/WorkflowContext'

/** Shared hover content for every ticket marker: title first, then state and priority. */
export default function TicketHoverCopy({ ticket }: { ticket: Ticket }) {
  const { stateLabel } = useWorkflow()
  return (
    <>
      <Typography sx={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
        {ticket.title}
      </Typography>
      <Typography sx={{ fontSize: 11.5, mt: 0.25 }}>
        <Box component="span" sx={{ color: STATUS_COLOR[ticket.status], fontWeight: 700 }}>
          {stateLabel(ticket)}
        </Box>
        {' · '}
        {PRIORITY_LABEL[ticket.priority]}
      </Typography>
    </>
  )
}
