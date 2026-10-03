import { Avatar, Chip, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material'
import MyLocationRoundedIcon from '@mui/icons-material/MyLocationRounded'
import { PRIORITY_COLOR, PRIORITY_LABEL, STATUS_COLOR, STATUS_LABEL, STATUS_NEEDS_DARK_TEXT, type Ticket } from '../../data/tickets'
import { formatRelative, initials } from '../../utils/format'
import TicketGlyph from '../../components/TicketGlyph'

interface Props {
  /** Signed-in operator, used to flag tickets they watch. */
  me: string
  ticket: Ticket
  selected?: boolean
  onOpen: (ticket: Ticket) => void
  onGoToLocation?: (ticket: Ticket) => void
}

export default function TicketCard({ ticket, selected = false, onOpen, onGoToLocation }: Props) {
  return (
    <Paper
      elevation={0}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(ticket)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(ticket)
        }
      }}
      sx={(t) => ({
        position: 'relative',
        p: 1,
        pl: 1.5,
        borderRadius: '12px',
        border: `1px solid ${selected ? t.palette.primary.main : t.palette.divider}`,
        boxShadow: selected ? `0 0 0 1px ${t.palette.primary.main}` : 'none',
        cursor: 'pointer',
        overflow: 'hidden',
        transition: 'transform 120ms, border-color 120ms, background-color 120ms',
        '&:hover': { borderColor: t.palette.primary.main, bgcolor: t.palette.action.hover },
        '&:focus-visible': { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 1 },
        '&::before': {
          content: '""',
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          bgcolor: PRIORITY_COLOR[ticket.priority],
        },
      })}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
          <TicketGlyph color={STATUS_COLOR[ticket.status]} size={18} critical={ticket.priority === 'critical'} />
          <Typography sx={{ fontFamily: '"SF Mono", ui-monospace, Menlo, monospace', fontSize: 12.5, fontWeight: 700 }}>
            {ticket.id}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Chip
            size="small"
            label={STATUS_LABEL[ticket.status]}
            sx={{
              height: 20,
              fontSize: 10.5,
              color: STATUS_NEEDS_DARK_TEXT.includes(ticket.status) ? '#1C1C1E' : '#fff',
              bgcolor: STATUS_COLOR[ticket.status],
              '& .MuiChip-label': { px: 1 },
            }}
          />
          {onGoToLocation && (
            <Tooltip title="Go to location">
              <IconButton
                size="small"
                aria-label={`Go to location of ${ticket.id}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onGoToLocation(ticket)
                }}
                sx={{ p: 0.25 }}
              >
                <MyLocationRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Stack>

      <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600, mt: 0.5 }}>
        {ticket.title}
      </Typography>

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mt: 0.75 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Tooltip title={`Priority: ${PRIORITY_LABEL[ticket.priority]}`}>
            <Chip
              size="small"
              variant="outlined"
              label={PRIORITY_LABEL[ticket.priority]}
              sx={{
                height: 20,
                fontSize: 10.5,
                borderColor: PRIORITY_COLOR[ticket.priority],
                color: PRIORITY_COLOR[ticket.priority],
                '& .MuiChip-label': { px: 0.75 },
              }}
            />
          </Tooltip>
          <Tooltip title={`Assignee: ${ticket.assignee}`}>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
              <Avatar sx={{ width: 18, height: 18, fontSize: 9, fontWeight: 700, bgcolor: 'primary.main' }}>
                {initials(ticket.assignee)}
              </Avatar>
              <Typography noWrap variant="caption" color="text.secondary">
                {ticket.assignee}
              </Typography>
            </Stack>
          </Tooltip>
        </Stack>
        <Tooltip title={`Created ${new Date(ticket.createdAt).toLocaleString()}`}>
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {formatRelative(ticket.createdAt)}
          </Typography>
        </Tooltip>
      </Stack>
    </Paper>
  )
}
