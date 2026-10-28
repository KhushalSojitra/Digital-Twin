import { Box } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import type { Ticket } from '../../data/tickets'
import { useTicketReads } from '../../state/TicketReadsContext'

interface Props {
  ticket?: Ticket
  /** Show the dot when any of these has an unseen update (used by site clusters). */
  tickets?: Ticket[]
  size?: number
  sx?: SxProps<Theme>
}

export const UPDATE_DOT_COLOR = '#0A84FF'

/** Small dot marking a ticket with an update the signed-in user has not opened yet. */
export default function TicketUpdateDot({ ticket, tickets, size = 10, sx }: Props) {
  const { hasUpdate } = useTicketReads()
  const flagged = ticket ? hasUpdate(ticket) : (tickets ?? []).some(hasUpdate)
  if (!flagged) return null
  return (
    <Box
      role="img"
      aria-label="New update on this ticket"
      title="New update"
      data-ticket-update-dot
      sx={[
        {
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: '50%',
          bgcolor: UPDATE_DOT_COLOR,
          border: '1.5px solid #fff',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
          pointerEvents: 'none',
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    />
  )
}
