import type { TicketStatus } from './tickets'

/** Every workflow state rolls up to one of the status groups used by pins, filters and statistics. */
export type StateGroup = TicketStatus

export const STATE_GROUPS: StateGroup[] = ['open', 'in_progress', 'done', 'accepted', 'failed']

export const STATE_GROUP_LABEL: Record<StateGroup, string> = {
  open: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
  accepted: 'Accepted',
  failed: 'Failed',
}

export type AssignBehavior = 'none' | 'pick' | 'reporter' | 'optional'

export const ASSIGN_LABEL: Record<AssignBehavior, string> = {
  none: 'Keep assignee',
  pick: 'Choose a new assignee',
  reporter: 'Hand back to reporter',
  optional: 'Keep or change assignee',
}

export interface WorkflowState {
  key: string
  label: string
  group: StateGroup
}

export interface WorkflowTransition {
  id: string
  label: string
  from: string[]
  to: string
  assign: AssignBehavior
  requireNote: boolean
}

export interface WorkflowDefinition {
  initial: string
  states: WorkflowState[]
  transitions: WorkflowTransition[]
}

export interface WorkflowVersion {
  id: string
  templateId: string
  version: number
  definition: WorkflowDefinition
  isActive: boolean
  createdAt: string
}

export interface WorkflowTemplate {
  id: string
  name: string
  description: string
  isSystem: boolean
  createdAt: string
  /** Newest first. */
  versions: WorkflowVersion[]
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export function parseDefinition(value: unknown): WorkflowDefinition {
  const raw = record(value)
  const states = (Array.isArray(raw.states) ? raw.states : []).flatMap((entry): WorkflowState[] => {
    const state = record(entry)
    if (typeof state.key !== 'string' || typeof state.label !== 'string') return []
    const group = STATE_GROUPS.find((candidate) => candidate === state.group) ?? 'open'
    return [{ key: state.key, label: state.label, group }]
  })
  const transitions = (Array.isArray(raw.transitions) ? raw.transitions : []).flatMap((entry): WorkflowTransition[] => {
    const transition = record(entry)
    if (typeof transition.id !== 'string' || typeof transition.label !== 'string' || typeof transition.to !== 'string') return []
    const from = Array.isArray(transition.from) ? transition.from.filter((key): key is string => typeof key === 'string') : []
    const assign: AssignBehavior =
      transition.assign === 'pick' || transition.assign === 'reporter' || transition.assign === 'optional' ? transition.assign : 'none'
    return [{ id: transition.id, label: transition.label, from, to: transition.to, assign, requireNote: transition.requireNote === true }]
  })
  return { initial: typeof raw.initial === 'string' ? raw.initial : (states[0]?.key ?? ''), states, transitions }
}

export function parseVersion(value: unknown): WorkflowVersion | null {
  const row = record(value)
  if (typeof row.id !== 'string' || typeof row.template_id !== 'string') return null
  return {
    id: row.id,
    templateId: row.template_id,
    version: Number(row.version) || 1,
    definition: parseDefinition(row.definition),
    isActive: row.is_active === true,
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
  }
}

export function stateOf(definition: WorkflowDefinition | undefined, key: string | undefined): WorkflowState | undefined {
  if (!definition || !key) return undefined
  return definition.states.find((state) => state.key === key)
}

export function actionsFrom(definition: WorkflowDefinition | undefined, stateKey: string | undefined): WorkflowTransition[] {
  if (!definition || !stateKey) return []
  return definition.transitions.filter((transition) => transition.from.includes(stateKey))
}

export function emptyDefinition(): WorkflowDefinition {
  return {
    initial: 'todo',
    states: [
      { key: 'todo', label: 'To Do', group: 'open' },
      { key: 'in_progress', label: 'In Progress', group: 'in_progress' },
      { key: 'accepted', label: 'Accepted', group: 'accepted' },
    ],
    transitions: [
      { id: 'start', label: 'Start Work', from: ['todo'], to: 'in_progress', assign: 'none', requireNote: false },
      { id: 'complete', label: 'Complete Work', from: ['in_progress'], to: 'accepted', assign: 'none', requireNote: false },
    ],
  }
}

export function slug(label: string, taken: string[]): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'item'
  let candidate = base
  let n = 2
  while (taken.includes(candidate)) {
    candidate = `${base}_${n}`
    n += 1
  }
  return candidate
}
