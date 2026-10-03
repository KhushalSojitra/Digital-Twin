import { Box } from '@mui/material'

interface Props {
  color: string
  size?: number
  selected?: boolean
  critical?: boolean
}

/** Ticket-stub glyph used on Earth, Live View overlays and compact lists. */
export default function TicketGlyph({ color, size = 22, selected = false, critical = false }: Props) {
  return (
    <Box
      component="svg"
      viewBox="0 0 28 22"
      sx={{
        width: size,
        height: size * (22 / 28),
        display: 'block',
        overflow: 'visible',
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.55))',
        transition: 'transform 150ms',
        transform: selected ? 'scale(1.28)' : 'scale(1)',
      }}
    >
      <path
        d="M3.2 3.4 h15.2 a2.4 2.4 0 0 1 0 5.6 a2.4 2.4 0 0 1 0 5.6 H3.2 a2.4 2.4 0 0 1 0 -5.6 a2.4 2.4 0 0 1 0 -5.6 z"
        fill={color}
        stroke="#fff"
        strokeWidth={selected ? 1.8 : 1.3}
      />
      <path d="M9.2 3.6 v14.8" stroke="#fff" strokeWidth="1.1" strokeDasharray="1.4 1.6" opacity="0.85" />
      {critical && <circle cx="19.4" cy="11" r="1.7" fill="#fff" />}
    </Box>
  )
}
