import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Avatar, Badge, Box, ButtonBase, Chip, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded'
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded'
import ReplyRoundedIcon from '@mui/icons-material/ReplyRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import type { CommentAttachment, Ticket, TicketComment } from '../../data/tickets'
import { formatDateTime, initials } from '../../utils/format'
import { useTickets } from '../../state/TicketsContext'
import { loadStoredAttachment, resolveAttachmentUrl, uploadAttachments, useAttachments, type Attachment } from './attachments'
import AttachmentPopover from './AttachmentPopover'
import DocumentPreview from './DocumentPreview'
import MentionField from './MentionField'
import ClampedComment from './ClampedComment'
import { enterToSubmit } from './enterToSubmit'
import { useMockVoiceInput, VoiceMicButton, VoiceStatus } from './VoiceInput'

/** Entries written before comment threading have no id, so their position stands in as a stable key. */
function commentKey(comment: TicketComment, index: number): string {
  return comment.id ?? `${comment.at}#${index}`
}

function isSystemEntry(comment: TicketComment): boolean {
  return comment.by.trim().toLowerCase() === 'system' && comment.text !== ''
}

const captionSize = 'var(--font-size-caption)'

/** The quoted original shown above the input and at the top of a reply bubble. */
function QuoteStrip({
  author,
  text,
  onClick,
  onCancel,
}: {
  author: string
  text: string
  onClick?: () => void
  onCancel?: () => void
}) {
  const body = (
    <Box sx={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
      <Typography sx={{ display: 'block', fontSize: captionSize, fontWeight: 700, color: 'var(--primary)', lineHeight: 1.3 }}>{author}</Typography>
      <Typography
        sx={{
          fontSize: captionSize,
          color: 'var(--text-secondary)',
          lineHeight: 1.35,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {text || 'Attachment'}
      </Typography>
    </Box>
  )
  const strip = {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    width: '100%',
    minWidth: 0,
    px: 1,
    py: 0.5,
    mb: 0.5,
    bgcolor: 'var(--nested-bg)',
    borderLeft: '3px solid var(--primary)',
    borderRadius: 'calc(var(--radius-lg) / 2)',
  } as const

  return onClick ? (
    <ButtonBase
      onClick={onClick}
      aria-label={`Go to the original message from ${author}`}
      sx={{ ...strip, '&.Mui-focusVisible': { outline: '2px solid var(--primary)', outlineOffset: 1 } }}
    >
      {body}
    </ButtonBase>
  ) : (
    <Box sx={strip}>
      {body}
      {onCancel && (
        <IconButton size="small" aria-label="Cancel reply" onClick={onCancel} sx={{ color: 'var(--text-muted)', p: 0.25 }}>
          <CloseRoundedIcon sx={{ fontSize: 16 }} />
        </IconButton>
      )}
    </Box>
  )
}

/** WhatsApp-style comment thread: the current user on the right, everyone else on the left. */
export default function TicketCommentThread({ ticket, me }: { ticket: Ticket; me: string }) {
  const { addComment } = useTickets()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [attachAnchor, setAttachAnchor] = useState<HTMLElement | null>(null)
  const [previewing, setPreviewing] = useState<Attachment | null>(null)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const attachments = useAttachments()
  const listRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const voice = useMockVoiceInput(text, setText, { disabled: sending })

  const byKey = useMemo(() => {
    const map = new Map<string, TicketComment>()
    ticket.comments.forEach((comment, index) => map.set(commentKey(comment, index), comment))
    return map
  }, [ticket.comments])

  useLayoutEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [ticket.id, ticket.comments.length])

  useEffect(() => () => clearTimeout(highlightTimer.current), [])

  const canSend = (text.trim() !== '' || attachments.items.length > 0) && !sending
  const replyTarget = replyingTo ? byKey.get(replyingTo) : undefined

  const startReply = (key: string) => {
    setReplyingTo(key)
    formRef.current?.querySelector<HTMLTextAreaElement>('textarea[aria-label="Write a comment"]')?.focus()
  }

  const jumpTo = (key: string) => {
    const bubble = listRef.current?.querySelector<HTMLElement>(`[data-comment-key="${CSS.escape(key)}"]`)
    if (!bubble) return
    bubble.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlighted(key)
    clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlighted(null), 1600)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSend) return
    setSending(true)
    setSendError('')
    try {
      const uploaded = attachments.items.length ? await uploadAttachments(ticket.id, attachments.items) : undefined
      await addComment(ticket.id, text.trim(), me, uploaded, {
        id: crypto.randomUUID(),
        ...(replyingTo ? { replyTo: replyingTo } : {}),
      })
      voice.cancel()
      setText('')
      setReplyingTo(null)
      attachments.items.forEach((item) => attachments.remove(item.id))
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'The comment could not be saved.')
    } finally {
      setSending(false)
    }
  }

  const openStored = async (file: CommentAttachment) => {
    try {
      setPreviewing(await loadStoredAttachment(file))
    } catch {
      try {
        window.open(await resolveAttachmentUrl(file.url), '_blank', 'noopener,noreferrer')
      } catch (error) {
        setSendError(error instanceof Error ? error.message : 'Attachment could not be opened.')
      }
    }
  }

  return (
    <Box
      sx={(t) => ({
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        '--bg-card': t.palette.background.paper,
        '--border-light': t.palette.divider,
        '--text-main': t.palette.text.primary,
        '--text-secondary': t.palette.text.secondary,
        '--text-muted': t.palette.text.disabled,
        '--primary': t.palette.primary.main,
        '--nested-bg': t.palette.action.hover,
        '--radius-lg': `${t.shape.borderRadius}px`,
        '--font-size-caption': typeof t.typography.caption.fontSize === 'number' ? `${t.typography.caption.fontSize}px` : t.typography.caption.fontSize,
      })}
    >
      <Box ref={listRef} sx={{ flex: 1, minHeight: 120, overflowY: 'auto', pr: 0.5 }}>
        {ticket.comments.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 26, color: 'var(--text-muted)' }} />
            <Typography sx={{ display: 'block', fontSize: captionSize, color: 'var(--text-secondary)' }}>
              No comments yet. Add the first note for the site team.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1.25} sx={{ py: 0.5 }}>
            {ticket.comments.map((c, i) => {
              const key = commentKey(c, i)

              if (isSystemEntry(c)) {
                return (
                  <Box key={key} sx={{ display: 'flex', justifyContent: 'center' }}>
                    <Box
                      title={formatDateTime(c.at)}
                      sx={{
                        px: 1.5,
                        py: 0.25,
                        borderRadius: 999,
                        bgcolor: 'var(--nested-bg)',
                        color: 'var(--text-muted)',
                        fontSize: captionSize,
                        textAlign: 'center',
                        maxWidth: '90%',
                      }}
                    >
                      {c.text}
                    </Box>
                  </Box>
                )
              }

              const mine = c.by === me
              const original = c.replyTo ? byKey.get(c.replyTo) : undefined
              const replyButton = (
                <Tooltip title="Reply">
                  <IconButton
                    className="reply-button"
                    size="small"
                    aria-label={`Reply to ${mine ? 'your message' : c.by}`}
                    onClick={() => startReply(key)}
                    sx={{
                      color: 'var(--text-muted)',
                      opacity: 0,
                      transition: 'opacity 120ms',
                      '&:hover': { color: 'var(--primary)', bgcolor: 'var(--nested-bg)' },
                      '&:focus-visible': { opacity: 1, outline: '2px solid var(--primary)' },
                      '@media (hover: none)': { opacity: 0.7 },
                    }}
                  >
                    <ReplyRoundedIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              )

              return (
                <Stack
                  key={key}
                  direction="row"
                  spacing={1}
                  sx={{ justifyContent: mine ? 'flex-end' : 'flex-start', alignItems: 'flex-start' }}
                >
                  {!mine && (
                    <Avatar
                      sx={{
                        width: 28,
                        height: 28,
                        fontSize: 11,
                        fontWeight: 700,
                        bgcolor: 'var(--nested-bg)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-light)',
                      }}
                    >
                      {initials(c.by)}
                    </Avatar>
                  )}
                  <Box sx={{ minWidth: 0, maxWidth: '82%', display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                    {!mine && (
                      <Typography sx={{ fontSize: captionSize, color: 'var(--text-secondary)', mb: 0.25, ml: 0.5 }}>{c.by}</Typography>
                    )}
                    <Stack
                      direction="row"
                      sx={{ alignItems: 'center', maxWidth: '100%', '&:hover .reply-button': { opacity: 1 } }}
                    >
                      {mine && replyButton}
                      <Box data-comment-key={key} sx={{ minWidth: 0 }}>
                        <ClampedComment
                          text={c.text}
                          by={c.by}
                          at={c.at}
                          mine={mine}
                          header={
                            c.replyTo ? (
                              <QuoteStrip
                                author={original ? (original.by === me ? 'You' : original.by) : 'Original message'}
                                text={original ? original.text : 'No longer available'}
                                onClick={original ? () => jumpTo(c.replyTo as string) : undefined}
                              />
                            ) : undefined
                          }
                          extra={
                            c.attachments && c.attachments.length > 0 ? (
                              <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 0.75, mt: c.text ? 0.5 : 0 }}>
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
                            ) : undefined
                          }
                          footer={
                            <Typography component="time" sx={{ fontSize: captionSize, color: 'var(--text-muted)', lineHeight: 1.2, ml: 'auto', whiteSpace: 'nowrap' }}>
                              {formatDateTime(c.at)}
                            </Typography>
                          }
                          sx={{
                            fontSize: 13.5,
                            px: 1.25,
                            py: 0.85,
                            color: 'var(--text-main)',
                            bgcolor: mine ? 'color-mix(in srgb, var(--primary) 10%, var(--bg-card))' : 'var(--nested-bg)',
                            borderRadius: 'var(--radius-lg)',
                            ...(mine ? { borderBottomRightRadius: 0 } : { borderBottomLeftRadius: 0 }),
                            transition: 'box-shadow 200ms',
                            boxShadow: highlighted === key ? '0 0 0 2px var(--primary)' : '0 0 0 0 transparent',
                          }}
                        />
                      </Box>
                      {!mine && replyButton}
                    </Stack>
                  </Box>
                </Stack>
              )
            })}
          </Stack>
        )}
      </Box>

      <VoiceStatus phase={voice.phase} sx={{ mt: 1 }} />
      {replyingTo && (
        <Box sx={{ mt: 1 }}>
          <QuoteStrip
            author={replyTarget ? (replyTarget.by === me ? 'You' : replyTarget.by) : 'Original message'}
            text={replyTarget?.text ?? ''}
            onCancel={() => setReplyingTo(null)}
          />
        </Box>
      )}
      <Stack
        ref={formRef}
        component="form"
        onSubmit={submit}
        direction="row"
        spacing={1}
        sx={{ alignItems: 'flex-end', pt: 1.25, mt: 1.25, borderTop: '1px solid var(--border-light)' }}
      >
        <Avatar sx={{ width: 32, height: 32, fontSize: 11, fontWeight: 700, bgcolor: 'var(--primary)', mb: 0.5 }}>{initials(me)}</Avatar>
        <MentionField value={text} onValueChange={setText} disabled={sending} sx={{ flex: 1, minWidth: 0 }}>
          {({ inputAria, ...field }) => (
            <TextField
              {...field}
              onKeyDown={enterToSubmit(field.onKeyDown)}
              size="small"
              fullWidth
              multiline
              minRows={2}
              maxRows={5}
              placeholder="Write a comment... use @ to mention"
              slotProps={{
                htmlInput: { 'aria-label': 'Write a comment', maxLength: 2000, readOnly: voice.phase === 'typing', ...inputAria },
              }}
            />
          )}
        </MentionField>
        <VoiceMicButton voice={voice} disabled={sending} />
        <Tooltip title="Attach files">
          <IconButton
            onClick={(e) => setAttachAnchor(e.currentTarget)}
            aria-label={attachments.items.length > 0 ? `Attachments (${attachments.items.length})` : 'Attach files'}
            sx={{ color: 'var(--text-secondary)' }}
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
