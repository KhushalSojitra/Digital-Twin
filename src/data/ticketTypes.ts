import { TYPE_LABEL } from './tickets'
import type { WorkflowDefinition, WorkflowState, WorkflowTransition } from './workflows'

/** Ticket type every new ticket starts with unless another is chosen. */
export const DEFAULT_TICKET_TYPE_KEY = 'standard'

/** The optional parts of a ticket type's workflow. To Do, In Progress and Done are always present. */
export interface TicketTypeConfig {
  preApproval: boolean
  postApproval: boolean
  onHold: boolean
  allowReopen: boolean
  allowPassOn: boolean
  /** User id of who pre-approves; null = the top of the hierarchy (Director). */
  preApprover?: string | null
}

type ConfigFlag = Exclude<keyof TicketTypeConfig, 'preApprover'>

export const CONFIG_OPTIONS: { key: ConfigFlag; label: string; description: string }[] = [
  { key: 'preApproval', label: 'Pre-approval', description: 'The ticket must be approved before work can start.' },
  { key: 'postApproval', label: 'Post-approval', description: 'Completed work waits for approval before the ticket is Done.' },
  { key: 'onHold', label: 'On Hold / Resume', description: 'Work in progress can be put on hold and resumed later.' },
  { key: 'allowReopen', label: 'Allow Reopen', description: 'Done tickets can be reopened by the reporter or the manager.' },
  { key: 'allowPassOn', label: 'Allow Pass On', description: 'The assignee or the reporter can hand work to someone else. Without it, only the manager reassigns.' },
]

export const DEFAULT_CONFIG: TicketTypeConfig = {
  preApproval: false,
  postApproval: false,
  onHold: true,
  allowReopen: true,
  allowPassOn: false,
  preApprover: null,
}

const BUILT_IN_CONFIG: Record<string, TicketTypeConfig> = {
  standard: DEFAULT_CONFIG,
  financial: { preApproval: true, postApproval: true, onHold: true, allowReopen: true, allowPassOn: false, preApprover: null },
  maintenance: { preApproval: false, postApproval: true, onHold: true, allowReopen: true, allowPassOn: false, preApprover: null },
}

/** A ticket type and the workflow every ticket of that type starts on. */
export interface TicketTypeDef {
  key: string
  label: string
  description: string
  /** Built-in types cannot be renamed or deleted. */
  isSystem: boolean
  /** Null until the ticket_types table is set up in the database. */
  workflowTemplateId: string | null
  /** Null for workflows created before configurable ticket types; those are shown read-only. */
  config: TicketTypeConfig | null
  /** Inactive types stay on the tickets that use them but are not offered for new tickets. */
  isActive: boolean
}

function parseConfig(value: unknown): TicketTypeConfig | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  return {
    preApproval: raw.pre_approval === true,
    postApproval: raw.post_approval === true,
    onHold: raw.on_hold === true,
    allowReopen: raw.reopen === true,
    allowPassOn: raw.pass_on === true,
    preApprover: typeof raw.pre_approver === 'string' && raw.pre_approver ? raw.pre_approver : null,
  }
}

export function configToDatabase(config: TicketTypeConfig) {
  return {
    pre_approval: config.preApproval,
    post_approval: config.postApproval,
    on_hold: config.onHold,
    reopen: config.allowReopen,
    pass_on: config.allowPassOn,
    pre_approver: config.preApproval ? (config.preApprover ?? null) : null,
  }
}

export function parseTicketType(row: Record<string, unknown>): TicketTypeDef | null {
  if (typeof row.key !== 'string' || typeof row.label !== 'string') return null
  return {
    key: row.key,
    label: row.label,
    description: typeof row.description === 'string' ? row.description : '',
    isSystem: row.is_system === true,
    workflowTemplateId: row.workflow_template_id == null ? null : String(row.workflow_template_id),
    config: parseConfig(row.config),
    isActive: row.is_active !== false,
  }
}

/** Shown until the ticket_types table is available, so ticket creation keeps working. */
export const BUILT_IN_TICKET_TYPES: TicketTypeDef[] = Object.entries(BUILT_IN_CONFIG).map(([key, config]) => ({
  key,
  label: TYPE_LABEL[key] ?? humanizeTypeKey(key),
  description: '',
  isSystem: true,
  workflowTemplateId: null,
  config,
  isActive: true,
}))

export function humanizeTypeKey(key: string) {
  const words = key.replace(/_/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key
}

/** Mirrors build_ticket_type_definition in supabase/2026-11-20_02_permissions_approvals.sql; used to preview a configuration. */
export function previewDefinition(config: TicketTypeConfig): WorkflowDefinition {
  const states: WorkflowState[] = []
  const transitions: WorkflowTransition[] = []
  const action = (id: string, label: string, from: string, to: string, assign: WorkflowTransition['assign'] = 'none', requireNote = false) =>
    transitions.push({ id, label, from: [from], to, assign, requireNote })

  if (config.preApproval) states.push({ key: 'pending_approval', label: 'Pending Approval', group: 'open' })
  states.push({ key: 'todo', label: 'To Do', group: 'open' }, { key: 'in_progress', label: 'In Progress', group: 'in_progress' })
  if (config.onHold) states.push({ key: 'on_hold', label: 'On Hold', group: 'in_progress' })
  if (config.postApproval) states.push({ key: 'pending_post_approval', label: 'Pending Post-approval', group: 'in_progress' })
  states.push({ key: 'done', label: 'Done', group: 'done' })
  if (config.preApproval) {
    states.push({ key: 'rejected', label: 'Rejected', group: 'open' }, { key: 'closed', label: 'Closed', group: 'failed' })
    action('approve', 'Approve', 'pending_approval', 'todo')
    action('reject', 'Reject', 'pending_approval', 'rejected', 'reporter', true)
    action('close', 'Close', 'rejected', 'closed')
  }

  action('assign', 'Assign', 'todo', 'todo', 'pick')
  action('start', 'Start Work', 'todo', 'in_progress', 'optional')
  action('complete', config.postApproval ? 'Submit for Approval' : 'Complete Work', 'in_progress', config.postApproval ? 'pending_post_approval' : 'done', 'none', true)
  if (config.postApproval) {
    action('approve_post', 'Approve', 'pending_post_approval', 'done')
    action('reject_post', 'Reject', 'pending_post_approval', 'in_progress', 'none', true)
  }
  if (config.onHold) {
    action('hold', 'Put On Hold', 'in_progress', 'on_hold')
    action('resume', 'Resume Work', 'on_hold', 'in_progress', 'optional')
  }
  if (config.allowPassOn) action('pass_on', 'Pass On', 'in_progress', 'in_progress', 'pick', true)
  if (config.allowReopen) action('reopen', 'Reopen', 'done', 'in_progress', 'optional')

  return { initial: config.preApproval ? 'pending_approval' : 'todo', states, transitions }
}
