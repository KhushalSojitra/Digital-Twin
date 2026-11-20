import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'
import type { Ticket } from '../data/tickets'

/** Reserved row that records when a user started being tracked, so history from before it never shows as new. */
const BASELINE_KEY = '__baseline__'

interface TicketReadsValue {
  /** True when someone else changed a ticket I report, own or follow since I last opened it. */
  hasUpdate: (ticket: Ticket) => boolean
  markSeen: (ticket: Ticket) => void
}

const TicketReadsContext = createContext<TicketReadsValue | null>(null)

const iso = (value: string) => {
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? value : new Date(time).toISOString()
}

function latestOtherEventAt(ticket: Ticket, me: string): string | null {
  let latest: string | null = null
  for (const event of ticket.timeline) {
    if (event.by === me) continue
    const at = iso(event.at)
    if (!latest || at > latest) latest = at
  }
  // Comments count as activity too, so a new mention or reply turns the ticket unread again.
  for (const comment of ticket.comments) {
    if (comment.by === me || !comment.at) continue
    const at = iso(comment.at)
    if (!latest || at > latest) latest = at
  }
  return latest
}

function isRelatedTo(ticket: Ticket, me: string): boolean {
  return ticket.creator === me || ticket.assignee === me || ticket.followers.includes(me)
}

export function TicketReadsProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth()
  // Rows are stored per user id; ticket fields (assignee, comment authors…) hold display names.
  const me = currentUser?.id ?? null
  const myName = currentUser?.displayName ?? null
  const [seen, setSeen] = useState<{ user: string; at: Record<string, string> } | null>(null)
  const seenRef = useRef(seen)
  seenRef.current = seen

  useEffect(() => {
    if (!me) {
      setSeen(null)
      return
    }
    let active = true
    const load = async () => {
      const { data, error } = await supabase.from('ticket_reads').select('ticket_id, seen_at').eq('user_name', me)
      if (error) {
        console.error('Unable to load ticket read state:', error.message)
        return
      }
      if (!active) return
      const at: Record<string, string> = {}
      for (const row of data ?? []) {
        at[String(row.ticket_id)] = new Date(String(row.seen_at)).toISOString()
      }
      if (!at[BASELINE_KEY]) {
        const baseline = new Date().toISOString()
        at[BASELINE_KEY] = baseline
        const { error: insertError } = await supabase
          .from('ticket_reads')
          .upsert({ user_name: me, ticket_id: BASELINE_KEY, seen_at: baseline }, { onConflict: 'user_name,ticket_id' })
        if (insertError) console.error('Unable to start ticket read tracking:', insertError.message)
      }
      if (active) setSeen({ user: me, at })
    }
    void load()
    return () => {
      active = false
    }
  }, [me])

  const hasUpdate = useCallback((ticket: Ticket) => {
    if (!me || !myName || !seen || seen.user !== me || !isRelatedTo(ticket, myName)) return false
    const latest = latestOtherEventAt(ticket, myName)
    if (!latest) return false
    const lastSeen = seen.at[ticket.id] ?? seen.at[BASELINE_KEY]
    return Boolean(lastSeen) && latest > lastSeen
  }, [me, myName, seen])

  const markSeen = useCallback((ticket: Ticket) => {
    const current = seenRef.current
    if (!me || !myName || !current || current.user !== me) return
    const latest = latestOtherEventAt(ticket, myName)
    const previous = current.at[ticket.id] ?? current.at[BASELINE_KEY]
    if (!latest || (previous && latest <= previous)) return
    const now = new Date().toISOString()
    const seenAt = latest > now ? latest : now
    setSeen({ user: me, at: { ...current.at, [ticket.id]: seenAt } })
    void supabase
      .from('ticket_reads')
      .upsert({ user_name: me, ticket_id: ticket.id, seen_at: seenAt }, { onConflict: 'user_name,ticket_id' })
      .then(({ error }) => {
        if (error) console.error(`Unable to save read state for ${ticket.id}:`, error.message)
      })
  }, [me, myName])

  const value = useMemo(() => ({ hasUpdate, markSeen }), [hasUpdate, markSeen])
  return <TicketReadsContext.Provider value={value}>{children}</TicketReadsContext.Provider>
}

export function useTicketReads() {
  const ctx = useContext(TicketReadsContext)
  if (!ctx) throw new Error('useTicketReads must be used within TicketReadsProvider')
  return ctx
}

/** Clears the update dot while a ticket is open, and again if it changes underneath the viewer. */
export function useMarkTicketSeen(ticket: Ticket | null | undefined, active = true) {
  const { markSeen } = useTicketReads()
  useEffect(() => {
    if (active && ticket) markSeen(ticket)
  }, [active, ticket, markSeen])
}
