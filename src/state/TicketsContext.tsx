import { createContext, useCallback, useContext, useMemo, useState, useEffect, useRef, type ReactNode } from 'react'
import { supabase } from '../supabaseClient'
import { ALL_DEVICES } from '../data/cameras'
import {
  DEFAULT_SNAPSHOT_CONFIG,
  SEED_TICKETS,
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
  const normalizedCameraName = cameraName.toLowerCase().replace(/[^a-z0-9]/g, '')
  const camera = ALL_DEVICES.find((device) =>
    device.id === cameraName
    || device.name === cameraName
    || device.id.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedCameraName
    || device.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedCameraName,
  )
  if (camera) return camera

  const fallbackCamera = ALL_DEVICES.find((device) => device.id === 'ellis-360')
  if (!fallbackCamera) throw new Error('Fallback camera profile ellis-360 is not configured')
  return fallbackCamera
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function snapshotFromDatabase(value: unknown): Snapshot | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const snapshot = value as DatabaseRow
  if (typeof snapshot.src !== 'string' || typeof snapshot.at !== 'string' || typeof snapshot.by !== 'string') return undefined
  return {
    src: snapshot.src,
    at: snapshot.at,
    by: snapshot.by,
    yaw: numberValue(snapshot.yaw, 0),
    pitch: numberValue(snapshot.pitch, 0),
  }
}

function databaseRowForTicket(ticket: Ticket, includeIdentity = false): DatabaseRow {
  return {
    ...(includeIdentity ? { id: ticket.id, ticket_id: ticket.id, created_at: ticket.createdAt } : {}),
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority,
    status: ticket.status === 'open' ? 'to do' : ticket.status,
    reporter: ticket.creator,
    assignee: ticket.assignee || 'Unassigned',
    camera_name: ticket.cameraId,
    ptz_coordinates: {
      yaw: ticket.yaw,
      pitch: ticket.pitch,
      zoom: ticket.zoom,
      distanceM: ticket.distanceM,
      lat: ticket.lat,
      lng: ticket.lng,
      metadata: {
        type: ticket.type,
        zone: ticket.zone,
        platform: ticket.platform,
        platformName: ticket.platformName,
        followers: ticket.followers,
        snapshots: ticket.snapshots,
        snapshotConfig: ticket.snapshotConfig,
        completedAt: ticket.completedAt,
        completion: ticket.completion,
      },
    },
    history_log: ticket.timeline,
    replies: ticket.comments,
    updated_at: ticket.updatedAt,
  }
}

function seedTicketPool(): Ticket[] {
  const archiveIndexes = new Map([[3, 31], [5, 32], [6, 33]])
  return SEED_TICKETS.slice(0, 9).map((ticket, index) => {
    const ageDays = archiveIndexes.get(index)
    if (!ageDays) return ticket
    const createdAt = new Date(Date.now() - ageDays * 86_400_000).toISOString()
    const timeShift = new Date(createdAt).getTime() - new Date(ticket.createdAt).getTime()
    const shiftDate = (at: string) => new Date(new Date(at).getTime() + timeShift).toISOString()
    return {
      ...ticket,
      createdAt,
      updatedAt: shiftDate(ticket.updatedAt),
      timeline: ticket.timeline.map((event) => ({ ...event, at: shiftDate(event.at) })),
      comments: ticket.comments.map((comment) => ({ ...comment, at: shiftDate(comment.at) })),
      completedAt: ticket.completedAt ? shiftDate(ticket.completedAt) : undefined,
      completion: ticket.completion ? { ...ticket.completion, at: shiftDate(ticket.completion.at) } : undefined,
    }
  })
}

