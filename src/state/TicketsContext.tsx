import { createContext, useCallback, useContext, useMemo, useState, useEffect, useRef, type ReactNode } from 'react'
import { supabase } from '../supabaseClient'
import { getDbToken, getDbTokenFailure } from '../dbToken'
import { useAuth } from '../auth/AuthContext'
import { userName } from '../auth/users'
import { postTicketAction, postTicketTypeAction, type TicketAction } from '../auth/authApi'
import { requestInboxRefresh } from '../data/inbox'
import { ALL_DEVICES } from '../data/cameras'
import {
  DEFAULT_SNAPSHOT_CONFIG,
  createEarthTicket,
  createTicket,
  isEarthInput,
  isTicketSource,
  locateOnEarth,
  nearestSiteId,
  sourceForDevice,
  type CommentAttachment,
  type LifecycleState,
  type PinView,
  type Snapshot,
  type Ticket,
  type TicketAdditional,
  type TicketCreateInput,
  type TicketLink,
} from '../data/tickets'

export interface WorkflowActionInput {
  by: string
  /** Required by actions that pass the work on to someone else. */
  assignee?: string
  note?: string
  /** Comment saved in the same database call as the action (both or neither). */
  comment?: { text: string; attachments?: CommentAttachment[]; replyTo?: string; mentions: string[] }
}

/** Optional threading data stored with a new comment inside tickets.replies. */
export interface CommentThreadInfo {
  id?: string
  replyTo?: string
  /** Display names of the people mentioned (stored as ids by the server). */
  mentions?: string[]
  /** Mentioned people who get a sub-task (checked in the sub-task popup). */
  subtaskFor?: string[]
}

export interface TicketDetailsPatch {
  title: string
  description: string
  priority: Ticket['priority']
  additional?: TicketAdditional
  /** Replaces the creation snapshot with its marked-up version. */
  creationSnapshot?: Snapshot
}

export type TicketsLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface TicketsValue {
  tickets: Ticket[]
  /** 'idle' while signed out; 'error' (with loadError) when the database could not be read. */
  loadStatus: TicketsLoadStatus
  loadError: string | null
  /** Reads the tickets again; used by the retry button after a failed load. */
  reloadTickets: () => void
  addTicket: (input: TicketCreateInput) => Promise<Ticket>
  deleteTicket: (id: string) => Promise<void>
  toggleFollow: (id: string, person: string) => void
  addFollowers: (id: string, people: string[], by?: string) => void
  shareWith: (id: string, person: string, by?: string) => void
  removeFollower: (id: string, person: string, by?: string) => void
  addComment: (id: string, text: string, by: string, attachments?: CommentAttachment[], thread?: CommentThreadInfo) => Promise<void>
  updateDetails: (id: string, patch: TicketDetailsPatch, by?: string) => Promise<void>
  /** Runs one action of the ticket's workflow; rejects with the server's reason when it is not allowed. */
  performAction: (id: string, actionId: string, input: WorkflowActionInput) => Promise<void>
  /** Moves a ticket to another ticket type's workflow; the server records the change in its audit trail. */
  changeTicketType: (id: string, typeKey: string, reason: string) => Promise<void>
  attachSnapshot: (id: string, slot: 'before' | 'after', snapshot: Snapshot) => void
  /** Before closing a main ticket: marks each open sub-task complete or discards it. */
  resolveSubtasks: (id: string, decisions: Record<string, 'complete' | 'discard'>) => Promise<void>
  /** Team tab "Change assignee" (main ticket: reporter or manager; sub-task: main reporter/assignee or manager). */
  changeAssignee: (id: string, assignee: string, note?: string) => Promise<void>
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

  const fallbackCamera = ALL_DEVICES.find((device) => device.id === 'construction-360')
  if (!fallbackCamera) throw new Error('Fallback camera profile construction-360 is not configured')
  return fallbackCamera
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function pinViewFromDatabase(value: unknown): PinView | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const view = value as DatabaseRow
  const yaw = Number(view.yaw)
  const pitch = Number(view.pitch)
  const fov = Number(view.fov)
  return [yaw, pitch, fov].every(Number.isFinite) ? { yaw, pitch, fov } : undefined
}

