import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Avatar, Badge, Box, Chip, IconButton, Stack, TextField, Tooltip, Typography, alpha } from '@mui/material'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded'
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded'
import type { CommentAttachment, Ticket } from '../../data/tickets'
import { formatDateTime, initials } from '../../utils/format'
import { useTickets } from '../../state/TicketsContext'
import { loadStoredAttachment, uploadAttachments, useAttachments, type Attachment } from './attachments'
import AttachmentPopover from './AttachmentPopover'
import DocumentPreview from './DocumentPreview'

/** Compact chat-style comment thread: others on the left, the current user on the right. */
export default function TicketCommentThread({ ticket, me }: { ticket: Ticket; me: string }) {
  const { addComment } = useTickets()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [attachAnchor, setAttachAnchor] = useState<HTMLElement | null>(null)
  const [previewing, setPreviewing] = useState<Attachment | null>(null)
  const attachments = useAttachments()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [ticket.comments.length])

  const canSend = (text.trim() !== '' || attachments.items.length > 0) && !sending

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSend) return
    setSending(true)
    setSendError('')
    try {
      const uploaded = attachments.items.length ? await uploadAttachments(ticket.id, attachments.items) : undefined
      addComment(ticket.id, text.trim(), me, uploaded)
      setText('')
      attachments.items.forEach((item) => attachments.remove(item.id))
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Attachment could not be uploaded.')
    } finally {
      setSending(false)
    }
  }

  const openStored = async (file: CommentAttachment) => {
    try {
      setPreviewing(await loadStoredAttachment(file))
    } catch {
      window.open(file.url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Box sx={{ flex: 1, minHeight: 120, overflowY: 'auto', pr: 0.5 }}>
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
                    {c.text && (
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
                    )}
                    {c.attachments && c.attachments.length > 0 && (
                      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.75, mt: 0.5, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                        {c.attachments.map((file) => (
                          <Chip
                            key={file.url}
                            size="small"
                            clickable
                            icon={<AttachFileRoundedIcon sx={{ transform: 'rotate(45deg)' }} />}
                            label={file.name}
                            onClick={() => void openStored(file)}
                            sx={{ maxWidth: 220 }}
                          />
                        ))}
                      </Stack>
                    )}
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
        <Tooltip title="Attach files">
          <IconButton
            onClick={(e) => setAttachAnchor(e.currentTarget)}
            aria-label={attachments.items.length > 0 ? `Attachments (${attachments.items.length})` : 'Attach files'}
            sx={{ color: 'text.secondary' }}
          >
            <Badge badgeContent={attachments.items.length} color="error" overlap="circular">
              <AttachFileRoundedIcon sx={{ transform: 'rotate(45deg)' }} />
            </Badge>
          </IconButton>
        </Tooltip>
        <IconButton type="submit" disabled={!canSend} aria-label="Post comment" color="primary" sx={{ borderRadius: '10px' }}>
          <SendRoundedIcon fontSize="small" />
        </IconButton>
      </Stack>
      {sendError && (
        <Typography role="alert" color="error" variant="caption" sx={{ mt: 0.5 }}>
          {sendError}
        </Typography>
      )}

      <AttachmentPopover anchorEl={attachAnchor} onClose={() => setAttachAnchor(null)} attachments={attachments} onPreview={setPreviewing} />
      <DocumentPreview attachment={previewing} onClose={() => setPreviewing(null)} />
    </Box>
  )
}
