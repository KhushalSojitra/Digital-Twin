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

export function mayRunAction(
  ticket: Pick<Ticket, 'assignee' | 'creator'>,
  actionId: string,
  me: string,
  config: TicketTypeConfig | null | undefined,
): boolean {
  if (!me) return false
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
      return !unassigned && approverFor(ticket.assignee) === me
    case 'hold':
      return isManager
    case 'resume':
      return isManager || isAssignee
    case 'pass_on':
      return Boolean(config?.allowPassOn) && (isAssignee || isReporter)
    case 'reopen':
      return isReporter || isManager
    default:
      return isAssignee || isReporter
  }
}

/** True when choosing a different assignee for this action is the caller's call to make. */
export function mayReassign(ticket: Pick<Ticket, 'assignee' | 'creator'>, actionId: string, me: string): boolean {
  if (isUnassigned(ticket.assignee)) return true
  return actionId === 'pass_on' || isManagerOf(me, ticket.assignee)
}