function ticketFromDatabase(value: unknown): Ticket {
  const row = asDatabaseRow(value)
  const ptz = typeof row.ptz_coordinates === 'object' && row.ptz_coordinates !== null
    ? row.ptz_coordinates as DatabaseRow
    : {}
  const metadata = typeof ptz.metadata === 'object' && ptz.metadata !== null
    ? ptz.metadata as DatabaseRow
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

  const id = stringValue(row.ticket_id, stringValue(row.id, ''))
  if (!id) throw new Error('Supabase ticket row is missing both ticket_id and id')

  const rawType = row.type ?? metadata.type
  const validTypes: Ticket['type'][] = ['intrusion', 'loitering', 'tamper', 'camera_fault', 'vehicle', 'crowd', 'maintenance']
  const rawPlatform = row.platform ?? metadata.platform
  const platform: Ticket['platform'] = rawPlatform === 'client' || rawPlatform === 'custom' ? rawPlatform : 'default'
  const snapshotConfig = typeof (row.snapshot_config ?? metadata.snapshotConfig) === 'object'
    && (row.snapshot_config ?? metadata.snapshotConfig) !== null
    ? (row.snapshot_config ?? metadata.snapshotConfig) as DatabaseRow
    : {}
  const completionValue = row.completion ?? metadata.completion
  const completion = typeof completionValue === 'object' && completionValue !== null
    ? completionValue as DatabaseRow
    : null
  const snapshotsValue = typeof metadata.snapshots === 'object' && metadata.snapshots !== null
    ? metadata.snapshots as DatabaseRow
    : {}

  return {
    id,
    title: stringValue(row.title, 'Untitled ticket'),
    description: stringValue(row.description, ''),
    status,
    priority: rawPriority === 'meduim' || rawPriority === 'medium' ? 'medium' : priority,
    type: validTypes.find((candidate) => candidate === rawType) ?? 'intrusion',
    cameraId: camera.id,
    siteId: camera.siteId,
    zone: stringValue(row.zone, stringValue(metadata.zone, 'Perimeter')),
    assignee: stringValue(row.assignee, ''),
    creator: stringValue(row.reporter, 'System'),
    platform,
    platformName: typeof row.platform_name === 'string'
      ? row.platform_name
      : typeof metadata.platformName === 'string' ? metadata.platformName : undefined,
    followers: Array.isArray(row.followers) ? stringArray(row.followers) : stringArray(metadata.followers),
    comments,
    createdAt,
    updatedAt: stringValue(row.updated_at, createdAt),
    completedAt: typeof row.completed_at === 'string'
      ? row.completed_at
      : typeof metadata.completedAt === 'string' ? metadata.completedAt : undefined,
    completion: completion
      ? {
          by: stringValue(completion.by, 'System'),
          at: stringValue(completion.at, createdAt),
          notes: stringValue(completion.notes, ''),
        }
      : undefined,
    snapshots: {
      before: snapshotFromDatabase(snapshotsValue.before),
      after: snapshotFromDatabase(snapshotsValue.after),
    },
    snapshotConfig: {
      captureCreation: snapshotConfig.captureCreation === false ? false : DEFAULT_SNAPSHOT_CONFIG.captureCreation,
      captureCompletion: snapshotConfig.captureCompletion === false ? false : DEFAULT_SNAPSHOT_CONFIG.captureCompletion,
      showInImprovementHistory: true,
    },
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
  const ticketsRef = useRef<Ticket[]>([])

  useEffect(() => {
    ticketsRef.current = tickets
  }, [tickets])

  const persistTicket = useCallback(async (ticket: Ticket) => {
    const update = databaseRowForTicket(ticket)
    const { data, error } = await supabase
      .from('tickets')
      .update(update)
      .eq('id', ticket.id)
      .select('id')
    if (error) {
      console.error(`Supabase ticket update error for ${ticket.id}:`, error.message)
      return
    }
    if (data?.length) return

    const fallbackUpdate = await supabase
      .from('tickets')
      .update(update)
      .eq('ticket_id', ticket.id)
      .select('id')
    if (fallbackUpdate.error) {
      console.error(`Supabase ticket update error for ${ticket.id}:`, fallbackUpdate.error.message)
    } else if (!fallbackUpdate.data?.length) {
      console.error(`Supabase ticket update matched no row for ${ticket.id}`)
    }
  }, [])

  // 1. READ PIPELINE - REBUILDS EXPLICIT MANDATORY SCHEMAS FOR INNER UI CONSUMERS
  useEffect(() => {
    async function loadInitialTickets() {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Supabase ticket fetch error:', error.message)
        return
      }

      const rows = data ?? []
      const fetchedTickets: Ticket[] = []
      for (const row of rows) {
        try {
          fetchedTickets.push(ticketFromDatabase(row))
        } catch (mappingError) {
          console.error('Unable to map Supabase ticket row:', mappingError)
        }
      }

      if (rows.length === 0) {
        const seedTickets = seedTicketPool()
        ticketsRef.current = seedTickets
        setTickets(seedTickets)
        const { error: seedError } = await supabase
          .from('tickets')
          .upsert(seedTickets.map((ticket) => databaseRowForTicket(ticket, true)), { onConflict: 'id', ignoreDuplicates: true })
        if (seedError) {
          console.error('Supabase ticket seed error:', seedError.message)
          return
        }

        const { data: seededRows, error: seededFetchError } = await supabase
          .from('tickets')
          .select('*')
          .order('created_at', { ascending: false })
        if (seededFetchError) {
          console.error('Supabase seeded ticket fetch error:', seededFetchError.message)
          return
        }
        for (const row of seededRows ?? []) {
          try {
            fetchedTickets.push(ticketFromDatabase(row))
          } catch (mappingError) {
            console.error('Unable to map seeded Supabase ticket row:', mappingError)
          }
        }
      }

      setTickets((previous) => {
        const merged = new Map(previous.map((ticket) => [ticket.id, ticket]))
        for (const ticket of fetchedTickets) merged.set(ticket.id, ticket)
        const next = [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        ticketsRef.current = next
        return next
      })
    }
    void loadInitialTickets()
  }, [])

  const patch = useCallback((id: string, fn: (ticket: Ticket) => Ticket) => {
    const current = ticketsRef.current.find((ticket) => ticket.id === id)
    if (!current) return
    const updated = fn(current)
    const next = ticketsRef.current.map((ticket) => ticket.id === id ? updated : ticket)
    ticketsRef.current = next
    setTickets(next)
    void persistTicket(updated)
  }, [persistTicket])

  const log = (t: Ticket, by: string, text: string, state?: LifecycleState): Ticket => {
    const at = new Date().toISOString()
    return { ...t, updatedAt: at, timeline: [...(t.timeline ?? []), { at, by, text, state }] }
  }

  // 2. CREATE TICKET ACTION - FORCES UNIQUE TIME ID FORMATS TO PREVENT OVERWRITES
  const addTicket = useCallback((input: NewTicketInput) => {
    const createdAtMs = Date.now()
    const uniqueId = `OE-${createdAtMs.toString().slice(-6)}-${crypto.randomUUID()}`
    const ticket = createTicket(input, uniqueId)

    ticketsRef.current = [ticket, ...ticketsRef.current]
    setTickets(ticketsRef.current)
    void supabase
      .from('tickets')
      .insert(databaseRowForTicket(ticket, true))
      .then(({ error }) => {
        if (error) console.error(`Supabase ticket insert error for ${ticket.id}:`, error.message)
      })
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
          const { eventType, new: newRow, old: oldRow } = payload as { eventType: string; new: unknown; old: unknown }
          try {
            if (eventType === 'INSERT') {
              const freshTicket = ticketFromDatabase(newRow)
              setTickets((previous) => {
                const next = previous.some((ticket) => ticket.id === freshTicket.id)
                  ? previous
                  : [freshTicket, ...previous]
                ticketsRef.current = next
                return next
              })
            } else if (eventType === 'UPDATE') {
              const updatedTicket = ticketFromDatabase(newRow)
              const rawRow = asDatabaseRow(newRow)
              const rawCoordinates = typeof rawRow.ptz_coordinates === 'object' && rawRow.ptz_coordinates !== null
                ? rawRow.ptz_coordinates as DatabaseRow
                : {}
              const hasMetadata = typeof rawCoordinates.metadata === 'object' && rawCoordinates.metadata !== null
              setTickets((previous) => {
                const next = previous.map((ticket) => ticket.id === updatedTicket.id
                  ? {
                      ...ticket,
                      ...updatedTicket,
                      followers: hasMetadata ? updatedTicket.followers : ticket.followers,
                      snapshots: hasMetadata ? updatedTicket.snapshots : ticket.snapshots,
                      snapshotConfig: hasMetadata ? updatedTicket.snapshotConfig : ticket.snapshotConfig,
                    }
                  : ticket)
                ticketsRef.current = next
                return next
              })
            } else if (eventType === 'DELETE') {
              const deletedRow = asDatabaseRow(oldRow)
              const deletedId = stringValue(deletedRow.ticket_id, stringValue(deletedRow.id, ''))
              setTickets((previous) => {
                const next = previous.filter((ticket) => ticket.id !== deletedId)
                ticketsRef.current = next
                return next
              })
            }
          } catch (mappingError) {
            console.error(`Unable to process Supabase ${eventType} ticket event:`, mappingError)
          }
        }
      )
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Supabase ticket realtime subscription error:', error?.message ?? status)
        }
      })

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // UI STATE MUTATION PIPELINES WITH ACTIVE PARAMETER REFACTORING FOR COMPILER SANITY
  const assign = useCallback((id: string, assignee: string, by: string) => patch(id, (ticket) => log({ ...ticket, assignee }, by, `Assigned to ${assignee}`)), [patch])
  const toggleFollow = useCallback((id: string, person: string) => patch(id, (ticket) => {
    const followers = ticket.followers.includes(person)
      ? ticket.followers.filter((follower) => follower !== person)
      : [...ticket.followers, person]
    return log({ ...ticket, followers }, person, followers.includes(person) ? 'Started following ticket' : 'Stopped following ticket')
  }), [patch])
  
  const addFollowers = useCallback((id: string, people: string[], by: string) => patch(id, (ticket) => {
    return log({ ...ticket, followers: [...new Set([...ticket.followers, ...people])] }, by, 'Added followers')
  }), [patch])

  const shareWith = useCallback((id: string, person: string, by: string) => patch(id, (ticket) => {
    return log({ ...ticket, followers: [...new Set([...ticket.followers, person])] }, by, 'Shared ticket')
  }), [patch])

  const removeFollower = useCallback((id: string, person: string, by: string) => patch(id, (ticket) => {
    return log({ ...ticket, followers: ticket.followers.filter((follower) => follower !== person) }, by, 'Removed follower')
  }), [patch])

  const updateDetails = useCallback((id: string, next: { title: string; description: string; priority: Ticket['priority'] }, by: string) => patch(id, (ticket) => log({ ...ticket, ...next }, by, 'Updated details')), [patch])
  const addComment = useCallback((id: string, text: string, by: string) => patch(id, (ticket) => {
    const at = new Date().toISOString()
    return { ...ticket, updatedAt: at, comments: [...ticket.comments, { at, by, text }] }
  }), [patch])
  const transition = useCallback((id: string, state: LifecycleState, input: TransitionInput) => patch(id, (ticket) => {
    const at = new Date().toISOString()
    return {
      ...ticket,
      status: STATE_RESULT[state],
      updatedAt: at,
      ...(state === 'done'
        ? {
            completedAt: at,
            completion: { by: input.by, at, notes: input.notes ?? '' },
            snapshots: input.snapshot ? { ...ticket.snapshots, after: input.snapshot } : ticket.snapshots,
          }
        : {}),
      timeline: [...ticket.timeline, { at, by: input.by, text: `Moved to ${state}`, state }],
    }
  }), [patch])

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
