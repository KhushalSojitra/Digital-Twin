import { isUnassigned, type Ticket, type TicketPriority } from '../../data/tickets'
import type { WorkflowState } from '../../data/workflows'

/** 'all', 'following', or the key of a workflow state. */
export type TicketTab = string

export interface TicketTabOption {
  id: TicketTab
  label: string
}

/** Tabs come from the workflow definitions, never from a fixed list. */
export function buildTabs(states: WorkflowState[]): TicketTabOption[] {
  return [{ id: 'all', label: 'All' }, ...states.map((state) => ({ id: state.key, label: state.label }))]
}

/** The ticket's workflow state; tickets without a workflow fall back to their status group. */
export function ticketStateKey(ticket: Pick<Ticket, 'workflowState' | 'status'>) {
  return ticket.workflowState ?? ticket.status
}

export interface TicketFilterState {
  /** Workflow state key. */
  status: string
  cameraId: string
  assignee: string
  creator: string
  from: string
  to: string
}

export const EMPTY_FILTERS: TicketFilterState = {
  status: '',
  cameraId: '',
  assignee: '',
  creator: '',
  from: '',
  to: '',
}

export function activeFilterCount(f: TicketFilterState) {
  return Object.values(f).filter((v) => v !== '').length
}

export const PRIORITY_RANK: Record<TicketPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 }

export interface TicketQuery {
  tab: TicketTab
  search: string
  filters: TicketFilterState
  /** Signed-in operator, used by the Following tab and the Assigned to me toggle. */
  me: string
  assignedToMe: boolean
}

export function applyTicketQuery(tickets: Ticket[], { tab, search, filters: f, me, assignedToMe }: TicketQuery) {
  const q = search.trim().toLowerCase()
  const from = f.from ? new Date(f.from).getTime() : null
  const to = f.to ? new Date(f.to).getTime() + 86_400_000 - 1 : null

  return tickets
    .filter((t) => tab === 'all' || (tab === 'following' ? (t.followers ?? []).includes(me) : ticketStateKey(t) === tab))
    .filter((t) => !assignedToMe || t.assignee === me)
    .filter((t) => !q || t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q))
    .filter((t) => !f.status || ticketStateKey(t) === f.status)
    .filter((t) => !f.cameraId || t.cameraId === f.cameraId)
    .filter((t) => !f.assignee || t.assignee === f.assignee)
    .filter((t) => !f.creator || t.creator === f.creator)
    .filter((t) => {
      const created = new Date(t.createdAt).getTime()
      return (from === null || created >= from) && (to === null || created <= to)
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
}

export type TicketScope = 'all' | 'assigned_me' | 'reported_me' | 'unassigned' | 'unassigned_reported_me'

export const SCOPES: { id: TicketScope; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'assigned_me', label: 'Assigned to Me' },
  { id: 'reported_me', label: 'Reported by Me' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'unassigned_reported_me', label: 'Unassigned & Reported by Me' },
]

export function matchesScope(t: Ticket, scope: TicketScope, me: string) {
  switch (scope) {
    case 'assigned_me':
      return t.assignee === me
    case 'reported_me':
      return t.creator === me
    case 'unassigned':
      return isUnassigned(t.assignee)
    case 'unassigned_reported_me':
      return isUnassigned(t.assignee) && t.creator === me
    default:
      return true
  }
}

/** Ticket pin diameter in px, chosen on a continuous slider. */
export type TicketPinSize = number

export const TICKET_SIZE_MIN = 16
export const TICKET_SIZE_MAX = 40
export const TICKET_SIZE_DEFAULT = Math.round((TICKET_SIZE_MIN + TICKET_SIZE_MAX) / 2)

export function clampTicketSize(value: unknown): TicketPinSize {
  const n = typeof value === 'number' ? value : Number.NaN
  if (!Number.isFinite(n)) return TICKET_SIZE_DEFAULT
  return Math.min(TICKET_SIZE_MAX, Math.max(TICKET_SIZE_MIN, Math.round(n)))
}
