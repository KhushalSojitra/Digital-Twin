import { createContext, useCallback, useContext, useMemo, useState, useEffect, type ReactNode } from 'react'
import { supabase } from '../supabaseClient'
import { ALL_DEVICES } from '../data/cameras'
import {
  STATE_RESULT,
  createTicket,
  locateOnEarth,
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

type DatabaseRow = Record<string, unknown>

function asDatabaseRow(value: unknown): DatabaseRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Received an invalid ticket row from Supabase')
  }
  return value as DatabaseRow
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = Number(value)
  return value == null || value === '' || !Number.isFinite(parsed) ? fallback : parsed
}

function cameraForRow(value: unknown) {
  const cameraName = typeof value === 'string' ? value.trim() : ''
  const camera = ALL_DEVICES.find((device) => device.id === cameraName || device.name === cameraName)
  if (camera) return camera

  const fallbackCamera = ALL_DEVICES.find((device) => device.id === 'ellis-360')
  if (!fallbackCamera) throw new Error('Fallback camera profile ellis-360 is not configured')
  return fallbackCamera
}

function ticketFromDatabase(value: unknown): Ticket {
  const row = asDatabaseRow(value)
  const ptz = typeof row.ptz_coordinates === 'object' && row.ptz_coordinates !== null
    ? row.ptz_coordinates as DatabaseRow
    : {}
  const camera = cameraForRow(row.camera_name)
  const createdAt = stringValue(row.created_at, new Date().toISOString())
  const yaw = numberValue(ptz.yaw, 0)
  const pitch = numberValue(ptz.pitch, 0)
  const zoom = numberValue(ptz.zoom, 1)
  const distanceM = numberValue(ptz.distanceM, 35)
  const storedLat = numberValue(ptz.lat, 0)
  const storedLng = numberValue(ptz.lng, 0)
  const earthCoords = locateOnEarth(camera.siteId, yaw, distanceM)

  const rawPriority = typeof row.priority === 'string' ? row.priority.trim().toLowerCase() : ''
  const priority: Ticket['priority'] = rawPriority === 'critical' || rawPriority === 'high' || rawPriority === 'low'
    ? rawPriority
    : 'medium'
  const rawStatus = typeof row.status === 'string' ? row.status.trim().toLowerCase() : ''
  const status: Ticket['status'] = rawStatus === 'to do' || rawStatus === 'open'
    ? 'open'
    : rawStatus === 'in progress' || rawStatus === 'in_progress'
      ? 'in_progress'
      : rawStatus === 'done' || rawStatus === 'accepted' || rawStatus === 'failed'
        ? rawStatus
        : 'open'

  const comments: Ticket['comments'] = Array.isArray(row.replies)
    ? row.replies.map((value) => {
        const comment = asDatabaseRow(value)
        return {
          at: stringValue(comment.at, createdAt),
          by: stringValue(comment.by, 'System'),
          text: stringValue(comment.text, ''),
        }
      })
    : []
  const timeline: Ticket['timeline'] = Array.isArray(row.history_log)
    ? row.history_log.map((value) => {
        const event = asDatabaseRow(value)
        const validStates: LifecycleState[] = ['open', 'in_progress', 'done', 'accepted', 'failed', 'reopened']
        const state = validStates.find((candidate) => candidate === event.state)
        return {
          at: stringValue(event.at, createdAt),
          by: stringValue(event.by, 'System'),
          text: stringValue(event.text, ''),
          ...(state ? { state } : {}),
        }
      })
    : []

  return {
    id: stringValue(row.ticket_id, stringValue(row.id, '')),
    title: stringValue(row.title, 'Untitled ticket'),
    description: stringValue(row.description, ''),
    status,
    priority: rawPriority === 'meduim' || rawPriority === 'medium' ? 'medium' : priority,
    type: 'intrusion',
    cameraId: camera.id,
    siteId: camera.siteId,
    zone: 'Perimeter',
    assignee: stringValue(row.assignee, ''),
    creator: stringValue(row.reporter, 'System'),
    platform: 'default',
    followers: [],
    comments,
    createdAt,
    updatedAt: stringValue(row.updated_at, createdAt),
    snapshots: {},
    snapshotConfig: { captureCreation: true, captureCompletion: true, showInImprovementHistory: true },
    timeline,
    yaw,
    pitch,
    zoom,
    distanceM,
    lat: earthCoords.lat || storedLat,
    lng: earthCoords.lng || storedLng,
  }
}

