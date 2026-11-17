import { useState, type FormEvent } from 'react'
import { Avatar, Badge, Box, Button, IconButton, InputBase, Tooltip, Typography } from '@mui/material'
import { ArrowRight, Check, Paperclip, Pause } from 'lucide-react'
import type { CommentAttachment, Ticket } from '../../data/tickets'
import type { WorkflowTransition } from '../../data/workflows'
import { initials } from '../../utils/format'
import { useTickets } from '../../state/TicketsContext'
import { uploadAttachments, useAttachments } from './attachments'
import AttachmentPopover from './AttachmentPopover'
import DocumentPreview from './DocumentPreview'
import MentionField from './MentionField'
import { findMentions } from './mentions'
import type { Attachment } from './attachments'
import type { RunOptions } from './WorkflowActions'

/** The server stores a workflow note in at most this many characters. */
const MAX_NOTE_LENGTH = 2000

type ActionKind = 'complete' | 'hold' | 'pass'

function kindOf(action: WorkflowTransition): ActionKind {
  if (/hold|pause/i.test(action.label)) return 'hold'
  if (/complete|done|finish|resolve|accept|approve/i.test(action.label)) return 'complete'
  return 'pass'
}

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

  const comment = text.trim()
  const hasContent = comment !== '' || attachments.items.length > 0
  const mentionedAssignee = findMentions(text).find((person) => person !== ticket.assignee)

  const reset = () => {
    setText('')
    attachments.items.forEach((item) => attachments.remove(item.id))
  }

  const upload = (): Promise<CommentAttachment[] | undefined> =>
    attachments.items.length ? uploadAttachments(ticket.id, attachments.items) : Promise.resolve(undefined)

  const failure = (cause: unknown) => setError(cause instanceof Error ? cause.message : 'Attachment could not be uploaded.')

  const postComment = async (e: FormEvent) => {
    e.preventDefault()
    if (!hasContent || busy) return
    setBusy(true)
    setError('')
    try {
      addComment(ticket.id, comment, me, await upload())
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
        if (comment || uploaded?.length) addComment(ticket.id, comment, me, uploaded)
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
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1,
          px: 1.25,
          py: 0.75,
          borderRadius: '12px',
          border: `1px solid ${t.palette.divider}`,
          '&:focus-within': { borderColor: t.palette.primary.main },
        })}
      >
        <Avatar sx={{ width: 32, height: 32, fontSize: 11, fontWeight: 700, bgcolor: 'primary.main' }}>{initials(me)}</Avatar>
        <MentionField value={text} onValueChange={setText} disabled={busy} sx={{ flex: '1 1 160px', minWidth: 0, display: 'flex' }}>
          {({ inputAria, ...field }) => (
            <InputBase
              {...field}
              fullWidth
              placeholder="Write a comment… use @ to mention"
              disabled={busy}
              slotProps={{ input: { 'aria-label': 'Write a comment', ...inputAria } }}
              sx={{ fontSize: 15 }}
            />
          )}
        </MentionField>
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
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {actions.map((action) => {
                const kind = kindOf(action)
                return (
                  <Button
                    key={action.id}
                    variant={kind === 'complete' ? 'contained' : 'outlined'}
                    color={kind === 'hold' ? 'warning' : 'primary'}
                    disabled={busy}
                    onClick={() => void runAction(action)}
                    startIcon={kind === 'complete' ? <Check size={18} aria-hidden /> : kind === 'hold' ? <Pause size={18} aria-hidden /> : <ArrowRight size={18} aria-hidden />}
                    sx={{ height: 40, borderRadius: '10px', px: 2, textTransform: 'none', fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap' }}
                  >
                    {action.label}
                  </Button>
                )
              })}
            </Box>
          </>
        )}
      </Box>
      {mentionedAssignee && actions.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          The next action will assign this ticket to <strong>{mentionedAssignee}</strong>.
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
