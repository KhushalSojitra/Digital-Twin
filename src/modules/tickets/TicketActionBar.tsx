import { useState, type FormEvent } from 'react'
import { Avatar, Badge, Box, IconButton, InputBase, Tooltip, Typography } from '@mui/material'
import { Paperclip } from 'lucide-react'
import { actionLook, DESTRUCTIVE_COLOR, ICON_SIZE, ICON_STROKE, primaryActionId, TOOLTIP_DELAY } from './TicketIndicators'
import type { CommentAttachment, Ticket } from '../../data/tickets'
import type { WorkflowTransition } from '../../data/workflows'
import { initials } from '../../utils/format'
import { useTickets } from '../../state/TicketsContext'
import { uploadAttachments, useAttachments } from './attachments'
import AttachmentPopover from './AttachmentPopover'
import DocumentPreview from './DocumentPreview'
import MentionField from './MentionField'
import { enterToSubmit } from './enterToSubmit'
import { useMockVoiceInput, VoiceMicButton, VoiceStatus } from './VoiceInput'
import { findMentions } from './mentions'
import type { Attachment } from './attachments'
import type { RunOptions } from './WorkflowActions'

/** The server stores a workflow note in at most this many characters. */
const MAX_NOTE_LENGTH = 2000

interface Props {
  ticket: Ticket
  me: string
  actions: WorkflowTransition[]
  onRun: (ticket: Ticket, action: WorkflowTransition, options?: RunOptions) => void
  hidden?: boolean
}

