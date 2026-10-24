import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Avatar, Box, IconButton, Stack, TextField, Typography, alpha } from '@mui/material'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded'
import type { Ticket } from '../../data/tickets'
import { formatDateTime, initials } from '../../utils/format'
import { useTickets } from '../../state/TicketsContext'

/** Compact chat-style comment thread: others on the left, the current user on the right. */
export default function TicketCommentThread({ ticket, me }: { ticket: Ticket; me: string }) {
  const { addComment } = useTickets()
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [ticket.comments.length])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    addComment(ticket.id, text.trim(), me)
    setText('')
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <Box sx={{ maxHeight: { xs: 'none', sm: 340 }, minHeight: 120, overflowY: 'auto', pr: 0.5 }}>
        {ticket.comments.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 26, color: 'text.disabled' }} />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              No comments yet. Add the first note for the site team.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {ticket.comments.map((c, i) => {
              const mine = c.by === me
              return (
                <Stack
                  key={`${c.at}-${i}`}
                  direction={mine ? 'row-reverse' : 'row'}
                  spacing={1}
                  sx={{ alignItems: 'flex-start', '& > :first-of-type': mine ? { ml: 1 } : undefined }}
                >
                  <Avatar
                    sx={{ width: 30, height: 30, fontSize: 11, fontWeight: 700, bgcolor: mine ? 'primary.main' : 'secondary.main' }}
                  >
                    {initials(c.by)}
                  </Avatar>
                  <Box sx={{ minWidth: 0, maxWidth: '82%', display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline' }}>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{mine ? 'You' : c.by}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatDateTime(c.at)}
                      </Typography>
                    </Stack>
                    <Typography
                      sx={(t) => ({
                        fontSize: 13.5,
                        mt: 0.25,
                        px: 1.25,
                        py: 0.85,
                        borderRadius: '12px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        bgcolor: mine
                          ? alpha(t.palette.primary.main, t.palette.mode === 'dark' ? 0.2 : 0.12)
                          : t.palette.mode === 'dark'
                            ? 'rgba(255,255,255,0.06)'
                            : 'rgba(0,0,0,0.045)',
                      })}
                    >
                      {c.text}
                    </Typography>
                  </Box>
                </Stack>
              )
            })}
            <div ref={endRef} />
          </Stack>
        )}
      </Box>

      <Stack
        component="form"
        onSubmit={submit}
        direction="row"
        spacing={1}
        sx={(t) => ({ alignItems: 'center', pt: 1.25, mt: 1.25, borderTop: `1px solid ${t.palette.divider}` })}
      >
        <Avatar sx={{ width: 32, height: 32, fontSize: 11, fontWeight: 700, bgcolor: 'primary.main' }}>{initials(me)}</Avatar>
        <TextField
          size="small"
          fullWidth
          placeholder="Write a comment..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          slotProps={{ htmlInput: { 'aria-label': 'Write a comment' } }}
        />
        <IconButton type="submit" disabled={!text.trim()} aria-label="Post comment" color="primary" sx={{ borderRadius: '10px' }}>
          <SendRoundedIcon fontSize="small" />
        </IconButton>
      </Stack>
    </Box>
  )
}