function snapshotFromDatabase(value: unknown): Snapshot | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const snapshot = value as DatabaseRow
  if (typeof snapshot.src !== 'string' || typeof snapshot.at !== 'string' || typeof snapshot.by !== 'string') return undefined
  return {
    src: snapshot.src,
    at: snapshot.at,
    by: userName(snapshot.by),
    yaw: numberValue(snapshot.yaw, 0),
    pitch: numberValue(snapshot.pitch, 0),
    ...(typeof snapshot.cameraId === 'string' ? { cameraId: snapshot.cameraId } : {}),
    ...(pinViewFromDatabase(snapshot.view) ? { view: pinViewFromDatabase(snapshot.view) } : {}),
    ...(typeof snapshot.original === 'string' ? { original: snapshot.original } : {}),
    ...(Array.isArray(snapshot.markup) ? { markup: snapshot.markup } : {}),
  }
}

/** Breached = the SLA job recorded a breach for the deadline the ticket still has (India time). */
function slaFromRow(row: DatabaseRow, additional: unknown): Pick<Ticket, 'slaBreached' | 'slaBreachedAt'> {
  const recorded = typeof row.sla_breach_deadline === 'string' ? Date.parse(row.sla_breach_deadline) : NaN
  if (Number.isNaN(recorded)) return {}
  const a = additional && typeof additional === 'object' ? (additional as DatabaseRow) : {}
  const date = typeof a.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.dueDate) ? a.dueDate : ''
  const time = typeof a.dueTime === 'string' && /^\d{2}:\d{2}$/.test(a.dueTime) ? a.dueTime : '23:59'
  const deadline = date ? Date.parse(`${date}T${time}:00+05:30`) : NaN
  if (deadline !== recorded) return {}
  return { slaBreached: true, slaBreachedAt: typeof row.sla_breached_at === 'string' ? row.sla_breached_at : undefined }
}

function additionalFromDatabase(value: unknown): Ticket['additional'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const data = value as DatabaseRow
  const links = Array.isArray(data.links)
    ? data.links.flatMap((entry) => {
        if (typeof entry !== 'object' || entry === null) return []
        const link = entry as DatabaseRow
        if (typeof link.id !== 'string') return []
        const relation: TicketLink['relation'] = link.relation === 'blocks' || link.relation === 'blocked_by' ? link.relation : ''
        return [{ id: link.id, title: stringValue(link.title, ''), relation }]
      })
    : []
  return {
    dueDate: typeof data.dueDate === 'string' ? data.dueDate : '',
    dueTime: typeof data.dueTime === 'string' ? data.dueTime : '',
    onBreach: typeof data.onBreach === 'string' ? data.onBreach : '',
    links,
    ...(Array.isArray(data.notifyUsers) ? { notifyUsers: data.notifyUsers.filter((v): v is string => typeof v === 'string') } : {}),
    ...(Array.isArray(data.notifyEmails) ? { notifyEmails: data.notifyEmails.filter((v): v is string => typeof v === 'string') } : {}),
  }
}

function attachmentsFromDatabase(value: unknown): CommentAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined
  const files = value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const file = entry as DatabaseRow
    if (typeof file.url !== 'string' || typeof file.name !== 'string') return []
    return [{ name: file.name, size: numberValue(file.size, 0), type: typeof file.type === 'string' ? file.type : '', url: file.url }]
  })
  return files.length ? files : undefined
}

function databaseStatus(status: Ticket['status']): string {
  if (status === 'open') return 'to do'
  if (status === 'in_progress') return 'in progress'
  return status
}

