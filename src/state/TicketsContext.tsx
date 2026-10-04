import { createContext, useCallback, useContext, useMemo, useState, useEffect, type ReactNode } from 'react'
import { supabase } from '../supabaseClient'
import {
  LIFECYCLE_LABEL,
  STATE_RESULT,
  createTicket,
  type LifecycleState,
  type NewTicketInput,
  type Snapshot,
  type Ticket,
} from '../data/tickets'

export interface TransitionInput {
  by: string
  notes?: string
  snapshot?: Snapshot
}

interface TicketsValue {
  tickets: Ticket[]
  addTicket: (input: NewTicketInput) => Ticket
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

export function TicketsProvider({ children }: { children: ReactNode }) {
  const [tickets, setTickets] = useState<Ticket[]>([])

  useEffect(() => {
    async function loadInitialTickets() {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (!error && data) {
        const mappedTickets: Ticket[] = data.map((row: any) => {
          const ptz = row.ptz_coordinates || {};
          return {
            id: row.ticket_id || row.id,
            title: row.title,
            description: row.description || '',
            status: row.status === 'to do' ? 'open' : (row.status || 'open'),
            priority: row.priority || 'medium',
            type: 'intrusion', 
            cameraId: row.camera_name || 'cam-01',
            siteId: 'site-01',
            zone: 'Perimeter',
            assignee: row.assignee || '',
            creator: row.reporter || 'System',
            platform: 'default',
            followers: [],
            comments: Array.isArray(row.replies) ? row.replies : [],
            createdAt: row.created_at,
            updatedAt: row.created_at,
            snapshots: {},
            snapshotConfig: { captureCreation: true, captureCompletion: true, showInImprovementHistory: true },
            timeline: Array.isArray(row.history_log) ? row.history_log : [],
            yaw: ptz.yaw || 0,
            pitch: ptz.pitch || 0,
            zoom: ptz.zoom || 1,
            distanceM: ptz.distanceM || 35,
            lat: ptz.lat || 0,
            lng: ptz.lng || 0
          };
        });
        setTickets(mappedTickets);
      }
    }
    loadInitialTickets();
  }, []);

  const patch = useCallback((id: string, fn: (t: Ticket) => Ticket) => {
    setTickets((prev) => prev.map((t) => (t.id === id ? fn(t) : t)))
  }, [])

  const log = (t: Ticket, by: string, text: string, state?: LifecycleState): Ticket => {
    const at = new Date().toISOString()
    return { ...t, updatedAt: at, timeline: [...(t.timeline ?? []), { at, by, text, state }] }
  }

  const addTicket = useCallback((input: NewTicketInput) => {
    const ticket = createTicket(input)
    supabase
      .from('tickets')
      .insert([
        {
          id: ticket.id,
          ticket_id: ticket.id, 
          title: ticket.title,
          description: ticket.description,
          priority: ticket.priority,
          status: 'to do', 
          reporter: ticket.creator,
          assignee: ticket.assignee || 'Unassigned',
          camera_name: ticket.cameraId,
          ptz_coordinates: {
            yaw: ticket.yaw,
            pitch: ticket.pitch,
            zoom: ticket.zoom,
            distanceM: ticket.distanceM,
            lat: ticket.lat,
            lng: ticket.lng
          },
          history_log: ticket.timeline,
          replies: ticket.comments
        }
      ])
      .then(({ error }) => {
        if (error) console.error("Supabase sync error:", error.message);
      });
    setTickets((prev) => [ticket, ...prev])
    return ticket
  }, [])
  useEffect(() => {
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        (payload) => {
          const { eventType, new: newRow } = payload as any;
          const ptz = newRow?.ptz_coordinates || {};

          if (eventType === 'INSERT') {
            setTickets((prev) => {
              const trackingId = newRow.ticket_id || newRow.id;
              if (prev.some((t) => t.id === trackingId)) return prev;
              
              const freshTicket: Ticket = {
                id: trackingId,
                title: newRow.title,
                description: newRow.description || '',
                status: newRow.status === 'to do' ? 'open' : (newRow.status || 'open'),
                priority: newRow.priority || 'medium',
                type: 'intrusion',
                cameraId: newRow.camera_name || 'cam-01',
                siteId: 'site-01',
                zone: 'Perimeter',
                assignee: newRow.assignee || '',
                creator: newRow.reporter || 'System',
                platform: 'default',
                followers: [],
                comments: Array.isArray(newRow.replies) ? newRow.replies : [],
                createdAt: newRow.created_at,
                updatedAt: newRow.created_at,
                snapshots: {},
                snapshotConfig: { captureCreation: true, captureCompletion: true, showInImprovementHistory: true },
                timeline: Array.isArray(newRow.history_log) ? newRow.history_log : [],
                yaw: ptz.yaw || 0,
                pitch: ptz.pitch || 0,
                zoom: ptz.zoom || 1,
                distanceM: ptz.distanceM || 35,
                lat: ptz.lat || 0,
                lng: ptz.lng || 0
              };
              return [freshTicket, ...prev];
            });
          } 
          
          else if (eventType === 'UPDATE') {
            setTickets((prev) =>
              prev.map((t) => {
                const trackingId = newRow.ticket_id || newRow.id;
                return t.id === trackingId
                  ? {
                      ...t,
                      title: newRow.title,
                      description: newRow.description || '',
                      priority: newRow.priority || 'medium',
                      status: newRow.status === 'to do' ? 'open' : (newRow.status || 'open'),
                      assignee: newRow.assignee || '',
                      timeline: Array.isArray(newRow.history_log) ? newRow.history_log : t.timeline,
                      comments: Array.isArray(newRow.replies) ? newRow.replies : t.comments,
                      yaw: ptz.yaw || t.yaw,
                      pitch: ptz.pitch || t.pitch,
                      zoom: ptz.zoom || t.zoom,
                      lat: ptz.lat || t.lat,
                      lng: ptz.lng || t.lng
                    }
                  : t;
              })
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const assign = useCallback(
    (id: string, assignee: string, by: string) =>
      patch(id, (t) => {
        if (t.assignee === assignee) return t
        const text = t.assignee ? `Reassigned from ${t.assignee} to ${assignee}` : `Assigned to ${assignee}`
        const current = t.followers ?? []
        const followers = current.includes(assignee) ? current : [...current, assignee]
        return log({ ...t, assignee, followers }, by, text)
      }),
    [patch],
  )

  const toggleFollow = useCallback(
    (id: string, person: string) =>
      patch(id, (t) => {
        const current = t.followers ?? []
        const following = current.includes(person)
        const followers = following ? current.filter((f) => f !== person) : [...current, person]
        return log({ ...t, followers }, person, following ? 'Stopped following this ticket' : 'Started following this ticket')
      }),
    [patch],
  )

  const addFollowers = useCallback(
    (id: string, people: string[], by: string) =>
      patch(id, (t) => {
        const current = t.followers ?? []
        const added = people.filter((p) => !current.includes(p))
        if (added.length === 0) return t
        return log(
          { ...t, followers: [...current, ...added] },
          by,
          `Added ${added.join(', ')} as ${added.length > 1 ? 'watchers' : 'a watcher'}`,
        )
      }),
    [patch],
  )

  const shareWith = useCallback(
    (id: string, person: string, by: string) =>
      patch(id, (t) => {
        const current = t.followers ?? []
        const followers = current.includes(person) ? current : [...current, person]
        return log({ ...t, followers }, by, `Shared this ticket with ${person}`)
      }),
    [patch],
  )

  const removeFollower = useCallback(
    (id: string, person: string, by: string) =>
      patch(id, (t) => log({ ...t, followers: (t.followers ?? []).filter((f) => f !== person) }, by, `Removed ${person} from watchers`)),
    [patch],
  )

  const updateDetails = useCallback(
    (id: string, next: { title: string; description: string; priority: Ticket['priority'] }, by: string) =>
      patch(id, (t) => {
        if (t.title === next.title && t.description === next.description && t.priority === next.priority) return t
        return log({ ...t, title: next.title, description: next.description, priority: next.priority }, by, 'Updated ticket details')
      }),
    [patch],
  )

  const addComment = useCallback(
    (id: string, text: string, by: string) =>
      patch(id, (t) => {
        const at = new Date().toISOString()
        return { ...t, updatedAt: at, comments: [...(t.comments ?? []), { at, by, text }] }
      }),
    [patch],
  )

  const transition = useCallback(
    (id: string, state: LifecycleState, { by, notes, snapshot }: TransitionInput) =>
      patch(id, (t) => {
        const at = new Date().toISOString()
        const status = STATE_RESULT[state]
        const completing = state === 'done'
        const next: Ticket = {
          ...t,
          status,
          updatedAt: at,
          completedAt: completing ? at : state === 'reopened' ? undefined : t.completedAt,
          completion: completing
            ? { by, at, notes: notes?.trim() || 'Work completed and verified on the live camera.' }
            : state === 'reopened'
              ? undefined
              : t.completion,
          snapshots: snapshot ? { ...t.snapshots, after: snapshot } : state === 'reopened' ? { before: t.snapshots.before } : t.snapshots,
        }
        const detail = state === 'reopened' ? 'Ticket reopened for further work' : `Moved to ${LIFECYCLE_LABEL[state]}`
        const withSnapshot = snapshot ? `${detail} · completion snapshot captured` : detail
        return log(next, by, withSnapshot, state)
      }),
    [patch],
  )

  const attachSnapshot = useCallback(
    (id: string, slot: 'before' | 'after', snapshot: Snapshot) =>
      patch(id, (t) => ({ ...t, snapshots: { ...t.snapshots, [slot]: snapshot } })),
    [patch],
  )

  const value = useMemo(
    () => ({ tickets, addTicket, assign, toggleFollow, addFollowers, shareWith, removeFollower, addComment, updateDetails, transition, attachSnapshot }),
    [tickets, addTicket, assign, toggleFollow, addFollowers, shareWith, removeFollower, addComment, updateDetails, transition, attachSnapshot],
  )

  return <TicketsContext.Provider value={value}>{children}</TicketsContext.Provider>
}

export function useTickets() {
  const ctx = useContext(TicketsContext)
  if (!ctx) throw new Error('useTickets must be used within TicketsProvider')
  return ctx
}
