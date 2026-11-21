import { useCallback, useState, type ReactNode } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Snackbar, Stack, TextField, Typography } from '@mui/material'
import { ASSIGNEES, isUnassigned, type CommentAttachment, type Ticket } from '../../data/tickets'
import { eligibleApprovers, mayReassign } from '../../data/permissions'
import { useAuth } from '../../auth/AuthContext'
import { stateOf, type WorkflowTransition } from '../../data/workflows'
import { useTickets } from '../../state/TicketsContext'
import { useWorkflow } from '../../state/WorkflowContext'
import { fieldSx } from './TicketCreateLayout'

export interface RunOptions {
  /** Pre-filled note; when given it satisfies an action that requires one. */
  note?: string
  /** Person the ticket should be assigned to, e.g. someone @mentioned in the comment. Skips the assignee prompt. */
  assignee?: string
  /** Comment saved in the same database call as the action (both or neither). */
  comment?: { text: string; attachments?: CommentAttachment[]; replyTo?: string; mentions: string[] }
  /** Runs once the action has been saved. */
  onDone?: () => void | Promise<void>
  /** Runs when the attempt ends: saved, failed, or the prompt was cancelled. */
  onSettled?: () => void
}

interface Pending {
  ticket: Ticket
  action: WorkflowTransition
  options?: RunOptions
}

interface TicketActions {
  /** Actions the ticket's workflow offers right now, or none when this user may not act. */
  actionsFor: (ticket: Ticket) => WorkflowTransition[]
  run: (ticket: Ticket, action: WorkflowTransition, options?: RunOptions) => void
  /** Must be rendered once by the caller; hosts the assignee/note prompt and error toast. */
  dialog: ReactNode
  /** True for Submit for Approval (the worker picks the approver). */
  submitsForApproval: (ticket: Ticket, action: WorkflowTransition) => boolean
}

/** Single place where every ticket surface runs workflow actions. */
export function useTicketActions(me: string): TicketActions {
  const { actionsFor: workflowActions, mayRun, ticketTypes } = useWorkflow()
  const { performAction, tickets } = useTickets()
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = useCallback(
    async (ticket: Ticket, action: WorkflowTransition, extra: { assignee?: string; note?: string }, options?: RunOptions) => {
      try {
        await performAction(ticket.id, action.id, { by: me, ...extra, ...(options?.comment ? { comment: options.comment } : {}) })
        setPending(null)
        await options?.onDone?.()
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'The action could not be completed.')
      } finally {
        options?.onSettled?.()
      }
    },
    [performAction, me],
  )

  const actionsFor = useCallback(
    (ticket: Ticket) => {
      const parent = ticket.parentTicketId ? tickets.find((t) => t.id === ticket.parentTicketId) : undefined
      return workflowActions(ticket).filter((action) => mayRun(ticket, action.id, me, parent))
    },
    [mayRun, workflowActions, me, tickets],
  )

  const submitsForApproval = useCallback(
    (ticket: Ticket, action: WorkflowTransition) => isSubmitForApproval(ticket, action, ticketTypes),
    [ticketTypes],
  )

  const run = useCallback(
    (ticket: Ticket, action: WorkflowTransition, options?: RunOptions) => {
      const note = options?.note?.trim()
      const assignee = options?.assignee?.trim()
      const needsNote = action.requireNote && !note
      // Submit for Approval needs an approver; 'optional' only asks for a person when nobody is assigned yet.
      const choosesAssignee =
        (submitsForApproval(ticket, action) || action.assign === 'pick' || (action.assign === 'optional' && isUnassigned(ticket.assignee))) && !assignee
      if (choosesAssignee || needsNote) setPending({ ticket, action, options })
      else void submit(ticket, action, { ...(assignee ? { assignee } : {}), ...(note ? { note } : {}) }, options)
    },
    [submit, submitsForApproval],
  )

  const cancel = () => {
    pending?.options?.onSettled?.()
    setPending(null)
  }

  const dialog = (
    <>
      {pending && (
        <ActionPrompt
          key={`${pending.ticket.id}:${pending.action.id}`}
          pending={pending}
          onCancel={cancel}
          onSubmit={(ticket, action, extra) => submit(ticket, action, extra, pending.options)}
        />
      )}
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError(null)} message={error ?? ''} sx={{ zIndex: (t) => t.zIndex.modal + 20 }} />
    </>
  )

  return { actionsFor, run, dialog, submitsForApproval }
}

