import { useState } from 'react'
import {
  Avatar,
  Box,
  Button,
  Divider,
  IconButton,
  MenuItem,
  Popover,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import IosShareRoundedIcon from '@mui/icons-material/IosShareRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import { ASSIGNEES, type Ticket } from '../../data/tickets'
import { initials } from '../../utils/format'
import { useTickets } from '../../state/TicketsContext'

/** Deep link that reopens the ticket on the Earth view. */
function ticketLink(ticket: Ticket) {
  return `${window.location.origin}/earth?ticket=${ticket.id}`
}

export default function TicketShare({ ticket, me }: { ticket: Ticket; me: string }) {
  const { shareWith, addFollowers } = useTickets()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const [person, setPerson] = useState('')
  const [copied, setCopied] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const people = ASSIGNEES.filter((p) => p !== me)
  const link = ticketLink(ticket)

  const close = () => {
    setAnchor(null)
    setNote(null)
    setCopied(false)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      // The async clipboard needs focus and a secure context; fall back to a scratch selection.
      const field = document.createElement('textarea')
      field.value = link
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.append(field)
      field.select()
      document.execCommand('copy')
      field.remove()
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <Tooltip title="Share ticket">
        <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)} aria-label="Share ticket">
          <IosShareRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { p: 1.5, width: 300, borderRadius: '14px' } } }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          Share {ticket.id}
        </Typography>

        <Select
          size="small"
          fullWidth
          displayEmpty
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          aria-label="Person to share with"
          sx={{ mt: 0.75, fontSize: 13 }}
          renderValue={(v) => (v ? v : <Box sx={{ color: 'text.secondary' }}>Select a person</Box>)}
        >
          {people.map((p) => (
            <MenuItem key={p} value={p} sx={{ fontSize: 13 }}>
              <Avatar sx={{ width: 20, height: 20, fontSize: 9, mr: 1 }}>{initials(p)}</Avatar>
              {p}
            </MenuItem>
          ))}
        </Select>

        <Stack direction="row" spacing={0.75} sx={{ mt: 1 }}>
          <Button
            size="small"
            variant="contained"
            disabled={!person}
            startIcon={<IosShareRoundedIcon />}
            onClick={() => {
              shareWith(ticket.id, person, me)
              setNote(`Shared with ${person}`)
            }}
            sx={{ flex: 1 }}
          >
            Share
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={!person}
            startIcon={<VisibilityRoundedIcon />}
            onClick={() => {
              addFollowers(ticket.id, [person], me)
              setNote(`${person} is watching`)
            }}
            sx={{ flex: 1 }}
          >
            Add watcher
          </Button>
        </Stack>

        {note && (
          <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 0.75, fontWeight: 600 }}>
            {note} · {ticket.followers.length} watching
          </Typography>
        )}

        <Divider sx={{ my: 1.25 }} />
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
          Ticket link
        </Typography>
        <Stack direction="row" spacing={0.75} sx={{ mt: 0.5, alignItems: 'center' }}>
          <TextField
            size="small"
            value={link}
            slotProps={{ htmlInput: { readOnly: true, 'aria-label': 'Ticket link', sx: { fontSize: 11.5 } } }}
            onFocus={(e) => e.target.select()}
            sx={{ flex: 1 }}
          />
          <Tooltip title={copied ? 'Copied' : 'Copy ticket link'}>
            <IconButton size="small" onClick={copy} aria-label="Copy ticket link" color={copied ? 'success' : 'default'}>
              {copied ? <CheckRoundedIcon fontSize="small" /> : <ContentCopyRoundedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Stack>
      </Popover>
    </>
  )
}
