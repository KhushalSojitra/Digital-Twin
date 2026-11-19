import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { whenAuthSettled } from '../auth/authApi'
import {
  fetchInboxCount,
  fetchInboxItems,
  fetchInboxTickets,
  fetchRelatedTickets,
  inboxItemReason,
  inboxPreview,
  inboxTicketFallbackReason,
  onInboxRefreshRequested,
  type InboxItem,
  type InboxTicket,
  type RelatedReason,
} from '../data/inbox'

const POLL_MS = 30_000

export interface InboxReason {
  label: string
  preview: string
}

interface InboxValue {
  /** Tickets waiting on the signed-in user (drives the bell badge). */
  count: number
  inboxTicketIds: ReadonlySet<string>
  relatedTicketIds: ReadonlySet<string>
  isWaiting: (ticketId: string) => boolean
  reasonFor: (ticketId: string) => InboxReason | null
  relatedReasons: (ticketId: string) => RelatedReason[]
  /** Newest-first order of inbox tickets, for sorting the Inbox view. */
  inboxOrder: (ticketId: string) => number
  refresh: () => void
}

const EMPTY_SET: ReadonlySet<string> = new Set()

const InboxContext = createContext<InboxValue>({
  count: 0,
  inboxTicketIds: EMPTY_SET,
  relatedTicketIds: EMPTY_SET,
  isWaiting: () => false,
  reasonFor: () => null,
  relatedReasons: () => [],
  inboxOrder: () => Number.MAX_SAFE_INTEGER,
  refresh: () => undefined,
})

interface Loaded {
  count: number
  items: InboxItem[]
  tickets: InboxTicket[]
  related: Map<string, RelatedReason[]>
}

const EMPTY: Loaded = { count: 0, items: [], tickets: [], related: new Map() }

export function InboxProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth()
  const userId = currentUser?.id ?? null
  const [loaded, setLoaded] = useState<Loaded>(EMPTY)
  const sequence = useRef(0)

  const load = useCallback(async () => {
    const mine = ++sequence.current
    if (!userId) {
      setLoaded(EMPTY)
      return
    }
    // An account switch is a POST; wait for it so these reads run as the newly active user.
    await whenAuthSettled()
    if (mine !== sequence.current) return
    const [count, items, tickets, related] = await Promise.allSettled([
      fetchInboxCount(),
      fetchInboxItems(),
      fetchInboxTickets(),
      fetchRelatedTickets(),
    ])
    if (mine !== sequence.current) return
    for (const result of [count, items, tickets, related]) {
      if (result.status === 'rejected') console.error('Unable to load inbox data:', result.reason)
    }
    setLoaded((prev) => ({
      count: count.status === 'fulfilled' ? count.value : prev.count,
      items: items.status === 'fulfilled' ? items.value : prev.items,
      tickets: tickets.status === 'fulfilled' ? tickets.value : prev.tickets,
      related:
        related.status === 'fulfilled' ? new Map(related.value.map((row) => [row.ticketId, row.reasons])) : prev.related,
    }))
  }, [userId])

  // Switching users must never show the previous user's inbox, so state is cleared before the new load.
  useEffect(() => {
    setLoaded(EMPTY)
    void load()
    if (!userId) return
    const timer = window.setInterval(() => void load(), POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    const stopListening = onInboxRefreshRequested(() => void load())
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      stopListening()
    }
  }, [load, userId])

  const value = useMemo<InboxValue>(() => {
    const inboxTicketIds = new Set(loaded.tickets.map((row) => row.ticketId))
    const relatedTicketIds = new Set(loaded.related.keys())
    const order = new Map(loaded.tickets.map((row, index) => [row.ticketId, index]))
    const newestItem = new Map<string, InboxItem>()
    for (const item of loaded.items) if (!newestItem.has(item.ticketId)) newestItem.set(item.ticketId, item)
    const byTicket = new Map(loaded.tickets.map((row) => [row.ticketId, row]))
    return {
      count: loaded.count,
      inboxTicketIds,
      relatedTicketIds,
      isWaiting: (ticketId) => inboxTicketIds.has(ticketId),
      reasonFor: (ticketId) => {
        const item = newestItem.get(ticketId)
        if (item) return { label: inboxItemReason(item), preview: item.type === 'assignment' ? '' : inboxPreview(item.message) }
        const row = byTicket.get(ticketId)
        return row ? { label: inboxTicketFallbackReason(row), preview: '' } : null
      },
      relatedReasons: (ticketId) => loaded.related.get(ticketId) ?? [],
      inboxOrder: (ticketId) => order.get(ticketId) ?? Number.MAX_SAFE_INTEGER,
      refresh: () => void load(),
    }
  }, [loaded, load])

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>
}

export function useInbox() {
  return useContext(InboxContext)
}