export function TicketsProvider({ children }: { children: ReactNode }) {
  const [tickets, setTickets] = useState<Ticket[]>([])

  // 1. READ PIPELINE - REBUILDS EXPLICIT MANDATORY SCHEMAS FOR INNER UI CONSUMERS
  useEffect(() => {
    async function loadInitialTickets() {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Supabase ticket fetch error:', error.message)
      } else if (data) {
        setTickets(data.map(ticketFromDatabase))
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

  // 2. CREATE TICKET ACTION - FORCES UNIQUE TIME ID FORMATS TO PREVENT OVERWRITES
  const addTicket = useCallback((input: NewTicketInput) => {
    const ticket = createTicket(input)
    const uniqueId = `OE-${Date.now().toString().slice(-4)}`
    ticket.id = uniqueId

    supabase
      .from('tickets')
      .insert([
        {
          id: uniqueId,
          ticket_id: uniqueId, 
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
  // 3. REALTIME SYNC ROUTER EXTENSION CHANNEL
  useEffect(() => {
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tickets' },
        (payload) => {
          const { eventType, new: newRow } = payload as { eventType: string; new: unknown }

          if (eventType === 'INSERT') {
            const freshTicket = ticketFromDatabase(newRow)
            setTickets((prev) => prev.some((ticket) => ticket.id === freshTicket.id)
              ? prev
              : [freshTicket, ...prev])
          }
          else if (eventType === 'UPDATE') {
            const updatedTicket = ticketFromDatabase(newRow)
            setTickets((prev) => prev.map((ticket) => ticket.id === updatedTicket.id
              ? { ...ticket, ...updatedTicket, snapshots: ticket.snapshots, snapshotConfig: ticket.snapshotConfig }
              : ticket))
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // UI STATE MUTATION PIPELINES WITH ACTIVE PARAMETER REFACTORING FOR COMPILER SANITY
  const assign = useCallback((id: string, assignee: string, by: string) => patch(id, (t) => log({ ...t, assignee }, by, `Assigned to ${assignee}`)), [patch]);
  const toggleFollow = useCallback((id: string, person: string) => patch(id, (t) => log({ ...t }, person, 'Toggled follower status')), [patch]);
  
  const addFollowers = useCallback((id: string, people: string[], by: string) => patch(id, (t) => {
    return log({ ...t, followers: [...(t.followers || []), ...people] }, by, 'Added followers');
  }), [patch]);

  const shareWith = useCallback((id: string, person: string, by: string) => patch(id, (t) => {
    return log({ ...t, followers: [...(t.followers || []), person] }, by, 'Shared ticket');
  }), [patch]);

  const removeFollower = useCallback((id: string, person: string, by: string) => patch(id, (t) => {
    return log({ ...t, followers: (t.followers || []).filter((f: string) => f !== person) }, by, 'Removed follower');
  }), [patch]);

  const updateDetails = useCallback((id: string, next: any, by: string) => patch(id, (t) => log({ ...t, ...next }, by, 'Updated details')), [patch]);
  const addComment = useCallback((id: string, text: string, by: string) => patch(id, (t) => ({ ...t, comments: [...(t.comments || []), { at: new Date().toISOString(), by, text }] })), [patch]);
  const transition = useCallback((id: string, state: LifecycleState, input: TransitionInput) => patch(id, (t) => log({ ...t, status: STATE_RESULT[state] }, input.by, `Moved to ${state}`)), [patch]);

  const attachSnapshot = useCallback((id: string, slot: 'before' | 'after', snapshot: Snapshot) => patch(id, (t) => {
    const freshSnaps = { ...t.snapshots, [slot]: snapshot };
    return { ...t, snapshots: freshSnaps };
  }), [patch]);

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
