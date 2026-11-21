import { DIRECTORY, userByName } from '../auth/users'
import { isUnassigned, type Ticket } from './tickets'
import type { TicketTypeConfig } from './ticketTypes'

/**
 * Who may run which workflow action. Mirrors apply_workflow_action_secure in
 * supabase/2026-11-20_02_permissions_approvals.sql; the database is the real gate, this only decides
 * which buttons are shown. People are compared by display name (the browser's view of a user).
 */

function topUserName(): string | null {
  return DIRECTORY.find((u) => !u.reportsTo)?.displayName ?? null
}

/** The person who approves or manages work done by `name`: their manager, or the top of the hierarchy. */
export function approverFor(name: string | null | undefined): string | null {
  if (!name || isUnassigned(name)) return null
  const user = userByName(name)
  if (!user) return null
  const manager = user.reportsTo ? DIRECTORY.find((u) => u.id === user.reportsTo) : undefined
  return manager?.displayName ?? topUserName()
}

export function isManagerOf(me: string, name: string | null | undefined): boolean {
  return Boolean(me) && approverFor(name) === me
}

function preApproverName(config: TicketTypeConfig | null | undefined): string | null {
  const id = config?.preApprover
  return (id ? DIRECTORY.find((u) => u.id === id)?.displayName : null) ?? topUserName()
}

/**
 * Sub-task rules: the main ticket's reporter or assignee, or the sub-task assignee's manager, may run any
 * action; the sub-task assignee may only start it and mark it done.
 */
function mayRunOnSubtask(ticket: Pick<Ticket, 'assignee' | 'creator'>, parent: Pick<Ticket, 'assignee' | 'creator'> | undefined, actionId: string, me: string): boolean {
  const controls =
    ticket.creator === me ||
    (parent && (parent.creator === me || (!isUnassigned(parent.assignee) && parent.assignee === me))) ||
    (!isUnassigned(ticket.assignee) && isManagerOf(me, ticket.assignee))
  if (controls) return true
  return !isUnassigned(ticket.assignee) && ticket.assignee === me && (actionId === 'start' || actionId === 'complete')
}

export function mayRunAction(
  ticket: Pick<Ticket, 'assignee' | 'creator' | 'parentTicketId' | 'approvalWorker'>,
  actionId: string,
  me: string,
  config: TicketTypeConfig | null | undefined,
  parent?: Pick<Ticket, 'assignee' | 'creator'>,
): boolean {
  if (!me) return false
  if (ticket.parentTicketId) return mayRunOnSubtask(ticket, parent, actionId, me)
  const unassigned = isUnassigned(ticket.assignee)
  const isAssignee = !unassigned && ticket.assignee === me
  const isReporter = ticket.creator === me
  const isManager = isManagerOf(me, unassigned ? ticket.creator : ticket.assignee)
  switch (actionId) {
    case 'approve':
    case 'reject':
      return me === preApproverName(config)
    case 'close':
      return isReporter
    case 'assign':
      return unassigned ? isReporter || isManager : isManager
    case 'start':
      return isAssignee || isManager || (unassigned && isReporter)
    case 'complete':
      return isAssignee || (isReporter && !config?.postApproval)
    case 'approve_post':
    case 'reject_post':
      // The approver chosen on Submit for Approval holds the ticket; older tickets: the worker's manager.
      if (ticket.approvalWorker) return isAssignee
      return !unassigned && approverFor(ticket.assignee) === me
    case 'hold':
      return isManager
    case 'resume':
      return isManager || isAssignee
    case 'reopen':
      return isReporter || isManager
    default:
      return isAssignee || isReporter
  }
}

/** True when choosing a different assignee for this action is the caller's call to make. */
export function mayReassign(ticket: Pick<Ticket, 'assignee' | 'creator'>, actionId: string, me: string): boolean {
  if (isUnassigned(ticket.assignee)) return true
  void actionId
  return isManagerOf(me, ticket.assignee)
}

/**
 * Team tab "Change assignee" (replaces Pass On). Mirrors change_ticket_assignee_secure:
 * main ticket → its reporter or the assignee's manager; sub-task → the main ticket's reporter or assignee,
 * the sub-task's creator, or the sub-task assignee's manager. Finished tickets cannot be reassigned.
 */
export function mayChangeAssignee(
  ticket: Pick<Ticket, 'assignee' | 'creator' | 'parentTicketId' | 'status'>,
  me: string,
  parent?: Pick<Ticket, 'assignee' | 'creator'>,
): boolean {
  if (!me || ticket.status === 'done' || ticket.status === 'accepted' || ticket.status === 'failed') return false
  const managesAssignee = !isUnassigned(ticket.assignee) && isManagerOf(me, ticket.assignee)
  if (!ticket.parentTicketId) return ticket.creator === me || managesAssignee
  return (
    ticket.creator === me ||
    managesAssignee ||
    Boolean(parent && (parent.creator === me || (!isUnassigned(parent.assignee) && parent.assignee === me)))
  )
}

/**
 * Who may approve work submitted for approval (spec §8.5). Mirrors eligible_approvers in
 * supabase/2026-11-21_06_choose_approver.sql: the reporter, the worker's manager, the Director, and on
 * Financial tickets any Finance team member — never the worker themself (the Director self-approves).
 * The reporter comes first: it is the default choice.
 */
export function eligibleApprovers(ticket: Pick<Ticket, 'creator' | 'assignee' | 'type'>, worker: string = ticket.assignee): string[] {
  const top = topUserName()
  const finance = ticket.type === 'financial' ? DIRECTORY.filter((u) => u.team === 'Finance').map((u) => u.displayName) : []
  const names = [ticket.creator, approverFor(worker), top, ...finance]
  const result: string[] = []
  for (const name of names) {
    if (!name || isUnassigned(name) || result.includes(name) || !userByName(name)) continue
    if (name === worker && name !== top) continue
    result.push(name)
  }
  return result
}
