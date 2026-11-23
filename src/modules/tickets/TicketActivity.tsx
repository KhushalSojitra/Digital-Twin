import { useMemo } from 'react'
import { Avatar, Box, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import type { Ticket, TicketComment, TicketEvent } from '../../data/tickets'
import { initials } from '../../utils/format'

/** One row of the activity log: what changed, which action did it, who and when. */
interface ActivityRow {
  update: string
  action: string
  by: string
  at: string
}

const arrow = (from: string, to: string) => `${from.trim()} → ${to.trim()}`

/**
 * Turns a stored history line into the table's Update / Action columns. History lines are written by the
 * database (apply_workflow_action, change_ticket_assignee_secure, sub-task creation) in a few fixed shapes.
 */
export function toActivityRow(event: TicketEvent): ActivityRow {
  const text = event.text.trim()
  const base = { by: event.by, at: event.at }
  let m: RegExpMatchArray | null

  if (/^ticket created/i.test(text)) return { ...base, action: 'Created', update: 'Ticket created' }
  if ((m = text.match(/^Assignee changed from (.+?) to (.+?)(?:: (.+))?$/)))
    return { ...base, action: 'Change assignee', update: `Assignee: ${arrow(m[1], m[2])}` }
  if ((m = text.match(/^Sent to (.+) for approval$/))) return { ...base, action: 'Submit for Approval', update: `Approver: ${m[1]}` }
  if ((m = text.match(/^Handed back to (.+)$/))) return { ...base, action: 'Hand back', update: `Assignee: ${m[1]}` }
  if ((m = text.match(/^Assigned to (.+)$/))) return { ...base, action: 'Assign', update: `Assignee: ${m[1]}` }
  if ((m = text.match(/^Sub-task created for (.+)$/))) return { ...base, action: 'Sub-task', update: `Sub-task created for ${m[1]}` }
  if (/^Sub-task created/i.test(text)) return { ...base, action: 'Sub-task', update: 'Created from a comment on the main ticket' }
  if ((m = text.match(/^(.+?): work passed from (.+) to (.+)$/))) return { ...base, action: m[1], update: `Assignee: ${arrow(m[2], m[3])}` }
  if ((m = text.match(/^(.+?): (.+) to (.+)$/))) return { ...base, action: m[1], update: `Status: ${arrow(m[2], m[3])}` }
  return { ...base, action: event.label ?? 'Update', update: text }
}

/** A comment is logged as an activity (who commented and when), without its text. */
function commentRow(comment: TicketComment): ActivityRow {
  const files = comment.attachments?.length ?? 0
  const parts = [comment.replyTo ? 'Reply added' : 'Comment added']
  if (files > 0) parts.push(`${files} attachment${files > 1 ? 's' : ''}`)
  if (comment.subtaskFor?.length) parts.push(`sub-task for ${comment.subtaskFor.join(', ')}`)
  return { action: 'Comment', update: parts.join(' · '), by: comment.by, at: comment.at }
}

const formatStamp = (iso: string) =>
  new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Activity log as a table (newest first): Update, Action, Performer, Date-time. Comment text stays in Comments. */
export default function TicketActivity({ ticket }: { ticket: Ticket }) {
  const rows = useMemo(
    () =>
      [...(ticket.timeline ?? []).map(toActivityRow), ...(ticket.comments ?? []).filter((c) => c.at).map(commentRow)]
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    [ticket.timeline, ticket.comments],
  )

  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No activity yet.
      </Typography>
    )
  }

  const head = { fontSize: 12, fontWeight: 700, color: 'text.secondary', whiteSpace: 'nowrap' as const, bgcolor: 'background.paper' }
  return (
    <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: '10px', maxHeight: '100%' }}>
      <Table size="small" stickyHeader aria-label="Ticket activity log">
        <TableHead>
          <TableRow>
            <TableCell sx={head}>Update</TableCell>
            <TableCell sx={head}>Action</TableCell>
            <TableCell sx={head}>Performer</TableCell>
            <TableCell sx={head}>Date-time</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={`${row.at}-${i}`} hover sx={{ verticalAlign: 'top' }}>
              <TableCell sx={{ minWidth: 200 }}>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{row.update}</Typography>
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                <Chip size="small" label={row.action} variant="outlined" sx={{ fontSize: 12, fontWeight: 600 }} />
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Avatar sx={{ width: 22, height: 22, fontSize: 9, fontWeight: 700, bgcolor: 'secondary.main' }}>{initials(row.by)}</Avatar>
                  <Typography sx={{ fontSize: 13 }}>{row.by}</Typography>
                </Box>
              </TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap', fontSize: 12.5, color: 'text.secondary' }}>{formatStamp(row.at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
