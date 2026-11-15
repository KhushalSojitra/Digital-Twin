import { useState } from 'react'
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ListItemText,
  MenuItem,
  MenuList,
  Popover,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material'
import PersonAddAlt1RoundedIcon from '@mui/icons-material/PersonAddAlt1Rounded'
import { ASSIGNEES, UNASSIGNED, type Ticket } from '../../data/tickets'
import { initials } from '../../utils/format'
import { useTickets } from '../../state/TicketsContext'

interface Props {
  ticket: Ticket
  me: string
}

export default function TicketAssignment({ ticket, me }: Props) {
  const { addFollowers, removeFollower } = useTickets()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [pending, setPending] = useState<{ action: 'add' | 'remove'; name: string } | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const followers = ticket.followers ?? []
  const candidates = ASSIGNEES.filter((p) => !followers.includes(p))

  const applyPending = () => {
    if (!pending) return
    if (pending.action === 'add') {
      addFollowers(ticket.id, [pending.name], me)
      setNote(`${pending.name} added as a watcher.`)
    } else {
      removeFollower(ticket.id, pending.name, me)
      setNote(`${pending.name} removed as a watcher.`)
    }
    setPending(null)
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Avatar sx={{ width: 30, height: 30, fontSize: 11, fontWeight: 700, bgcolor: 'primary.main' }}>{initials(ticket.assignee)}</Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Assignee
          </Typography>
          <Typography sx={{ fontSize: 13.5 }} noWrap>
            {ticket.assignee || UNASSIGNED}
            {ticket.assignee === me ? ' (you)' : ''}
          </Typography>
        </Box>
      </Stack>

      <Stack direction="row" spacing={0.5} sx={{ mt: 1, alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mr: 0.25 }}>
          Watchers
        </Typography>
        {followers.length === 0 && (
          <Typography variant="caption" color="text.disabled">
            None yet
          </Typography>
        )}
        {followers.map((f) => (
          <Chip
            key={f}
            size="small"
            label={f === me ? 'You' : f}
            onDelete={() => setPending({ action: 'remove', name: f })}
            avatar={<Avatar sx={{ fontSize: '9px !important' }}>{initials(f)}</Avatar>}
            sx={{ height: 22, fontSize: 11 }}
          />
        ))}
        <Button
          size="small"
          startIcon={<PersonAddAlt1RoundedIcon sx={{ fontSize: '15px !important' }} />}
          onClick={(e) => setAnchor(e.currentTarget)}
          disabled={candidates.length === 0}
          sx={{ minWidth: 0, px: 0.75, fontSize: 11.5 }}
        >
          Add Watcher
        </Button>
      </Stack>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        sx={{ zIndex: (t) => t.zIndex.modal + 10 }}
        slotProps={{ paper: { sx: { borderRadius: '12px', mt: 0.5, zIndex: (t) => t.zIndex.modal + 10 } } }}
      >
        <MenuList dense sx={{ py: 0.5, minWidth: 190 }}>
          {candidates.map((p) => (
            <MenuItem
              key={p}
              dense
              onClick={() => {
                setAnchor(null)
                setPending({ action: 'add', name: p })
              }}
            >
              <Checkbox size="small" checked={false} sx={{ p: 0.5, mr: 0.5 }} />
              <ListItemText slotProps={{ primary: { sx: { fontSize: 13 } } }}>{p === me ? `${p} (you)` : p}</ListItemText>
            </MenuItem>
          ))}
        </MenuList>
      </Popover>

      <Dialog open={Boolean(pending)} onClose={() => setPending(null)} maxWidth="xs" fullWidth sx={{ zIndex: (t) => t.zIndex.modal + 12 }}>
        <DialogTitle>{pending?.action === 'add' ? 'Add watcher' : 'Remove watcher'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {pending?.action === 'add'
              ? `Add ${pending.name} as a watcher on this ticket?`
              : `Remove ${pending?.name} as a watcher from this ticket?`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)}>Cancel</Button>
          <Button variant="contained" color={pending?.action === 'remove' ? 'error' : 'primary'} onClick={applyPending}>
            {pending?.action === 'add' ? 'Add' : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(note)} autoHideDuration={3000} onClose={() => setNote(null)} message={note ?? ''} />
    </Box>
  )
}
