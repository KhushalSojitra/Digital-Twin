import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert, Snackbar } from '@mui/material'
import { supabase } from '../supabaseClient'
import {
  STATE_RESULT,
  createTicket,
  type LifecycleState,
  type NewTicketInput,
  type Snapshot,
  type Ticket,
} from '../data/tickets'
import {
  TICKET_REALTIME_TABLES,
  changeTicketState,
  deleteTicket as deleteTicketRow,
  fetchTicket,
  fetchTickets,
  insertTicket,
  updateTicketDetails,
  uploadSnapshot,
} from '../data/ticketRepository'

export interface TransitionInput {
  by: string
  notes?: string
  snapshot?: Snapshot
}

interface TicketsValue {
  tickets: Ticket[]
  addTicket: (input: NewTicketInput) => Promise<Ticket>
  deleteTicket: (id: string) => void
  assign: (id: string, assignee: string, by: string) => void
  toggleFollow: (id: string, person: string) => void
  addFollowers: (id: string, people: string[], by: string) => void
  shareWith: (id: string, person: string, by: string) => void
  removeFollower: (id: string, person: string, by: string) => void
  addComment: (id: string, text: string, by: string) => void
  updateDetails: (id: string, patch: { title: string; description: string; priority: Ticket['priority'] }, by: string) => void
  transition: (id: string, state: LifecycleState, input: TransitionInput) => void
  attachSnapshot: (id: string, slot: 'before' | 'after', snapshot: Snapshot) => void
}

const TicketsContext = createContext<TicketsValue | null>(null)

const REALTIME_RELOAD_DELAY_MS = 300

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function appendEvent(ticket: Ticket, by: string, text: string): Ticket {
  const at = new Date().toISOString()
  return { ...ticket, timeline: [...ticket.timeline, { at, by, text }] }
}

/**
 * Supabase is the single source of truth. Every action is written first and the UI only
 * changes once the database has confirmed it; failures are shown to the user.
 */