/** Submit for Approval on a main ticket whose type has post-approval: the worker picks the approver. */
function isSubmitForApproval(ticket: Ticket, action: WorkflowTransition, ticketTypes: { key: string; config: { postApproval: boolean } | null }[]) {
  return action.id === 'complete' && !ticket.parentTicketId && Boolean(ticketTypes.find((type) => type.key === ticket.type)?.config?.postApproval)
}

function ActionPrompt({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: Pending
  onCancel: () => void
  onSubmit: (ticket: Ticket, action: WorkflowTransition, extra: { assignee?: string; note?: string }) => Promise<void>
}) {
  const { versionFor, ticketTypes } = useWorkflow()
  const { ticket, action } = pending
  const approval = isSubmitForApproval(ticket, action, ticketTypes)
  const approvers = approval ? eligibleApprovers(ticket) : []
  // Default approver: the reporter (first in the list) when allowed.
  const [assignee, setAssignee] = useState(pending.options?.assignee ?? approvers[0] ?? '')
  const [note, setNote] = useState(pending.options?.note ?? '')
  const [busy, setBusy] = useState(false)

  const definition = versionFor(ticket)?.definition
  const from = stateOf(definition, ticket.workflowState)?.label
  const to = stateOf(definition, action.to)?.label
  const { currentUser } = useAuth()
  const unassigned = isUnassigned(ticket.assignee)
  const needsAssignee = approval || action.assign === 'pick' || (action.assign === 'optional' && unassigned)
  // Changing an existing assignee is the manager's call (the reporter uses the Team tab's Change assignee).
  const choosesAssignee = needsAssignee || (action.assign === 'optional' && mayReassign(ticket, action.id, currentUser?.displayName ?? ''))
  const ready = (!needsAssignee || assignee !== '') && (!action.requireNote || note.trim() !== '')

  const confirm = async () => {
    setBusy(true)
    await onSubmit(ticket, action, {
      ...(assignee !== '' ? { assignee } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    })
    setBusy(false)
  }

  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth sx={{ zIndex: (t) => t.zIndex.modal + 12 }}>
      <DialogTitle>{action.label}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {from && to && (
            <Typography variant="body2" color="text.secondary">
              {from} to {to}
            </Typography>
          )}
          {approval && (
            <TextField
              select
              required
              label="Approver"
              helperText="Reporter, the assignee's manager or the Director can approve this work."
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, select: { MenuProps: { sx: { zIndex: (t) => t.zIndex.modal + 14 } } } }}
              sx={fieldSx}
            >
              {approvers.map((person) => (
                <MenuItem key={person} value={person}>
                  {person}
                  {person === ticket.creator ? ' (reporter)' : ''}
                </MenuItem>
              ))}
            </TextField>
          )}
          {choosesAssignee && !approval && (
            <TextField
              select
              required={needsAssignee}
              label={needsAssignee ? (unassigned ? 'Assign to' : 'Pass work to') : 'Assignee (optional)'}
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, select: { MenuProps: { sx: { zIndex: (t) => t.zIndex.modal + 14 } }, displayEmpty: true } }}
              sx={fieldSx}
            >
              <MenuItem value="" disabled={needsAssignee}>
                {needsAssignee ? 'Select a person' : 'Keep current assignee'}
              </MenuItem>
              {ASSIGNEES.filter((person) => person !== ticket.assignee).map((person) => (
                <MenuItem key={person} value={person}>
                  {person}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            label={action.requireNote ? 'Note' : 'Note (optional)'}
            required={action.requireNote}
            multiline
            minRows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={fieldSx}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" disabled={!ready || busy} onClick={() => void confirm()}>
          {action.label}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
