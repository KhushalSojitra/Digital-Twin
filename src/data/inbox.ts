import { postInboxAction } from '../auth/authApi'

export type InboxItemType = 'mention' | 'reply' | 'assignment'

export interface InboxItem {
  id: string
  fromUser: string
  ticketId: string
  ticketTitle: string
  type: InboxItemType
  message: string
  commentId: string | null
  createdAt: string
  resolvedAt: string | null
}

export interface InboxTicket {
  ticketId: string
  openItems: number
  hasMention: boolean
  hasReply: boolean
  hasAssignment: boolean
  latestAt: string
}

export const RELATED_REASONS = ['creator', 'assignee', 'was_assigned', 'watcher', 'commented', 'mentioned'] as const
export type RelatedReason = (typeof RELATED_REASONS)[number]

export const RELATED_LABEL: Record<RelatedReason, string> = {
  creator: 'Creator',
  assignee: 'Assignee',
  was_assigned: 'Was assigned',
  watcher: 'Watching',
  commented: 'Commented',
  mentioned: 'Mentioned',
}

export interface RelatedTicket {
  ticketId: string
  reasons: RelatedReason[]
}

const INBOX_REFRESH_EVENT = 'oomnieye:inbox-refresh'

/** Asks the inbox to reload now, e.g. after a comment or action that may have resolved or created items. */
export function requestInboxRefresh() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(INBOX_REFRESH_EVENT))
}

export function onInboxRefreshRequested(listener: () => void): () => void {
  window.addEventListener(INBOX_REFRESH_EVENT, listener)
  return () => window.removeEventListener(INBOX_REFRESH_EVENT, listener)
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function rowsOf(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return []
  return data.map(record).filter((row): row is Record<string, unknown> => row !== null)
}

function parseItem(row: Record<string, unknown>): InboxItem | null {
  const type = row.type
  if (type !== 'mention' && type !== 'reply' && type !== 'assignment') return null
  const ticketId = str(row.ticket_id)
  if (!ticketId) return null
  return {
    id: str(row.id),
    fromUser: str(row.from_user),
    ticketId,
    ticketTitle: str(row.ticket_title),
    type,
    message: str(row.message),
    commentId: row.comment_id ? str(row.comment_id) : null,
    createdAt: str(row.created_at),
    resolvedAt: row.resolved_at ? str(row.resolved_at) : null,
  }
}

function parseInboxTicket(row: Record<string, unknown>): InboxTicket | null {
  const ticketId = str(row.ticket_id)
  if (!ticketId) return null
  return {
    ticketId,
    openItems: Number(row.open_items ?? row.open_count ?? 0) || 0,
    hasMention: row.has_mention === true,
    hasReply: row.has_reply === true,
    hasAssignment: row.has_assignment === true,
    latestAt: str(row.latest_at ?? row.latest_created_at),
  }
}

function parseRelated(row: Record<string, unknown>): RelatedTicket | null {
  const ticketId = str(row.ticket_id)
  if (!ticketId) return null
  const raw = Array.isArray(row.reasons) ? row.reasons : []
  const reasons = raw.filter((r): r is RelatedReason => (RELATED_REASONS as readonly string[]).includes(r as string))
  return { ticketId, reasons }
}

function dataOf(response: unknown): unknown {
  // postSigned() already unwraps { data }, so only unwrap again if a wrapper is still present.
  const r = record(response)
  return r && 'data' in r ? r.data : response
}

export async function fetchInboxCount(): Promise<number> {
  const data = dataOf(await postInboxAction({ action: 'inbox_count' }))
  const value = Array.isArray(data) ? (record(data[0]) ? Object.values(record(data[0]) ?? {})[0] : data[0]) : data
  const count = Number(value)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

export async function fetchInboxItems(): Promise<InboxItem[]> {
  const data = dataOf(await postInboxAction({ action: 'inbox', includeResolved: false, limit: 200 }))
  return rowsOf(data)
    .map(parseItem)
    .filter((item): item is InboxItem => item !== null && item.resolvedAt === null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function fetchInboxTickets(): Promise<InboxTicket[]> {
  const data = dataOf(await postInboxAction({ action: 'inbox_tickets' }))
  return rowsOf(data)
    .map(parseInboxTicket)
    .filter((row): row is InboxTicket => row !== null)
    .sort((a, b) => b.latestAt.localeCompare(a.latestAt))
}

export async function fetchRelatedTickets(): Promise<RelatedTicket[]> {
  const data = dataOf(await postInboxAction({ action: 'related_tickets' }))
  return rowsOf(data)
    .map(parseRelated)
    .filter((row): row is RelatedTicket => row !== null)
}

const ITEM_REASON: Record<InboxItemType, (from: string) => string> = {
  mention: (from) => (from ? `${from} mentioned you` : 'You were mentioned'),
  reply: (from) => (from ? `${from} replied to you` : 'Someone replied to you'),
  assignment: () => 'Assigned to you',
}

export function inboxItemReason(item: InboxItem): string {
  return ITEM_REASON[item.type](item.fromUser)
}

export function inboxTicketFallbackReason(row: InboxTicket): string {
  if (row.hasMention) return ITEM_REASON.mention('')
  if (row.hasReply) return ITEM_REASON.reply('')
  return ITEM_REASON.assignment('')
}

/** One-line preview of the comment text, without mention markup noise. */
export function inboxPreview(message: string): string {
  return message.replace(/\s+/g, ' ').trim()
}
