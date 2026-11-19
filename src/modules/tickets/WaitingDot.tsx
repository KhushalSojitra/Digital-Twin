import { Box, keyframes } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import { useInbox } from '../../state/InboxContext'

export const WAITING_COLOR = '#FF9F0A'

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 rgba(255,159,10,0.55); }
  70% { box-shadow: 0 0 0 7px rgba(255,159,10,0); }
  100% { box-shadow: 0 0 0 0 rgba(255,159,10,0); }
`

interface Props {
  ticketId: string
  size?: number
  /** Gentle pulse; used on map pins so the waiting ticket catches the eye. */
  animate?: boolean
  sx?: SxProps<Theme>
}

/** Amber dot marking a ticket that is waiting on the signed-in user (an open mention, reply or assignment). */
export default function WaitingDot({ ticketId, size = 10, animate = false, sx }: Props) {
  const { isWaiting } = useInbox()
  if (!isWaiting(ticketId)) return null
  return (
    <Box
      role="img"
      aria-label="Waiting on you"
      title="Waiting on you"
      data-ticket-waiting-dot
      sx={[
        {
          width: size,
          height: size,
          flexShrink: 0,
          borderRadius: '50%',
          bgcolor: WAITING_COLOR,
          border: '1.5px solid #fff',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
          pointerEvents: 'none',
          ...(animate && {
            animation: `${pulse} 2.2s ease-out infinite`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }),
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    />
  )
}
