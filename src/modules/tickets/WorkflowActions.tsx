import { useCallback, useState, type ReactNode } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Snackbar, Stack, TextField, Typography } from '@mui/material'
import { ASSIGNEES, type Ticket } from '../../data/tickets'
import { stateOf, type WorkflowTransition } from '../../data/workflows'
import { useTickets } from '../../state/TicketsContext'
import { useWorkflow } from '../../state/WorkflowContext'
import { fieldSx } from './TicketCreateLayout'

interface Pending {
  ticket: Ticket
  action: WorkflowTransition
}

interface TicketActions {
  /** Actions the ticket's workflow offers right now, or none when this user may not act. */
  actionsFor: (ticket: Ticket) => WorkflowTransition[]
  run: (ticket: Ticket, action: WorkflowTransition) => void
  /** Must be rendered once by the caller; hosts the assignee/note prompt and error toast. */
  dialog: ReactNode
}

/** Single place where every ticket surface runs workflow actions. */
export function useTicketActions(me: string): TicketActions {
  const { actionsFor: workflowActions, canAct } = useWorkflow()
  const { performAction } = useTickets()
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = useCallback(
    async (ticket: Ticket, action: WorkflowTransition, extra: { assignee?: string; note?: string }) => {
      try {
        await performAction(ticket.id, action.id, { by: me, ...extra })
        setPending(null)
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'The action could not be completed.')
      }
    },
    [performAction, me],
  )

  const actionsFor = useCallback((ticket: Ticket) => (canAct(ticket, me) ? workflowActions(ticket) : []), [canAct, workflowActions, me])

  const run = useCallback(
    (ticket: Ticket, action: WorkflowTransition) => {
      if (action.assign === 'pick' || action.assign === 'optional' || action.requireNote) setPending({ ticket, action })
      else void submit(ticket, action, {})
    },
    [submit],
  )

  const dialog = (
    <>
      {pending && <ActionPrompt key={`${pending.ticket.id}:${pending.action.id}`} pending={pending} onCancel={() => setPending(null)} onSubmit={submit} />}
      <Snackbar open={Boolean(error)} autoHideDuration={5000} onClose={() => setError(null)} message={error ?? ''} sx={{ zIndex: (t) => t.zIndex.modal + 20 }} />
    </>
  )

  return { actionsFor, run, dialog }
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
  const { versionFor } = useWorkflow()
  const { ticket, action } = pending
  const [assignee, setAssignee] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const definition = versionFor(ticket)?.definition
  const from = stateOf(definition, ticket.workflowState)?.label
  const to = stateOf(definition, action.to)?.label
  const needsAssignee = action.assign === 'pick'
  const choosesAssignee = needsAssignee || action.assign === 'optional'
  const ready = (!needsAssignee || assignee !== '') && (!action.requireNote || note.trim() !== '')

  const confirm = async () => {
    setBusy(true)
    await onSubmit(ticket, action, {
      ...(choosesAssignee && assignee !== '' ? { assignee } : {}),
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
          {choosesAssignee && (
            <TextField
              select
              required={needsAssignee}
              label={needsAssignee ? 'Pass work to' : 'Assignee (optional)'}
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
