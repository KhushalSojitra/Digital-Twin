import { useState } from 'react'
import {
  Avatar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
  alpha,
  type Theme,
} from '@mui/material'
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined'
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined'
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded'
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded'
import { mayChangeAssignee } from '../../data/permissions'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded'
import PersonAddAlt1RoundedIcon from '@mui/icons-material/PersonAddAlt1Rounded'
import { ASSIGNEES, UNASSIGNED, isUnassigned, type Ticket } from '../../data/tickets'
import { initials } from '../../utils/format'
import { managerName, userByName } from '../../auth/users'
import { useTickets } from '../../state/TicketsContext'

interface Props {
  ticket: Ticket
  me: string
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={(t) => ({
        border: `1px solid ${t.palette.divider}`,
        borderRadius: '12px',
        p: 1.75,
        minWidth: 0,
        minHeight: 0,
        overflowY: 'auto',
        bgcolor: t.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.015)',
      })}
    >
      {children}
    </Box>
  )
}

/** Primary 32px icon button, same as Link Ticket; its label is shown on hover. */
const primaryIconButtonSx = (t: Theme) => ({
  width: 32,
  height: 32,
  borderRadius: '8px',
  bgcolor: t.palette.primary.main,
  color: t.palette.primary.contrastText,
  '&:hover': { bgcolor: t.palette.primary.dark },
  '&.Mui-disabled': { bgcolor: t.palette.action.disabledBackground, color: t.palette.action.disabled },
})

