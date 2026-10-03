import { useState, type FormEvent } from 'react'
import { Avatar, Box, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded'
import type { Ticket } from '../../data/tickets'
import { formatDateTime, initials } from '../../utils/format'
import { useTickets } from '../../state/TicketsContext'

export default function TicketComments({ ticket, me }: { ticket: Ticket; me: string }) {
  const { addComment } = useTickets()
  const [text, setText] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    addComment(ticket.id, text.trim(), me)
    setText('')
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {ticket.comments.length === 0 ? (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 26, color: 'text.disabled' }} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              No comments yet. Add the first note for the site team.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1.25}>
            {ticket.comments.map((c, i) => (
              <Stack key={`${c.at}-${i}`} direction="row" spacing={1}>
                <Avatar
                  sx={{ width: 26, height: 26, fontSize: 10, fontWeight: 700, bgcolor: c.by === me ? 'primary.main' : 'secondary.main' }}
                >
                  {initials(c.by)}
                </Avatar>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline' }}>
                    <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{c.by === me ? 'You' : c.by}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDateTime(c.at)}
                    </Typography>
                  </Stack>
                  <Typography
                    sx={(t) => ({
                      fontSize: 13,
                      mt: 0.25,
                      px: 1,
                      py: 0.75,
                      borderRadius: '10px',
                      bgcolor: t.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    })}
                  >
                    {c.text}
                  </Typography>
                </Box>
              </Stack>
            ))}
          </Stack>
        )}
      </Box>

      <Box component="form" onSubmit={submit} sx={{ pt: 1.25 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Add a comment"
          value={text}
          onChange={(e) => setText(e.target.value)}
          slotProps={{
            input: {
              'aria-label': 'Add a comment',
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" type="submit" disabled={!text.trim()} aria-label="Post comment" color="primary">
                    <SendRoundedIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>
    </Box>
  )
}
