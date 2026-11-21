import { useState, type ComponentType, type FormEvent } from 'react'
import {
  Avatar,
  Badge,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { Paperclip, SendHorizontal, UserPlus, X, type LucideProps } from 'lucide-react'
import { actionLook, DESTRUCTIVE_COLOR, ICON_SIZE, ICON_STROKE, primaryActionId, TOOLTIP_DELAY } from './TicketIndicators'
import { isUnassigned, type CommentAttachment, type Ticket } from '../../data/tickets'
import type { WorkflowTransition } from '../../data/workflows'
import { initials } from '../../utils/format'
import { useTickets } from '../../state/TicketsContext'
import { uploadAttachments, useAttachments } from './attachments'
import AttachmentPopover from './AttachmentPopover'
import DocumentPreview from './DocumentPreview'
import MentionEditor from './MentionEditor'
import { useMockVoiceInput, VoiceMicButton, VoiceStatus } from './VoiceInput'
import { findMentions } from './mentions'
import { eligibleApprovers } from '../../data/permissions'
import type { Attachment } from './attachments'
import type { RunOptions } from './WorkflowActions'

/** The server stores a workflow note in at most this many characters. */
const MAX_NOTE_LENGTH = 2000

export interface ReplyTarget {
  key: string
  author: string
  text: string
}

interface Props {
  ticket: Ticket
  me: string
  actions: WorkflowTransition[]
  onRun: (ticket: Ticket, action: WorkflowTransition, options?: RunOptions) => void
  /** Comment being replied to (chosen in the Comments tab). */
  replyTo?: ReplyTarget | null
  onCancelReply?: () => void
  /** True when the action is Submit for Approval: a mention picks the approver. */
  isApprovalSubmit?: (action: WorkflowTransition) => boolean
}

/**
 * The one comment bar of a ticket, shown on every tab: Send plus the state buttons the user may run.
 * - Send with @mentions (by the reporter or current assignee of a main ticket) offers to create sub-tasks.
 * - Assign (To Do + unassigned): one mention assigns that person; none asks; two or more disable it.
 * - Two or more mentions disable every state button; only Send stays active.
 * - A comment written with a state button is saved in the same database call as the change.
 */
export default function TicketActionBar({ ticket, me, actions, onRun, replyTo, onCancelReply, isApprovalSubmit }: Props) {
  const { addComment } = useTickets()
  const attachments = useAttachments()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attachAnchor, setAttachAnchor] = useState<HTMLElement | null>(null)
  const [previewing, setPreviewing] = useState<Attachment | null>(null)
  const [subtaskChoice, setSubtaskChoice] = useState<Record<string, boolean> | null>(null)
  const voice = useMockVoiceInput(text, setText, { disabled: busy, maxLength: MAX_NOTE_LENGTH })

  const comment = text.trim()
  const hasContent = comment !== '' || attachments.items.length > 0
  const mentions = findMentions(text).filter((name) => name !== me)
  const manyMentions = mentions.length >= 2
  const isSubtask = Boolean(ticket.parentTicketId)
  const canCreateSubtasks = !isSubtask && (ticket.creator === me || ticket.assignee === me)

  const unassignedTodo = isUnassigned(ticket.assignee) && ticket.workflowState === 'todo'
  const assignAction = actions.find((action) => action.id === 'assign' && unassignedTodo)
  const stateActions = actions.filter((action) => action.id !== 'assign')
  const primaryId = primaryActionId(stateActions)

  const reset = () => {
    voice.cancel()
    setText('')
    attachments.items.forEach((item) => attachments.remove(item.id))
    onCancelReply?.()
  }

  const upload = (): Promise<CommentAttachment[] | undefined> =>
    attachments.items.length ? uploadAttachments(ticket.id, attachments.items) : Promise.resolve(undefined)

  const failure = (cause: unknown) => setError(cause instanceof Error ? cause.message : 'The comment could not be saved.')

  const post = async (subtaskFor: string[]) => {
    setBusy(true)
    setError('')
    try {
      await addComment(ticket.id, comment, me, await upload(), {
        id: crypto.randomUUID(),
        ...(replyTo ? { replyTo: replyTo.key } : {}),
        mentions,
        subtaskFor,
      })
      reset()
    } catch (cause) {
      failure(cause)
    } finally {
      setBusy(false)
    }
  }

  const send = (e?: FormEvent) => {
    e?.preventDefault()
    if (!hasContent || busy) return
    // Mentions by the reporter or assignee of a main ticket: ask who gets a sub-task (all pre-checked).
    if (mentions.length > 0 && canCreateSubtasks) {
      setSubtaskChoice(Object.fromEntries(mentions.map((name) => [name, true])))
      return
    }
    void post([])
  }

  const runAction = async (action: WorkflowTransition, assignee?: string) => {
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
    const withComment = comment !== '' || Boolean(uploaded?.length)
    onRun(ticket, action, {
      note: comment ? comment.slice(0, MAX_NOTE_LENGTH) : undefined,
      // A mention with a state button only notifies; only Assign turns a mention into the assignee.
      assignee,
      comment: withComment ? { text: comment, attachments: uploaded, replyTo: replyTo?.key, mentions } : undefined,
      onDone: reset,
      onSettled: () => setBusy(false),
    })
  }

  const actionButton = (action: WorkflowTransition, opts: { primary: boolean; disabled: boolean; label: string; Icon: ComponentType<LucideProps>; destructive: boolean; onClick: () => void }) => (
    <Tooltip key={action.id} title={opts.label} enterDelay={TOOLTIP_DELAY}>
      <Box component="span" sx={{ display: 'inline-flex' }}>
        <IconButton
          aria-label={opts.label}
          disabled={opts.disabled}
          onClick={opts.onClick}
          sx={(t) => ({
            width: 34,
            height: 34,
            borderRadius: '8px',
            border: '1px solid',
            ...(opts.primary
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
                    color: opts.destructive ? DESTRUCTIVE_COLOR : t.palette.primary.main,
                    borderColor: opts.destructive ? DESTRUCTIVE_COLOR : t.palette.primary.main,
                  },
                }),
            '&.Mui-focusVisible': { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 2 },
            '&.Mui-disabled': { opacity: 0.45, color: opts.primary ? t.palette.primary.contrastText : t.palette.text.secondary },
          })}
        >
          <opts.Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
        </IconButton>
      </Box>
    </Tooltip>
  )

  const assignLabel = manyMentions
    ? 'Assign (mention only one person)'
    : mentions.length === 1
      ? `Assign to ${mentions[0]}`
      : 'Assign'

  return (
    <Box
      sx={(t) => ({
        flexShrink: 0,
        px: { xs: 2, sm: 3.5 },
        py: 1.5,
        borderTop: `1px solid ${t.palette.divider}`,
        bgcolor: 'background.paper',
      })}
    >
      {replyTo && (
        <Box
          sx={(t) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mb: 1,
            px: 1,
            py: 0.5,
            bgcolor: t.palette.action.hover,
            borderLeft: `3px solid ${t.palette.primary.main}`,
            borderRadius: '6px',
          })}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: 'primary.main' }}>
              Replying to {replyTo.author === me ? 'yourself' : replyTo.author}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {replyTo.text || 'Attachment'}
            </Typography>
          </Box>
          <IconButton size="small" aria-label="Cancel reply" onClick={onCancelReply}>
            <X size={16} aria-hidden />
          </IconButton>
        </Box>
      )}
      <Box
        component="form"
        onSubmit={send}
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
        <MentionEditor
          value={text}
          onValueChange={(value) => {
            setText(value)
            setError('')
          }}
          onSubmit={() => send()}
          disabled={busy}
          readOnly={voice.phase === 'typing'}
          placeholder="Write a comment… use @ to mention"
          maxLength={MAX_NOTE_LENGTH}
          sx={{ flex: '1 1 160px' }}
        />
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
        <Tooltip title="Post comment">
          <span>
            <IconButton type="submit" color="primary" aria-label="Post comment" disabled={!hasContent || busy} sx={{ borderRadius: '10px' }}>
              <SendHorizontal size={20} aria-hidden />
            </IconButton>
          </span>
        </Tooltip>

        {(assignAction || stateActions.length > 0) && (
          <>
            <Box aria-hidden sx={{ width: '1px', height: 28, flexShrink: 0, bgcolor: 'divider' }} />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'flex-end' }}>
              {assignAction &&
                actionButton(assignAction, {
                  primary: stateActions.length === 0,
                  disabled: busy || manyMentions,
                  label: assignLabel,
                  Icon: UserPlus,
                  destructive: false,
                  onClick: () => void runAction(assignAction, mentions.length === 1 ? mentions[0] : undefined),
                })}
              {stateActions.map((action) => {
                const { Icon, kind } = actionLook(action.label)
                const approval = Boolean(isApprovalSubmit?.(action))
                return actionButton(action, {
                  primary: action.id === primaryId,
                  disabled: busy || manyMentions,
                  label: manyMentions
                    ? `${action.label} (mention at most one person)`
                    : approval && mentions.length === 1
                      ? `${action.label} to ${mentions[0]}`
                      : action.label,
                  Icon,
                  destructive: kind === 'destructive',
                  onClick: () => {
                    // Submit for Approval: the one person mentioned is the approver, if allowed to approve.
                    if (approval && mentions.length === 1) {
                      const approvers = eligibleApprovers(ticket)
                      if (!approvers.includes(mentions[0])) {
                        setError(`${mentions[0]} can't approve this work. Allowed approvers: ${approvers.join(', ')}.`)
                        return
                      }
                      void runAction(action, mentions[0])
                      return
                    }
                    void runAction(action)
                  },
                })
              })}
            </Box>
          </>
        )}
      </Box>
      {manyMentions && (assignAction || stateActions.length > 0) && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          With two or more people mentioned you can only post the comment.
        </Typography>
      )}
      {error && (
        <Typography role="alert" color="error" variant="caption" sx={{ display: 'block', mt: 0.75 }}>
          {error}
        </Typography>
      )}

      <AttachmentPopover anchorEl={attachAnchor} onClose={() => setAttachAnchor(null)} attachments={attachments} onPreview={setPreviewing} />
      <DocumentPreview attachment={previewing} onClose={() => setPreviewing(null)} />

      <Dialog open={subtaskChoice !== null} onClose={() => setSubtaskChoice(null)} sx={{ zIndex: (t) => t.zIndex.modal + 10 }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Create sub-task for:</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Checked people get a sub-task with this comment. Unchecked people are only kept informed.
          </Typography>
          <Stack>
            {subtaskChoice &&
              Object.entries(subtaskChoice).map(([name, checked]) => (
                <FormControlLabel
                  key={name}
                  control={<Checkbox checked={checked} onChange={(e) => setSubtaskChoice((prev) => (prev ? { ...prev, [name]: e.target.checked } : prev))} />}
                  label={name}
                />
              ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSubtaskChoice(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              const chosen = Object.entries(subtaskChoice ?? {}).filter(([, checked]) => checked).map(([name]) => name)
              setSubtaskChoice(null)
              void post(chosen)
            }}
          >
            Post
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
