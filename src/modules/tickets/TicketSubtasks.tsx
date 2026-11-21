import { useState } from 'react'
import {
  Avatar,
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { CornerLeftUp } from 'lucide-react'
import { isUnassigned, type Ticket } from '../../data/tickets'
import { useWorkflow } from '../../state/WorkflowContext'
import { initials } from '../../utils/format'
import { StatusIndicator } from './TicketIndicators'

/** A sub-task counts as finished once it is Done or Discarded. */
export const isSubtaskOpen = (sub: Ticket) => sub.workflowState !== 'done' && sub.workflowState !== 'discarded'

/** Link from a sub-task back to its main ticket. */
export function ParentTicketLink({ parent, parentId, onOpen }: { parent?: Ticket; parentId: string; onOpen?: (id: string) => void }) {
  return (
    <ButtonBase
      onClick={() => onOpen?.(parentId)}
      disabled={!onOpen}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'primary.main', borderRadius: 1, px: 0.5, mt: 0.25, maxWidth: '100%' }}
    >
      <CornerLeftUp size={14} aria-hidden />
      <Typography variant="caption" noWrap sx={{ fontWeight: 700 }}>
        {/* Titles only in the UI; the id stays in the data (spec §8.1). */}
        Main ticket: {parent?.title ?? 'open main ticket'}
      </Typography>
    </ButtonBase>
  )
}

/** List of sub-tasks inside a main ticket: assignee and status, click to open. */
export function SubtaskList({ subtasks, onOpen }: { subtasks: Ticket[]; onOpen?: (id: string) => void }) {
  const { stateLabel } = useWorkflow()
  const done = subtasks.filter((s) => !isSubtaskOpen(s)).length
  return (
    <Stack spacing={1}>
      <Typography variant="body2" color="text.secondary">
        {done} of {subtasks.length} sub-tasks finished. The main ticket can be closed once every sub-task is done or discarded.
      </Typography>
      {subtasks.map((sub) => (
        <ButtonBase
          key={sub.id}
          onClick={() => onOpen?.(sub.id)}
          sx={(t) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            p: 1.25,
            textAlign: 'left',
            borderRadius: '10px',
            border: `1px solid ${t.palette.divider}`,
            '&:hover': { bgcolor: t.palette.action.hover },
          })}
        >
          <Avatar sx={{ width: 32, height: 32, fontSize: 11, fontWeight: 700, bgcolor: isUnassigned(sub.assignee) ? 'grey.500' : 'primary.main' }}>
            {isUnassigned(sub.assignee) ? '?' : initials(sub.assignee)}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
              {sub.assignee}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {sub.description}
            </Typography>
          </Box>
          <StatusIndicator stateName={stateLabel(sub)} status={sub.status} />
        </ButtonBase>
      ))}
    </Stack>
  )
}

/** Asked when closing a main ticket that still has open sub-tasks: complete or discard each one. */
export function CloseWithSubtasksDialog({
  open,
  subtasks,
  onCancel,
  onConfirm,
}: {
  open: boolean
  subtasks: Ticket[]
  onCancel: () => void
  onConfirm: (decisions: Record<string, 'complete' | 'discard'>) => Promise<void>
}) {
  const [decisions, setDecisions] = useState<Record<string, 'complete' | 'discard'>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const allChosen = subtasks.every((s) => decisions[s.id])

  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      await onConfirm(decisions)
      setDecisions({})
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The sub-tasks could not be updated.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} sx={{ zIndex: (t) => t.zIndex.modal + 10 }} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 700 }}>Open sub-tasks</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          This ticket still has open sub-tasks. Mark each one complete or discard it to continue.
        </Typography>
        <Stack spacing={1.25}>
          {subtasks.map((sub) => (
            <Box key={sub.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Box sx={{ flex: '1 1 200px', minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                  {sub.assignee}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                  {sub.description}
                </Typography>
              </Box>
              <ToggleButtonGroup
                size="small"
                exclusive
                value={decisions[sub.id] ?? null}
                onChange={(_, value: 'complete' | 'discard' | null) => value && setDecisions((prev) => ({ ...prev, [sub.id]: value }))}
                aria-label={`Decision for ${sub.assignee}'s sub-task`}
              >
                <ToggleButton value="complete">Mark complete</ToggleButton>
                <ToggleButton value="discard">Discard</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          ))}
        </Stack>
        {error && (
          <Typography role="alert" color="error" variant="caption" sx={{ display: 'block', mt: 1 }}>
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!allChosen || busy} onClick={() => void confirm()}>
          Continue
        </Button>
      </DialogActions>
    </Dialog>
  )
}
