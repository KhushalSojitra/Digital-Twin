export type Role = 'Administrator' | 'Operator' | 'Viewer'

export type TicketOperation =
  | 'workflow'
  | 'create'
  | 'details'
  | 'delete'
  | 'snapshot'
  | 'comment'
  | 'followers'
  | 'inbox'
  | 'change_type'
  | 'manage_types'
  | 'read_status'

/**
 * Which roles may call which operation. These rules mirror the database functions, which check them again.
 * 'workflow' is open to every role: who may run each action (assignee, reporter, manager, approver) is checked by
 * apply_workflow_action_secure in the database.
 */
const ALLOWED_ROLES: Record<TicketOperation, readonly Role[]> = {
  workflow: ['Administrator', 'Operator', 'Viewer'],
  create: ['Administrator', 'Operator'],
  details: ['Administrator', 'Operator'],
  delete: ['Administrator', 'Operator'],
  snapshot: ['Administrator', 'Operator'],
  comment: ['Administrator', 'Operator', 'Viewer'],
  followers: ['Administrator', 'Operator', 'Viewer'],
  inbox: ['Administrator', 'Operator', 'Viewer'],
  change_type: ['Administrator', 'Operator'],
  manage_types: ['Administrator', 'Operator'],
  read_status: ['Administrator', 'Operator', 'Viewer'],
}

export function roleMayRun(role: string, operation: TicketOperation): boolean {
  return (ALLOWED_ROLES[operation] as readonly string[]).includes(role)
}