function databaseRowForTicket(ticket: Ticket, includeIdentity = false): DatabaseRow {
  return {
    // The status follows the workflow state and is only ever changed by the server, so it is sent on creation only.
    ...(includeIdentity ? { id: ticket.id, ticket_id: ticket.id, created_at: ticket.createdAt, status: databaseStatus(ticket.status) } : {}),
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority,
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
        pinView: ticket.pinView,
        followers: ticket.followers,
        snapshots: ticket.snapshots,
        snapshotConfig: ticket.snapshotConfig,
        completedAt: ticket.completedAt,
        completion: ticket.completion,
        additional: ticket.additional,
      },
    },
    history_log: ticket.timeline,
    replies: ticket.comments.map(({ replyTo, ...comment }) => (replyTo ? { ...comment, reply_to: replyTo } : comment)),
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
  const parentTicketId = typeof row.parent_ticket_id === 'string' && row.parent_ticket_id ? row.parent_ticket_id : undefined
  const storedSource = isTicketSource(metadata.source) ? metadata.source : parentTicketId ? 'EARTH' : null
  // Sub-tasks have no location: no camera, no map position.
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
          ...(typeof comment.id === 'string' && comment.id ? { id: comment.id } : {}),
          ...(typeof comment.reply_to === 'string' && comment.reply_to ? { replyTo: comment.reply_to } : {}),
          at: stringValue(comment.at, createdAt),
          by: userName(stringValue(comment.by, 'System')),
          ...(Array.isArray(comment.subtask_for) ? { subtaskFor: stringArray(comment.subtask_for).map(userName) } : {}),
          text: typeof comment.text === 'string' ? comment.text : '',
          ...(attachmentsFromDatabase(comment.attachments) ? { attachments: attachmentsFromDatabase(comment.attachments) } : {}),
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
          by: userName(stringValue(event.by, 'System')),
          text: stringValue(event.text, ''),
          ...(state ? { state } : {}),
          ...(state && typeof event.label === 'string' && event.label ? { label: event.label } : {}),
          ...(typeof event.comment === 'string' && event.comment.trim() ? { comment: event.comment.trim() } : {}),
        }
      })
    : []

  const id = stringValue(row.ticket_id, stringValue(row.id, ''))
  if (!id) throw new Error('Supabase ticket row is missing both ticket_id and id')

  const rawType = row.ticket_type_key ?? row.type ?? metadata.type
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
    ...(parentTicketId ? { parentTicketId } : {}),
    ...slaFromRow(row, metadata.additional),
    ...(typeof row.approval_worker === 'string' && row.approval_worker ? { approvalWorker: userName(row.approval_worker) } : {}),
    title: stringValue(row.title, 'Untitled ticket'),
    description: stringValue(row.description, ''),
    status,
    priority: rawPriority === 'meduim' || rawPriority === 'medium' ? 'medium' : priority,
    type: typeof rawType === 'string' && rawType.trim() ? rawType : 'intrusion',
    source,
    cameraId,
    cameraName,
    siteId,
    zone: stringValue(row.zone, stringValue(metadata.zone, 'Perimeter')),
    assignee: userName(stringValue(row.assignee, '')),
    creator: userName(stringValue(row.reporter, 'System')),
    workflowVersionId: typeof row.workflow_version_id === 'string' ? row.workflow_version_id : undefined,
    workflowState: typeof row.workflow_state === 'string' ? row.workflow_state : undefined,
    platform,
    platformName: typeof row.platform_name === 'string'
      ? row.platform_name
      : typeof metadata.platformName === 'string' ? metadata.platformName : undefined,
    followers: (Array.isArray(row.followers) ? stringArray(row.followers) : stringArray(metadata.followers)).map(userName),
    comments,
    createdAt,
    updatedAt: createdAt,
    completedAt: typeof row.completed_at === 'string'
      ? row.completed_at
      : typeof metadata.completedAt === 'string' ? metadata.completedAt : undefined,
    completion: completion
      ? {
          by: userName(stringValue(completion.by, 'System')),
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
    additional: additionalFromDatabase(metadata.additional),
    timeline,
    yaw,
    pitch,
    zoom,
    pinView: pinViewFromDatabase(metadata.pinView),
    distanceM,
    lat,
    lng,
  }
}

