import { createContext, useCallback, useContext, useState, type MouseEvent, type ReactNode } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { LIFECYCLE_LABEL, NEXT_STATES, type Ticket } from '../../data/tickets'
import { useTickets } from '../../state/TicketsContext'
import { useAuth } from '../../auth/AuthContext'

export interface TicketMarkerActions {
  onView: (ticket: Ticket) => void
  onEdit: (ticket: Ticket) => void
  onInfo: (ticket: Ticket) => void
}

const TicketMarkerActionsContext = createContext<TicketMarkerActions | null>(null)

/** Supplies the host surface's existing view / edit / info openers to every ticket marker beneath it. */
export const TicketMarkerActionsProvider = TicketMarkerActionsContext.Provider

/** In-app replacement for window.confirm, which sandboxed preview frames silently suppress. */
export function TicketDeleteDialog({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
  const { deleteTicket } = useTickets()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const close = () => {
    if (busy) return
    setFailed(false)
    onClose()
  }

  const confirm = async () => {
    if (!ticket) return
    setBusy(true)
    setFailed(false)
    const deleted = await deleteTicket(ticket.id)
    setBusy(false)
    if (deleted) onClose()
    else setFailed(true)
  }

  return (
    <Dialog
      open={Boolean(ticket)}
      onClose={close}
      maxWidth="xs"
      fullWidth
      sx={{ zIndex: (theme) => theme.zIndex.modal + 12 }}
    >
      <DialogTitle>Delete ticket?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {ticket ? `Delete ticket ${ticket.id}? This cannot be undone.` : ''}
        </DialogContentText>
        {failed && (
          <Typography role="alert" variant="body2" color="error" sx={{ mt: 1.5 }}>
            The ticket could not be deleted. It may already be removed, or you may not have permission.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={confirm} color="error" variant="contained" disabled={busy}>
          {busy ? 'Deleting…' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

interface MenuState {
  x: number
  y: number
  ticketId: string
  fallback: Ticket
}

/**
 * Right-click menu for ticket icons/markers. Returns a contextmenu handler for the marker and the
 * menu element to render beside it (outside the marker's own click target).
 */
export function useTicketMarkerMenu(): {
  onContextMenu: (event: MouseEvent, ticket: Ticket) => void
  menu: ReactNode
} {
  const actions = useContext(TicketMarkerActionsContext)
  const { tickets, transition } = useTickets()
  const { currentUser } = useAuth()
  const me = currentUser?.displayName ?? 'Ava Sharma'
  const canEdit = currentUser?.role !== 'Viewer'
  const [state, setState] = useState<MenuState | null>(null)
  const [deleting, setDeleting] = useState<Ticket | null>(null)

  const onContextMenu = useCallback(
    (event: MouseEvent, ticket: Ticket) => {
      if (!actions) return
      event.preventDefault()
      event.stopPropagation()
      setState({ x: event.clientX, y: event.clientY, ticketId: ticket.id, fallback: ticket })
    },
    [actions],
  )

  if (!actions) return { onContextMenu, menu: null }

  const ticket = state ? (tickets.find((t) => t.id === state.ticketId) ?? state.fallback) : null
  const nextState = ticket ? NEXT_STATES[ticket.status]?.[0] : undefined
  const close = () => setState(null)
  const run = (action: (target: Ticket) => void) => () => {
    if (!ticket) return
    close()
    action(ticket)
  }

  const menu = (
    <>
      <Menu
        open={Boolean(state)}
        onClose={close}
        anchorReference="anchorPosition"
        anchorPosition={state ? { top: state.y, left: state.x } : undefined}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onClick={(event) => event.stopPropagation()}
        sx={{ zIndex: (theme) => theme.zIndex.modal + 10 }}
        slotProps={{ paper: { sx: { minWidth: 188, borderRadius: '12px' } } }}
      >
        <MenuItem onClick={run(actions.onView)}>
          <ListItemIcon>
            <VisibilityRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>View</ListItemText>
        </MenuItem>
        <MenuItem disabled={!canEdit} onClick={run(actions.onEdit)}>
          <ListItemIcon>
            <EditRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem
          disabled={!canEdit}
          onClick={run((target) => setDeleting(target))}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon sx={{ color: 'inherit' }}>
            <DeleteOutlineRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem
          disabled={!canEdit || !nextState}
          onClick={run((target) => {
            const next = NEXT_STATES[target.status]?.[0]
            if (next) transition(target.id, next, { by: me })
          })}
        >
          <ListItemIcon>
            <ArrowForwardRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText secondary={nextState ? `to ${LIFECYCLE_LABEL[nextState]}` : undefined}>Next State</ListItemText>
        </MenuItem>
        <MenuItem onClick={run(actions.onInfo)}>
          <ListItemIcon>
            <InfoOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Info</ListItemText>
        </MenuItem>
      </Menu>
      <TicketDeleteDialog ticket={deleting} onClose={() => setDeleting(null)} />
    </>
  )

  return { onContextMenu, menu }
}