export default function TicketActionBar({ ticket, me, actions, onRun, hidden }: Props) {
  const { addComment } = useTickets()
  const attachments = useAttachments()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attachAnchor, setAttachAnchor] = useState<HTMLElement | null>(null)
  const [previewing, setPreviewing] = useState<Attachment | null>(null)
  const voice = useMockVoiceInput(text, setText, { disabled: busy, maxLength: MAX_NOTE_LENGTH })

  const primaryId = primaryActionId(actions)
  const comment = text.trim()
  const hasContent = comment !== '' || attachments.items.length > 0
  // Only the first mention can take the ticket; mentioning the current assignee first leaves the assignee as is.
  const firstMention = findMentions(text)[0]
  const mentionedAssignee = firstMention && firstMention !== ticket.assignee ? firstMention : undefined

  const reset = () => {
    voice.cancel()
    setText('')
    attachments.items.forEach((item) => attachments.remove(item.id))
  }

  const upload = (): Promise<CommentAttachment[] | undefined> =>
    attachments.items.length ? uploadAttachments(ticket.id, attachments.items) : Promise.resolve(undefined)

  const failure = (cause: unknown) => setError(cause instanceof Error ? cause.message : 'The comment could not be saved.')

  const postComment = async (e: FormEvent) => {
    e.preventDefault()
    if (!hasContent || busy) return
    setBusy(true)
    setError('')
    try {
      await addComment(ticket.id, comment, me, await upload())
      reset()
    } catch (cause) {
      failure(cause)
    } finally {
      setBusy(false)
    }
  }

  const runAction = async (action: WorkflowTransition) => {
    if (busy) return
    setBusy(true)
    setError('')
    let uploaded: CommentAttachment[] | undefined
    try {
      uploaded = await upload()
    } catch (cause) {
      failure(cause)
      setBusy(false)
      return
    }
    onRun(ticket, action, {
      note: comment ? comment.slice(0, MAX_NOTE_LENGTH) : undefined,
      assignee: mentionedAssignee,
      onDone: () => {
        if (comment || uploaded?.length) {
          addComment(ticket.id, comment, me, uploaded).catch((cause) => failure(cause))
        }
        reset()
      },
      onSettled: () => setBusy(false),
    })
  }

  return (
    <Box
      sx={(t) => ({
        display: hidden ? 'none' : 'block',
        flexShrink: 0,
        px: { xs: 2, sm: 3.5 },
        py: 1.5,
        borderTop: `1px solid ${t.palette.divider}`,
        bgcolor: 'background.paper',
      })}
    >
      <Box
        component="form"
        onSubmit={(e: FormEvent) => void postComment(e)}
        sx={(t) => ({
          display: 'flex',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: 1,
          px: 1.25,
          py: 0.75,
          borderRadius: '12px',
          border: `1px solid ${t.palette.divider}`,
          '&:focus-within': { borderColor: t.palette.primary.main },
        })}
      >
        <VoiceStatus phase={voice.phase} sx={{ flexBasis: '100%' }} />
        <Avatar sx={{ width: 32, height: 32, fontSize: 11, fontWeight: 700, bgcolor: 'primary.main', mb: 0.25 }}>{initials(me)}</Avatar>
        <MentionField value={text} onValueChange={setText} disabled={busy} sx={{ flex: '1 1 160px', minWidth: 0, display: 'flex' }}>
          {({ inputAria, ...field }) => (
            <InputBase
              {...field}
              onKeyDown={enterToSubmit(field.onKeyDown)}
              fullWidth
              multiline
              minRows={2}
              maxRows={5}
              readOnly={voice.phase === 'typing'}
              placeholder="Write a comment… use @ to mention"
              disabled={busy}
              slotProps={{ input: { 'aria-label': 'Write a comment', maxLength: MAX_NOTE_LENGTH, ...inputAria } }}
              sx={{ fontSize: 15, py: 0.25 }}
            />
          )}
        </MentionField>
        <VoiceMicButton voice={voice} disabled={busy} />
        <Tooltip title="Attach files">
          <IconButton
            onClick={(e) => setAttachAnchor(e.currentTarget)}
            aria-label={attachments.items.length > 0 ? `Attachments (${attachments.items.length})` : 'Attach files'}
            sx={{ color: 'text.secondary' }}
          >
            <Badge badgeContent={attachments.items.length} color="error" overlap="circular">
              <Paperclip size={20} aria-hidden />
            </Badge>
          </IconButton>
        </Tooltip>

        {actions.length > 0 && (
          <>
            <Box aria-hidden sx={{ width: '1px', height: 28, flexShrink: 0, bgcolor: 'divider' }} />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'flex-end' }}>
              {actions.map((action) => {
                const { Icon, kind } = actionLook(action.label)
                const primary = action.id === primaryId
                const hoverColor = (brand: string) => (kind === 'destructive' ? DESTRUCTIVE_COLOR : brand)
                return (
                  <Tooltip key={action.id} title={action.label} enterDelay={TOOLTIP_DELAY}>
                    <Box component="span" sx={{ display: 'inline-flex' }}>
                      <IconButton
                        aria-label={action.label}
                        disabled={busy}
                        onClick={() => void runAction(action)}
                        sx={(t) => ({
                          width: 34,
                          height: 34,
                          borderRadius: '8px',
                          border: '1px solid',
                          ...(primary
                            ? {
                                color: t.palette.primary.contrastText,
                                bgcolor: t.palette.primary.main,
                                borderColor: t.palette.primary.main,
                                '&:hover': { bgcolor: t.palette.primary.dark, borderColor: t.palette.primary.dark },
                              }
                            : {
                                color: t.palette.text.secondary,
                                bgcolor: 'transparent',
                                borderColor: t.palette.divider,
                                '&:hover': {
                                  bgcolor: t.palette.action.hover,
                                  color: hoverColor(t.palette.primary.main),
                                  borderColor: hoverColor(t.palette.primary.main),
                                },
                              }),
                          '&.Mui-focusVisible': { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 2 },
                          '&.Mui-disabled': { opacity: 0.45, color: primary ? t.palette.primary.contrastText : t.palette.text.secondary },
                        })}
                      >
                        <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
                      </IconButton>
                    </Box>
                  </Tooltip>
                )
              })}
            </Box>
          </>
        )}
      </Box>
      {mentionedAssignee && actions.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          Clicking an action will also assign this ticket to <strong>{mentionedAssignee}</strong>. Posting the comment alone will not.
        </Typography>
      )}
      {error && (
        <Typography role="alert" color="error" variant="caption" sx={{ display: 'block', mt: 0.75 }}>
          {error}
        </Typography>
      )}

      <AttachmentPopover anchorEl={attachAnchor} onClose={() => setAttachAnchor(null)} attachments={attachments} onPreview={setPreviewing} />
      <DocumentPreview attachment={previewing} onClose={() => setPreviewing(null)} />
    </Box>
  )
}
