export type Role = 'Administrator' | 'Operator' | 'Viewer'

export type TicketOperation =
  | 'workflow'
  | 'create'
  | 'details'
  | 'delete'
  | 'snapshot'
  | 'comment'
  | 'followers'
  | 'change_type'
  | 'manage_types'

/**
 * Which roles may call which operation. These rules mirror the database functions, which check them again.
 * 'workflow' is open to every role because the real gate is {@link isTicketParticipant}.
 */
const ALLOWED_ROLES: Record<TicketOperation, readonly Role[]> = {
  workflow: ['Administrator', 'Operator', 'Viewer'],
  create: ['Administrator', 'Operator'],
  details: ['Administrator', 'Operator'],
  delete: ['Administrator', 'Operator'],
  snapshot: ['Administrator', 'Operator'],
  comment: ['Administrator', 'Operator', 'Viewer'],
  followers: ['Administrator', 'Operator', 'Viewer'],
  change_type: ['Administrator', 'Operator'],
  manage_types: ['Administrator', 'Operator'],
}

export function roleMayRun(role: string, operation: TicketOperation): boolean {
  return (ALLOWED_ROLES[operation] as readonly string[]).includes(role)
}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim()
}

/**
 * A workflow action may only be run by the ticket's current assignee or its reporter, whatever the role.
 * 'Unassigned' is a placeholder, never a person.
 */
export function isTicketParticipant(actorName: string, ticket: { assignee?: string | null; reporter?: string | null }): boolean {
  const actor = clean(actorName)
  if (!actor || actor.toLowerCase() === 'unassigned') return false
  return actor === clean(ticket.assignee) || actor === clean(ticket.reporter)
}
