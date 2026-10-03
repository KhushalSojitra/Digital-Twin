import type { Ticket, TicketPriority, TicketStatus } from '../../data/tickets'

export type TicketTab = TicketStatus | 'following' | 'all'

export const TABS: { id: TicketTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'failed', label: 'Failed' },
]

export interface TicketFilterState {
  status: TicketStatus | ''
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
    .filter((t) => tab === 'all' || (tab === 'following' ? (t.followers ?? []).includes(me) : t.status === tab))
    .filter((t) => !assignedToMe || t.assignee === me)
    .filter((t) => !q || t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q))
    .filter((t) => !f.status || t.status === f.status)
    .filter((t) => !f.cameraId || t.cameraId === f.cameraId)
    .filter((t) => !f.assignee || t.assignee === f.assignee)
    .filter((t) => !f.creator || t.creator === f.creator)
    .filter((t) => {
      const created = new Date(t.createdAt).getTime()
      return (from === null || created >= from) && (to === null || created <= to)
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
}

export type TicketPinSize = 'small' | 'medium' | 'large'

export const TICKET_SIZE_PX: Record<TicketPinSize, number> = { small: 20, medium: 28, large: 36 }

export const TICKET_SIZE_LABEL: Record<TicketPinSize, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
}