export function TicketsProvider({ children }: { children: ReactNode }) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const ticketsRef = useRef<Ticket[]>([])
  const writeQueues = useRef(new Map<string, Promise<void>>())
  const snapshotGuard = useRef(new Set<string>())

  const report = useCallback((error: unknown) => {
    console.error(error)
    setErrorMessage(messageOf(error))
  }, [])

  const warn = useCallback((message: string) => {
    console.warn(message)
    setErrorMessage(message)
  }, [])

  const replaceAll = useCallback((next: Ticket[]) => {
    ticketsRef.current = next
    setTickets(next)
  }, [])

  const commit = useCallback(
    (saved: Ticket) => {
      const others = ticketsRef.current.filter((ticket) => ticket.id !== saved.id)
      replaceAll([saved, ...others].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)))
    },
    [replaceAll],
  )

  /** Runs writes for one ticket strictly one after another so read-modify-write updates never overlap. */
  const enqueue = useCallback(<T,>(id: string, task: () => Promise<T>): Promise<T> => {
    const previous = writeQueues.current.get(id) ?? Promise.resolve()
    const run = previous.then(task)
    const tail = run.then(
      () => undefined,
      () => undefined,
    )
    writeQueues.current.set(id, tail)
    void tail.then(() => {
      if (writeQueues.current.get(id) === tail) writeQueues.current.delete(id)
    })
    return run
  }, [])

  const reload = useCallback(async () => {
    try {
      replaceAll(await fetchTickets(warn))
    } catch (error) {
      report(error)
    }
  }, [replaceAll, report, warn])

  useEffect(() => {
    let reloadTimer: number | undefined
    const scheduleReload = () => {
      window.clearTimeout(reloadTimer)
      reloadTimer = window.setTimeout(() => void reload(), REALTIME_RELOAD_DELAY_MS)
    }

    let channel = supabase.channel('ticket-changes')
    for (const table of TICKET_REALTIME_TABLES) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleReload)
    }
    channel.subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('Supabase ticket realtime subscription error:', error?.message ?? status)
      }
    })

    void reload()

    return () => {
      window.clearTimeout(reloadTimer)
      void supabase.removeChannel(channel)
    }
  }, [reload])

  /** Applies `fn` to the latest confirmed ticket and saves the editable columns. */
  const mutate = useCallback(
    (id: string, fn: (ticket: Ticket) => Ticket) => {
      void enqueue(id, async () => {
        const current = ticketsRef.current.find((ticket) => ticket.id === id)
        if (!current) throw new Error(`Ticket ${id} is not loaded`)
        commit(await updateTicketDetails(fn(current), warn))
      }).catch(report)
    },
    [enqueue, commit, report, warn],
  )

  const addTicket = useCallback(
    async (input: NewTicketInput) => {
      const id = `OE-${Date.now().toString().slice(-6)}-${crypto.randomUUID()}`
      const ticket = createTicket(input, id)
      try {
        await insertTicket(ticket)
        if (input.creationSnapshot) {
          try {
            await uploadSnapshot(id, 'before', input.creationSnapshot)
          } catch (error) {
            await deleteTicketRow(id).catch(() => undefined)
            throw error
          }
        }
        const saved = await fetchTicket(id, warn)
        commit(saved)
        return saved
      } catch (error) {
        report(error)
        throw error
      }
    },
    [commit, report, warn],
  )

  const deleteTicket = useCallback(
    (id: string) => {
      void enqueue(id, async () => {
        const paths = ticketsRef.current.find((ticket) => ticket.id === id)?.attachments.map((a) => a.storagePath) ?? []
        await deleteTicketRow(id, paths)
        replaceAll(ticketsRef.current.filter((ticket) => ticket.id !== id))
      }).catch(report)
    },
    [enqueue, replaceAll, report],
  )

  const assign = useCallback(
    (id: string, assignee: string, by: string) => mutate(id, (ticket) => appendEvent({ ...ticket, assignee }, by, `Assigned to ${assignee}`)),
    [mutate],
  )

  const toggleFollow = useCallback(
    (id: string, person: string) =>
      mutate(id, (ticket) => {
        const followers = ticket.followers.includes(person)
          ? ticket.followers.filter((follower) => follower !== person)
          : [...ticket.followers, person]
        return appendEvent({ ...ticket, followers }, person, followers.includes(person) ? 'Started following ticket' : 'Stopped following ticket')
      }),
    [mutate],
  )

  const addFollowers = useCallback(
    (id: string, people: string[], by: string) =>
      mutate(id, (ticket) => appendEvent({ ...ticket, followers: [...new Set([...ticket.followers, ...people])] }, by, 'Added followers')),
    [mutate],
  )

  const shareWith = useCallback(
    (id: string, person: string, by: string) =>
      mutate(id, (ticket) => appendEvent({ ...ticket, followers: [...new Set([...ticket.followers, person])] }, by, 'Shared ticket')),
    [mutate],
  )

  const removeFollower = useCallback(
    (id: string, person: string, by: string) =>
      mutate(id, (ticket) => appendEvent({ ...ticket, followers: ticket.followers.filter((follower) => follower !== person) }, by, 'Removed follower')),
    [mutate],
  )

  const updateDetails = useCallback(
    (id: string, next: { title: string; description: string; priority: Ticket['priority'] }, by: string) =>
      mutate(id, (ticket) => appendEvent({ ...ticket, ...next }, by, 'Updated details')),
    [mutate],
  )

  const addComment = useCallback(
    (id: string, text: string, by: string) =>
      mutate(id, (ticket) => {
        const at = new Date().toISOString()
        return appendEvent({ ...ticket, comments: [...ticket.comments, { at, by, text }] }, by, 'Added a comment')
      }),
    [mutate],
  )

  const transition = useCallback(
    (id: string, state: LifecycleState, input: TransitionInput) => {
      const afterKey = `${id}:after`
      const completionSnapshot = state === 'done' ? input.snapshot : undefined
      // Stops the "missing frame" backfill from racing the snapshot uploaded with this transition.
      if (completionSnapshot) snapshotGuard.current.add(afterKey)

      void enqueue(id, async () => {
        const completion = state === 'done' ? { by: input.by, at: new Date().toISOString(), notes: input.notes ?? '' } : null
        commit(await changeTicketState(id, STATE_RESULT[state], input.by, completion, warn))
        if (completionSnapshot) {
          await uploadSnapshot(id, 'after', completionSnapshot)
          commit(await fetchTicket(id, warn))
        }
      })
        .catch(report)
        .finally(() => snapshotGuard.current.delete(afterKey))
    },
    [enqueue, commit, report, warn],
  )

  const attachSnapshot = useCallback(
    (id: string, slot: 'before' | 'after', snapshot: Snapshot) => {
      const key = `${id}:${slot}`
      if (snapshotGuard.current.has(key)) return
      snapshotGuard.current.add(key)
      void enqueue(id, async () => {
        await uploadSnapshot(id, slot, snapshot)
        commit(await fetchTicket(id, warn))
      }).then(
        () => snapshotGuard.current.delete(key),
        // The key stays registered after a failure so a failing upload is not retried in a loop.
        report,
      )
    },
    [enqueue, commit, report, warn],
  )

  const value = useMemo(
    () => ({ tickets, addTicket, deleteTicket, assign, toggleFollow, addFollowers, shareWith, removeFollower, addComment, updateDetails, transition, attachSnapshot }),
    [tickets, addTicket, deleteTicket, assign, toggleFollow, addFollowers, shareWith, removeFollower, addComment, updateDetails, transition, attachSnapshot],
  )

  return (
    <TicketsContext.Provider value={value}>
      {children}
      <Snackbar open={errorMessage !== null} autoHideDuration={8000} onClose={() => setErrorMessage(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="error" variant="filled" onClose={() => setErrorMessage(null)} sx={{ maxWidth: 560 }}>
          {errorMessage}
        </Alert>
      </Snackbar>
    </TicketsContext.Provider>
  )
}

export function useTickets() {
  const ctx = useContext(TicketsContext)
  if (!ctx) throw new Error('useTickets must be used within TicketsProvider')
  return ctx
}