function DetailRow({ icon, label, value, href }: { icon: React.ReactElement; label: string; value?: string | null; href?: string }) {
  return (
    <Box sx={(t) => ({ display: 'flex', alignItems: 'center', gap: 1.25, textAlign: 'left', border: `1px solid ${t.palette.divider}`, borderRadius: '10px', px: 1.25, py: 0.875 })}>
      <Box aria-hidden sx={{ display: 'flex', color: 'primary.main', '& svg': { fontSize: 18 } }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography component="dt" variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
          {label}
        </Typography>
        <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: 600, overflowWrap: 'anywhere' }}>
          {value ? (href ? <Box component="a" href={href} sx={{ color: 'inherit', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>{value}</Box> : value) : '—'}
        </Typography>
      </Box>
    </Box>
  )
}

export default function TicketTeamPanel({ ticket, me }: Props) {
  const { addFollowers, removeFollower, changeAssignee, tickets } = useTickets()
  const parent = ticket.parentTicketId ? tickets.find((t) => t.id === ticket.parentTicketId) : undefined
  const canChangeAssignee = mayChangeAssignee(ticket, me, parent)
  const [assignAnchor, setAssignAnchor] = useState<HTMLElement | null>(null)
  const [reassignTo, setReassignTo] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [reassigning, setReassigning] = useState(false)
  const [reassignError, setReassignError] = useState('')

  const confirmReassign = async () => {
    if (!reassignTo) return
    setReassigning(true)
    setReassignError('')
    try {
      await changeAssignee(ticket.id, reassignTo, reason.trim() || undefined)
      setNote(`Assignee changed to ${reassignTo}.`)
      setReassignTo(null)
      setReason('')
    } catch (cause) {
      setReassignError(cause instanceof Error ? cause.message : 'The assignee could not be changed.')
    } finally {
      setReassigning(false)
    }
  }
  const [watchAnchor, setWatchAnchor] = useState<HTMLElement | null>(null)
  const [pending, setPending] = useState<{ action: 'add' | 'remove'; name: string } | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const unassigned = isUnassigned(ticket.assignee)
  const assigneeUser = unassigned ? undefined : userByName(ticket.assignee)
  const followers = ticket.followers ?? []
  const candidates = ASSIGNEES.filter((p) => !followers.includes(p))
  const menuZ = (t: { zIndex: { modal: number } }) => t.zIndex.modal + 10

  const applyPending = () => {
    if (!pending) return
    if (pending.action === 'add') {
      addFollowers(ticket.id, [pending.name], me)
      setNote(`${pending.name} added as a watcher.`)
    } else {
      removeFollower(ticket.id, pending.name, me)
      setNote(`${pending.name} removed as a watcher.`)
    }
    setPending(null)
  }

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '5fr 6fr' }, gridAutoRows: 'minmax(0, 1fr)', gap: 1.5, flex: 1, minHeight: 0 }}>
      <Card>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700 }}>Assignee</Typography>
          {canChangeAssignee && (
            <Tooltip title="Change assignee">
              <IconButton aria-label="Change assignee" aria-haspopup="menu" onClick={(e) => setAssignAnchor(e.currentTarget)} sx={primaryIconButtonSx}>
                <SwapHorizRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
        <Stack sx={{ mt: 2, alignItems: 'center', textAlign: 'center', gap: 0.5 }}>
          <Avatar
            variant="rounded"
            src={assigneeUser?.avatarUrl ?? undefined}
            alt={unassigned ? '' : ticket.assignee}
            sx={{
              width: 120,
              height: 120,
              mb: 1,
              fontSize: 40,
              fontWeight: 700,
              borderRadius: '16px',
              bgcolor: assigneeUser?.avatarColor ?? 'primary.main',
              color: '#fff',
            }}
          >
            {unassigned ? <PersonOutlineRoundedIcon sx={{ fontSize: 56 }} /> : initials(ticket.assignee)}
          </Avatar>
          <Typography sx={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25, maxWidth: '100%', overflowWrap: 'anywhere' }}>
            {unassigned ? UNASSIGNED : ticket.assignee}
            {!unassigned && ticket.assignee === me && (
              <Typography component="span" variant="body2" color="text.secondary"> (you)</Typography>
            )}
          </Typography>
          {ticket.approvalWorker && (
            <Typography variant="body2" color="text.secondary">
              Approver · work by {ticket.approvalWorker}
            </Typography>
          )}
          {!unassigned && (
            <Box component="dl" sx={{ m: 0, mt: 1.5, width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <DetailRow icon={<AccountTreeOutlinedIcon />} label="Reporting manager" value={managerName(ticket.assignee)} />
              <DetailRow icon={<PhoneOutlinedIcon />} label="Contact number" value={assigneeUser?.phone} href={assigneeUser?.phone ? `tel:${assigneeUser.phone.replace(/[^+\d]/g, '')}` : undefined} />
              <DetailRow icon={<MailOutlineRoundedIcon />} label="Email" value={assigneeUser?.email} href={assigneeUser?.email ? `mailto:${assigneeUser.email}` : undefined} />
            </Box>
          )}
        </Stack>
      </Card>

      <Card>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700 }}>Watchers ({followers.length})</Typography>
          <Tooltip title={candidates.length === 0 ? 'Everyone is already watching' : 'Add watcher'}>
            <span>
              <IconButton
                aria-label="Add watcher"
                aria-haspopup="menu"
                disabled={candidates.length === 0}
                onClick={(e) => setWatchAnchor(e.currentTarget)}
                sx={primaryIconButtonSx}
              >
                <PersonAddAlt1RoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        {followers.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            No watchers yet.
          </Typography>
        ) : (
          <Stack spacing={1} sx={{ mt: 1.5 }}>
            {followers.map((f) => (
              <Stack
                key={f}
                direction="row"
                spacing={1.25}
                sx={(t) => ({
                  alignItems: 'center',
                  border: `1px solid ${t.palette.divider}`,
                  borderRadius: '10px',
                  p: 1,
                })}
              >
                <Avatar
                  sx={(t) => ({
                    width: 36,
                    height: 36,
                    fontSize: 13,
                    fontWeight: 700,
                    color: t.palette.primary.main,
                    bgcolor: alpha(t.palette.primary.main, 0.16),
                  })}
                >
                  {initials(f)}
                </Avatar>
                <Typography sx={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600 }} noWrap>
                  {f === me ? `${f} (you)` : f}
                </Typography>
                <IconButton size="small" aria-label={`Remove ${f} as watcher`} onClick={() => setPending({ action: 'remove', name: f })}>
                  <CloseRoundedIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
          </Stack>
        )}

        <Menu open={Boolean(watchAnchor)} anchorEl={watchAnchor} onClose={() => setWatchAnchor(null)} sx={{ zIndex: menuZ }}>
          {candidates.map((p) => (
            <MenuItem
              key={p}
              dense
              onClick={() => {
                setWatchAnchor(null)
                setPending({ action: 'add', name: p })
              }}
            >
              {p === me ? `${p} (you)` : p}
            </MenuItem>
          ))}
        </Menu>
      </Card>

      <Dialog open={Boolean(pending)} onClose={() => setPending(null)} maxWidth="xs" fullWidth sx={{ zIndex: (t) => t.zIndex.modal + 12 }}>
        <DialogTitle>{pending?.action === 'add' ? 'Add watcher' : 'Remove watcher'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {pending?.action === 'add'
              ? `Add ${pending.name} as a watcher on this ticket?`
              : `Remove ${pending?.name} as a watcher from this ticket?`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPending(null)}>Cancel</Button>
          <Button variant="contained" color={pending?.action === 'remove' ? 'error' : 'primary'} onClick={applyPending}>
            {pending?.action === 'add' ? 'Add' : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(note)} autoHideDuration={3000} onClose={() => setNote(null)} message={note ?? ''} />
      <Menu anchorEl={assignAnchor} open={Boolean(assignAnchor)} onClose={() => setAssignAnchor(null)} sx={{ zIndex: menuZ }}>
        {ASSIGNEES.filter((person) => person !== ticket.assignee).map((person) => (
          <MenuItem
            key={person}
            onClick={() => {
              setAssignAnchor(null)
              setReassignError('')
              setReassignTo(person)
            }}
          >
            {person}
          </MenuItem>
        ))}
      </Menu>
      <Dialog open={reassignTo !== null} onClose={reassigning ? undefined : () => setReassignTo(null)} sx={{ zIndex: menuZ }} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 700 }}>Change assignee</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1.5 }}>
            {unassigned ? 'Assign' : `Move from ${ticket.assignee} to`} <b>{reassignTo}</b>?
          </Typography>
          <TextField
            label="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
          {reassignError && (
            <Typography role="alert" color="error" variant="caption" sx={{ display: 'block', mt: 1 }}>
              {reassignError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReassignTo(null)} disabled={reassigning}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void confirmReassign()} disabled={reassigning}>
            Change assignee
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
