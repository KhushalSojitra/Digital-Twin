import { createContext, useCallback, useContext, useMemo, useState, useEffect, useRef, type ReactNode } from 'react'
import { supabase } from '../supabaseClient'
import { ALL_DEVICES } from '../data/cameras'
import {
  DEFAULT_SNAPSHOT_CONFIG,
  STATE_RESULT,
  createEarthTicket,
  createTicket,
  isEarthInput,
  isTicketSource,
  locateOnEarth,
  nearestSiteId,
  sourceForDevice,
  type LifecycleState,
  type Snapshot,
  type Ticket,
  type TicketCreateInput,
} from '../data/tickets'

export interface TransitionInput {
  by: string
  notes?: string
  snapshot?: Snapshot
}

interface TicketsValue {
  tickets: Ticket[]
  addTicket: (input: TicketCreateInput) => Promise<Ticket>
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

function matchingCamera(value: unknown) {
  const cameraName = typeof value === 'string' ? value.trim() : ''
  const normalizedCameraName = cameraName.toLowerCase().replace(/[^a-z0-9]/g, '')
  return ALL_DEVICES.find((device) =>
    device.id === cameraName
    || device.name === cameraName
    || device.id.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedCameraName
    || device.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedCameraName,
  )
}

/** Rows saved before ticket sources existed point at a camera, or at an unknown name that falls back. */
function legacyCameraForRow(value: unknown) {
  const camera = matchingCamera(value)
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

function databaseStatus(status: Ticket['status']): string {
  if (status === 'open') return 'to do'
  if (status === 'in_progress') return 'in progress'
  return status
}

function databaseRowForTicket(ticket: Ticket, includeIdentity = false): DatabaseRow {
  return {
    ...(includeIdentity ? { id: ticket.id, ticket_id: ticket.id, created_at: ticket.createdAt } : {}),
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority,
    status: databaseStatus(ticket.status),
    reporter: ticket.creator,
    assignee: ticket.assignee || 'Unassigned',
    camera_name: ticket.cameraId ?? 'Earth',
    ptz_coordinates: {
      yaw: ticket.yaw,
      pitch: ticket.pitch,
      zoom: ticket.zoom,
      distanceM: ticket.distanceM,
      lat: ticket.lat,
      lng: ticket.lng,
      metadata: {
        source: ticket.source,
        cameraId: ticket.cameraId,
        cameraName: ticket.cameraName,
        siteId: ticket.siteId,
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
  }
}

function ticketFromDatabase(value: unknown): Ticket {
  const row = asDatabaseRow(value)
  const ptz = typeof row.ptz_coordinates === 'object' && row.ptz_coordinates !== null
    ? row.ptz_coordinates as DatabaseRow
    : {}
  const metadata = typeof ptz.metadata === 'object' && ptz.metadata !== null
    ? ptz.metadata as DatabaseRow
    : {}
  const storedSource = isTicketSource(metadata.source) ? metadata.source : null
  const isEarth = storedSource === 'EARTH'
  const matchedCamera = matchingCamera(metadata.cameraId ?? row.camera_name)
  const camera = isEarth ? null : (matchedCamera ?? (storedSource ? null : legacyCameraForRow(row.camera_name)))
  const source = storedSource ?? sourceForDevice(camera ?? { kind: '360' })
  const cameraId = isEarth ? null : (camera?.id ?? (stringValue(metadata.cameraId, '') || null))
  const cameraName = isEarth ? null : (camera?.name ?? (stringValue(metadata.cameraName, '') || null))
  const createdAt = stringValue(row.created_at, new Date().toISOString())
  const yaw = numberValue(ptz.yaw, 0)
  const pitch = numberValue(ptz.pitch, 0)
  const zoom = numberValue(ptz.zoom, 1)
  const distanceM = numberValue(ptz.distanceM, isEarth ? 0 : 35)
  const storedLat = numberValue(ptz.lat, 0)
  const storedLng = numberValue(ptz.lng, 0)
  const earthCoords = camera ? locateOnEarth(camera.siteId, yaw, distanceM) : { lat: 0, lng: 0 }
  const lat = isEarth ? storedLat : (earthCoords.lat || storedLat)
  const lng = isEarth ? storedLng : (earthCoords.lng || storedLng)
  const siteId = camera?.siteId ?? (typeof metadata.siteId === 'string' ? metadata.siteId : nearestSiteId(lat, lng))

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
    source,
    cameraId,
    cameraName,
    siteId,
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
    updatedAt: createdAt,
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
    lat,
    lng,
  }
}

export function TicketsProvider({ children }: { children: ReactNode }) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const ticketsRef = useRef<Ticket[]>([])
  const writeQueues = useRef(new Map<string, Promise<void>>())

  useEffect(() => {
    ticketsRef.current = tickets
  }, [tickets])

  const persistTicket = useCallback(async (ticket: Ticket): Promise<Ticket> => {
    const update = databaseRowForTicket(ticket)
    const { data, error } = await supabase
      .from('tickets')
      .update(update)
      .eq('id', ticket.id)
      .select('*')
    if (error) {
      throw new Error(`Supabase ticket update error for ${ticket.id}: ${error.message}`)
    }
    if (data?.[0]) return ticketFromDatabase(data[0])

    const fallbackUpdate = await supabase
      .from('tickets')
      .update(update)
      .eq('ticket_id', ticket.id)
      .select('*')
    if (fallbackUpdate.error) {
      throw new Error(`Supabase ticket update error for ${ticket.id}: ${fallbackUpdate.error.message}`)
    }
    if (!fallbackUpdate.data?.[0]) throw new Error(`Supabase ticket update matched no row for ${ticket.id}`)
    return ticketFromDatabase(fallbackUpdate.data[0])
  }, [])

  const patch = useCallback((id: string, fn: (ticket: Ticket) => Ticket) => {
    const current = ticketsRef.current.find((ticket) => ticket.id === id)
    if (!current) return
    const updated = fn(current)
    const next = ticketsRef.current.map((ticket) => ticket.id === id ? updated : ticket)
    ticketsRef.current = next
    setTickets(next)
    const previousWrite = writeQueues.current.get(id) ?? Promise.resolve()
    const write = previousWrite.catch(() => undefined).then(async () => {
      try {
        const saved = await persistTicket(updated)
        if (ticketsRef.current.find((ticket) => ticket.id === id) !== updated) return
        const persistedTickets = ticketsRef.current.map((ticket) => ticket.id === id ? saved : ticket)
        ticketsRef.current = persistedTickets
        setTickets(persistedTickets)
      } catch (error) {
        console.error(`Unable to save ticket ${id}:`, error)
        if (ticketsRef.current.find((ticket) => ticket.id === id) !== updated) return
        const restored = ticketsRef.current.map((ticket) => ticket.id === id ? current : ticket)
        ticketsRef.current = restored
        setTickets(restored)
      }
    })
    writeQueues.current.set(id, write)
    void write.finally(() => {
      if (writeQueues.current.get(id) === write) writeQueues.current.delete(id)
    })
  }, [persistTicket])

  const log = (t: Ticket, by: string, text: string, state?: LifecycleState): Ticket => {
    const at = new Date().toISOString()
    return { ...t, updatedAt: at, timeline: [...(t.timeline ?? []), { at, by, text, state }] }
  }

  // 2. CREATE TICKET ACTION
  const addTicket = useCallback(async (input: TicketCreateInput) => {
    const createdAtMs = Date.now()
    const uniqueId = `OE-${createdAtMs.toString().slice(-6)}-${crypto.randomUUID()}`
    const ticket = isEarthInput(input) ? createEarthTicket(input, uniqueId) : createTicket(input, uniqueId)

    const { data, error } = await supabase
      .from('tickets')
      .insert(databaseRowForTicket(ticket, true))
      .select('*')
      .single()
    if (error) throw new Error(`Supabase ticket insert error for ${ticket.id}: ${error.message}`)

    const savedTicket = ticketFromDatabase(data)
    const next = [savedTicket, ...ticketsRef.current.filter((existing) => existing.id !== savedTicket.id)]
    ticketsRef.current = next
    setTickets(next)
    return savedTicket
  }, [])

  const deleteTicket = useCallback((id: string) => {
    void (async () => {
      try {
        let result = await supabase.from('tickets').delete().eq('id', id).select('id')
        if (!result.error && !result.data?.length) {
          result = await supabase.from('tickets').delete().eq('ticket_id', id).select('id')
        }
        if (result.error) {
          console.error(`Supabase ticket delete error for ${id}:`, result.error.message)
          return
        }
        if (!result.data?.length) {
          console.error(`Supabase ticket delete matched no row for ${id}`)
          return
        }
        const next = ticketsRef.current.filter((ticket) => ticket.id !== id)
        ticketsRef.current = next
        setTickets(next)
      } catch (error) {
        console.error(`Unable to delete ticket ${id}:`, error)
      }
    })()
  }, [])
  // 3. READ AND REALTIME SYNC
  useEffect(() => {
    let active = true
    const loadInitialTickets = async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Supabase ticket fetch error:', error.message)
        return
      }
      if (!active) return

      const fetchedTickets: Ticket[] = []
      for (const row of data ?? []) {
        try {
          fetchedTickets.push(ticketFromDatabase(row))
        } catch (mappingError) {
          console.error('Unable to map Supabase ticket row:', mappingError)
        }
      }

      setTickets((previous) => {
        const merged = new Map(previous.map((ticket) => [ticket.id, ticket]))
        for (const ticket of fetchedTickets) {
          const current = merged.get(ticket.id)
          if (!current || Date.parse(ticket.updatedAt) > Date.parse(current.updatedAt)) {
            merged.set(ticket.id, ticket)
          }
        }
        const next = [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        ticketsRef.current = next
        return next
      })
    }

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
        if (status === 'SUBSCRIBED') {
          void loadInitialTickets()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Supabase ticket realtime subscription error:', error?.message ?? status)
        }
      })

    return () => {
      active = false
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
    return log({ ...ticket, comments: [...ticket.comments, { at, by, text }] }, by, 'Added a comment')
  }), [patch])
  const transition = useCallback((id: string, state: LifecycleState, input: TransitionInput) => {
    if (!ticketsRef.current.some((ticket) => ticket.id === id)) return
    const toState = databaseStatus(STATE_RESULT[state])
    const previousWrite = writeQueues.current.get(id) ?? Promise.resolve()
    const write = previousWrite.catch(() => undefined).then(async () => {
      try {
        const { data, error } = await supabase.rpc('change_ticket_state', {
          p_ticket_id: id,
          p_to_state: toState,
          p_changed_by: input.by,
        })
        if (error) throw new Error(`change_ticket_state failed for ${id}: ${error.message}`)
        const saved = ticketFromDatabase(Array.isArray(data) ? data[0] : data)
        const next = ticketsRef.current.map((ticket) => ticket.id === id ? saved : ticket)
        ticketsRef.current = next
        setTickets(next)
      } catch (error) {
        console.error(`Unable to change state of ticket ${id}:`, error)
      }
    })
    writeQueues.current.set(id, write)
    void write.finally(() => {
      if (writeQueues.current.get(id) === write) writeQueues.current.delete(id)
    })
  }, [])

  const attachSnapshot = useCallback((id: string, slot: 'before' | 'after', snapshot: Snapshot) => patch(id, (ticket) => {
    const freshSnaps = { ...ticket.snapshots, [slot]: snapshot }
    return log({ ...ticket, snapshots: freshSnaps }, snapshot.by, `Attached ${slot} snapshot`)
  }), [patch]);

  const value = useMemo(
    () => ({ tickets, addTicket, deleteTicket, assign, toggleFollow, addFollowers, shareWith, removeFollower, addComment, updateDetails, transition, attachSnapshot }),
    [tickets, addTicket, deleteTicket, assign, toggleFollow, addFollowers, shareWith, removeFollower, addComment, updateDetails, transition, attachSnapshot],
  )

  return <TicketsContext.Provider value={value}>{children}</TicketsContext.Provider>
}

export function useTickets() {
  const ctx = useContext(TicketsContext)
  if (!ctx) throw new Error('useTickets must be used within TicketsProvider')
  return ctx
}