export function TicketsProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth()
  const userId = currentUser?.id ?? null
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loadStatus, setLoadStatus] = useState<TicketsLoadStatus>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const ticketsRef = useRef<Ticket[]>([])
  const savedWhileLoading = useRef(new Set<string>())
  const writeQueues = useRef(new Map<string, Promise<void>>())
  const reloadTickets = useCallback(() => setReloadNonce((nonce) => nonce + 1), [])

  useEffect(() => {
    ticketsRef.current = tickets
  }, [tickets])

  // Runs one server write per ticket at a time, in the order requested.
  const runForTicket = useCallback(<T,>(id: string, job: () => Promise<T>): Promise<T> => {
    const previousWrite = writeQueues.current.get(id) ?? Promise.resolve()
    const run = previousWrite.catch(() => undefined).then(job)
    const write = run.then(() => undefined, () => undefined)
    writeQueues.current.set(id, write)
    void write.finally(() => {
      if (writeQueues.current.get(id) === write) writeQueues.current.delete(id)
    })
    return run
  }, [])

  /** Stores the row the server returned (replacing the ticket if it is known, adding it otherwise). */
  const applySaved = useCallback((data: unknown): Ticket => {
    const saved = ticketFromDatabase(Array.isArray(data) ? data[0] : data)
    savedWhileLoading.current.add(saved.id)
    const exists = ticketsRef.current.some((ticket) => ticket.id === saved.id)
    const next = exists
      ? ticketsRef.current.map((ticket) => ticket.id === saved.id ? saved : ticket)
      : [saved, ...ticketsRef.current]
    ticketsRef.current = next
    setTickets(next)
    return saved
  }, [])

  const send = useCallback((id: string, body: TicketAction): void => {
    runForTicket(id, async () => applySaved(await postTicketAction(body)))
      .catch((error) => console.error(`Unable to save ticket ${id}:`, error))
  }, [runForTicket, applySaved])

  // 2. CREATE TICKET ACTION: the server creates the row (reporter, time and workflow are decided there).
  const addTicket = useCallback(async (input: TicketCreateInput) => {
    const createdAtMs = Date.now()
    const uniqueId = `OE-${createdAtMs.toString().slice(-6)}-${crypto.randomUUID()}`
    const ticket = isEarthInput(input) ? createEarthTicket(input, uniqueId) : createTicket(input, uniqueId)
    const row = databaseRowForTicket(ticket, true)
    const data = await postTicketAction({
      action: 'create',
      typeKey: ticket.type,
      ticket: {
        id: ticket.id,
        title: row.title,
        description: row.description,
        priority: row.priority,
        assignee: row.assignee,
        camera_name: row.camera_name,
        ptz_coordinates: row.ptz_coordinates,
      },
    })
    return applySaved(data)
  }, [applySaved])

  const deleteTicket = useCallback(async (id: string): Promise<void> => {
    await runForTicket(id, () => postTicketAction({ action: 'delete', ticketId: id }))
    const next = ticketsRef.current.filter((ticket) => ticket.id !== id)
    ticketsRef.current = next
    setTickets(next)
  }, [runForTicket])
  // 3. READ AND REALTIME SYNC
  // Tickets can only be read with the signed-in user's database token, so reading starts when a user is
  // signed in (not when the app first loads) and restarts when the account changes or the user retries.
  useEffect(() => {
    ticketsRef.current = []
    setTickets([])
    setLoadError(null)
    if (!userId) {
      setLoadStatus('idle')
      return
    }

    let active = true
    setLoadStatus('loading')

    const failLoad = (message: string) => {
      console.error('Supabase ticket fetch error:', message)
      setLoadError(message)
      setLoadStatus('error')
    }

    const loadTickets = async () => {
      savedWhileLoading.current.clear()
      const token = await getDbToken()
      if (!active) return
      if (!token) {
        failLoad(getDbTokenFailure() ?? 'Database access could not be authorised. Sign in again.')
        return
      }

      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false })
      if (!active) return
      if (error) {
        failLoad(error.message)
        return
      }

      const fetchedTickets: Ticket[] = []
      for (const row of data ?? []) {
        try {
          fetchedTickets.push(ticketFromDatabase(row))
        } catch (mappingError) {
          console.error('Unable to map Supabase ticket row:', mappingError)
        }
      }

      // Supabase is the source of truth. Replacing the collection removes rows deleted elsewhere; the only
      // local rows kept are tickets this browser saved while the read was in flight, so a new ticket is not lost.
      const fetchedIds = new Set(fetchedTickets.map((ticket) => ticket.id))
      const justSaved = ticketsRef.current.filter((ticket) => savedWhileLoading.current.has(ticket.id) && !fetchedIds.has(ticket.id))
      const next = [...fetchedTickets, ...justSaved].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      ticketsRef.current = next
      setTickets(next)
      setLoadError(null)
      setLoadStatus('ready')
    }

    // The read does not wait for realtime: a realtime failure must not hide tickets that are in the database.
    void loadTickets()

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
                const next = previous.map((ticket) => {
                  if (ticket.id !== updatedTicket.id) return ticket
                  // Realtime omits unchanged large columns, so a workflow action (which never touches
                  // ptz_coordinates) arrives without the stored source/location. Keep what the ticket was created with.
                  if (!hasMetadata) {
                    return {
                      ...ticket,
                      ...updatedTicket,
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
                      completion: ticket.completion,
                      additional: ticket.additional,
                      pinView: ticket.pinView,
                      yaw: ticket.yaw,
                      pitch: ticket.pitch,
                      zoom: ticket.zoom,
                      distanceM: ticket.distanceM,
                      lat: ticket.lat,
                      lng: ticket.lng,
                    }
                  }
                  return { ...ticket, ...updatedTicket }
                })
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
          // Closes the gap between the first read and the live feed starting.
          void loadTickets()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Supabase ticket realtime subscription error:', error?.message ?? status)
        }
      })

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [userId, reloadNonce])

  // Every change below is made by the server as the signed-in user; the browser has no write access to tickets.
  const toggleFollow = useCallback((id: string, person: string) => {
    send(id, { action: 'followers', ticketId: id, op: 'toggle', people: [person] })
  }, [send])
  const addFollowers = useCallback((id: string, people: string[]) => {
    send(id, { action: 'followers', ticketId: id, op: 'add', people })
  }, [send])
  const shareWith = useCallback((id: string, person: string) => {
    send(id, { action: 'followers', ticketId: id, op: 'share', people: [person] })
  }, [send])
  const removeFollower = useCallback((id: string, person: string) => {
    send(id, { action: 'followers', ticketId: id, op: 'remove', people: [person] })
  }, [send])
  // Reports success/failure to the caller so the edit form can show "Saved" or the error.
  const updateDetails = useCallback((id: string, next: TicketDetailsPatch): Promise<void> =>
    runForTicket(id, async () =>
      applySaved(await postTicketAction({
        action: 'details',
        ticketId: id,
        title: next.title,
        description: next.description,
        priority: next.priority,
        additional: next.additional ?? null,
        creationSnapshot: next.creationSnapshot ?? null,
      })),
    ).then(() => undefined, (error) => {
      console.error(`Unable to save ticket ${id}:`, error)
      throw error instanceof Error ? error : new Error('The ticket details could not be saved.')
    }), [runForTicket, applySaved])
  // Unlike the other writes, a comment reports its failure to the caller so the form can show the error.
  const addComment = useCallback((id: string, text: string, _by: string, attachments?: CommentAttachment[], thread?: CommentThreadInfo): Promise<void> =>
    runForTicket(id, async () => {
      applySaved(await postTicketAction({
        action: 'comment',
        ticketId: id,
        text,
        attachments: attachments ?? [],
        commentId: thread?.id ?? crypto.randomUUID(),
        ...(thread?.replyTo ? { replyTo: thread.replyTo } : {}),
        ...(thread?.mentions ? { mentions: thread.mentions } : {}),
        ...(thread?.subtaskFor?.length ? { subtaskFor: thread.subtaskFor } : {}),
      }))
      // New sub-tasks are separate ticket rows: pick them up.
      if (thread?.subtaskFor?.length) void reloadTickets()
      requestInboxRefresh()
    }).catch((error) => {
      console.error(`Unable to save comment on ticket ${id}:`, error)
      throw error instanceof Error ? error : new Error('The comment could not be saved.')
    }), [runForTicket, applySaved, reloadTickets])
  const performAction = useCallback((id: string, actionId: string, input: WorkflowActionInput): Promise<void> => {
    if (!ticketsRef.current.some((ticket) => ticket.id === id)) return Promise.reject(new Error('Ticket not found'))
    const previousWrite = writeQueues.current.get(id) ?? Promise.resolve()
    const run = previousWrite.catch(() => undefined).then(async () => {
      // The server runs the action as the signed-in user; the browser has no database permission for it.
      const data = await postTicketTypeAction({
        action: 'workflow',
        ticketId: id,
        actionId,
        assignee: input.assignee ?? null,
        note: input.note ?? null,
        comment: input.comment
          ? {
              text: input.comment.text,
              attachments: input.comment.attachments ?? [],
              commentId: crypto.randomUUID(),
              replyTo: input.comment.replyTo ?? null,
              mentions: input.comment.mentions,
            }
          : null,
      })
      const saved = ticketFromDatabase(Array.isArray(data) ? data[0] : data)
      const next = ticketsRef.current.map((ticket) => ticket.id === id ? saved : ticket)
      ticketsRef.current = next
      setTickets(next)
      requestInboxRefresh()
    })
    const write = run.catch((error) => console.error(`Unable to run action ${actionId} on ticket ${id}:`, error))
    writeQueues.current.set(id, write)
    void write.finally(() => {
      if (writeQueues.current.get(id) === write) writeQueues.current.delete(id)
    })
    return run
  }, [])

  const changeTicketType = useCallback((id: string, typeKey: string, reason: string): Promise<void> => {
    if (!ticketsRef.current.some((ticket) => ticket.id === id)) return Promise.reject(new Error('Ticket not found'))
    const previousWrite = writeQueues.current.get(id) ?? Promise.resolve()
    const run = previousWrite.catch(() => undefined).then(async () => {
      const data = await postTicketTypeAction({ action: 'change', ticketId: id, typeKey, reason })
      const saved = ticketFromDatabase(Array.isArray(data) ? data[0] : data)
      const next = ticketsRef.current.map((ticket) => ticket.id === id ? saved : ticket)
      ticketsRef.current = next
      setTickets(next)
    })
    const write = run.catch((error) => console.error(`Unable to change the type of ticket ${id}:`, error))
    writeQueues.current.set(id, write)
    void write.finally(() => {
      if (writeQueues.current.get(id) === write) writeQueues.current.delete(id)
    })
    return run
  }, [])

  const attachSnapshot = useCallback((id: string, slot: 'before' | 'after', snapshot: Snapshot) => {
    send(id, { action: 'snapshot', ticketId: id, slot, snapshot })
  }, [send])

  const resolveSubtasks = useCallback(async (id: string, decisions: Record<string, 'complete' | 'discard'>) => {
    await postTicketAction({ action: 'resolve_subtasks', ticketId: id, decisions })
    await reloadTickets()
  }, [reloadTickets])

  const changeAssignee = useCallback(async (id: string, assignee: string, note?: string) => {
    await postTicketAction({ action: 'change_assignee', ticketId: id, assignee, ...(note ? { note } : {}) })
    await reloadTickets()
  }, [reloadTickets])

  const value = useMemo(
    () => ({ changeAssignee, resolveSubtasks, tickets, loadStatus, loadError, reloadTickets, addTicket, deleteTicket, toggleFollow, addFollowers, shareWith, removeFollower, addComment, updateDetails, performAction, changeTicketType, attachSnapshot }),
    [changeAssignee, resolveSubtasks, tickets, loadStatus, loadError, reloadTickets, addTicket, deleteTicket, toggleFollow, addFollowers, shareWith, removeFollower, addComment, updateDetails, performAction, changeTicketType, attachSnapshot],
  )

  return <TicketsContext.Provider value={value}>{children}</TicketsContext.Provider>
}

export function useTickets() {
  const ctx = useContext(TicketsContext)
  if (!ctx) throw new Error('useTickets must be used within TicketsProvider')
  return ctx
}
