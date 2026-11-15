import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material'
import { useAuth } from '../../auth/AuthContext'
import { useTickets } from '../../state/TicketsContext'
import { useWorkflow } from '../../state/WorkflowContext'
import type { Ticket } from '../../data/tickets'

interface Props {
  ticket: Ticket
}

/** Lets an administrator or operator move a ticket to another ticket type; the server audits the change. */
export default function TicketTypeChanger({ ticket }: Props) {
  const { currentUser } = useAuth()
  const { changeTicketType } = useTickets()
  const { ticketTypes, typeLabel } = useWorkflow()
  const [pending, setPending] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const canChange = currentUser?.role === 'Administrator' || currentUser?.role === 'Operator'
  const options = ticketTypes.filter((type) => type.isActive || type.key === ticket.type)

  if (!canChange) {
    return (
      <Box sx={{ mt: 1.5 }}>
        <Typography variant="caption" color="text.secondary">
          Ticket type
        </Typography>
        <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{typeLabel(ticket.type)}</Typography>
      </Box>
    )
  }

  const close = () => {
    if (saving) return
    setPending(null)
    setReason('')
    setError('')
  }

  const confirm = async () => {
    if (!pending) return
    setSaving(true)
    setError('')
    try {
      await changeTicketType(ticket.id, pending, reason.trim())
      setPending(null)
      setReason('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The ticket type could not be changed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <TextField
        select
        size="small"
        label="Ticket type"
        value={ticket.type}
        onChange={(e) => setPending(e.target.value)}
        sx={{ mt: 1.5 }}
        slotProps={{ htmlInput: { 'aria-label': 'Ticket type' } }}
      >
        {options.map((type) => (
          <MenuItem key={type.key} value={type.key}>
            {type.label}
          </MenuItem>
        ))}
      </TextField>

      <Dialog open={pending !== null} onClose={close} fullWidth maxWidth="xs">
        <DialogTitle>Change ticket type?</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            {typeLabel(ticket.type)} to {pending ? typeLabel(pending) : ''}. The ticket moves to the new type&apos;s workflow and the change is
            recorded in its history.
          </Typography>
          <TextField
            label="Reason"
            size="small"
            required
            multiline
            minRows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={saving}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={confirm} disabled={saving || !reason.trim()}>
            {saving ? 'Changing' : 'Change type'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
