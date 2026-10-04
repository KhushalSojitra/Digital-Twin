import { supabase } from '../supabaseClient'
import { ALL_DEVICES } from './cameras'
import {
  DEFAULT_SNAPSHOT_CONFIG,
  cameraName,
  LIFECYCLE_LABEL,
  locateOnEarth,
  type LifecycleState,
  type Snapshot,
  type Ticket,
  type TicketAttachment,
  type TicketStatus,
} from './tickets'

type DatabaseRow = Record<string, unknown>

const TICKET_SELECT = '*, ticket_state_history(*), ticket_attachments(*)'
const ATTACHMENT_BUCKET = 'ticket-attachments'
const SIGNED_URL_TTL_SECONDS = 60 * 60

export type Warn = (message: string) => void

function fail(action: string, error: { message: string; code?: string }): never {
  const hint = error.code === 'PGRST116' ? ' (no matching row was changed - check the Supabase row level security policies)' : ''
  throw new Error(`${action}: ${error.message}${hint}`)
}

function asRow(value: unknown): DatabaseRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Received an invalid row from Supabase')
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

function rowArray(value: unknown): DatabaseRow[] {
  return Array.isArray(value) ? value.filter((entry): entry is DatabaseRow => typeof entry === 'object' && entry !== null) : []
}

function objectValue(value: unknown): DatabaseRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as DatabaseRow) : {}
}

function cameraForRow(value: unknown) {
  const name = typeof value === 'string' ? value.trim() : ''
  const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')
  const wanted = normalize(name)
  const camera = ALL_DEVICES.find(
    (device) => device.id === name || device.name === name || normalize(device.id) === wanted || normalize(device.name) === wanted,
  )
  if (camera) return camera
  const fallback = ALL_DEVICES.find((device) => device.id === 'ellis-360')
  if (!fallback) throw new Error('Fallback camera profile ellis-360 is not configured')
  return fallback
}

export function statusToDb(status: TicketStatus): string {
  return status === 'open' ? 'to do' : status
}

function statusFromDb(value: unknown): TicketStatus {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (raw === 'to do' || raw === 'open') return 'open'
  if (raw === 'in progress' || raw === 'in_progress') return 'in_progress'
  if (raw === 'done' || raw === 'accepted' || raw === 'failed') return raw
  return 'open'
}

function lifecycleFromHistory(from: unknown, to: unknown): LifecycleState {
  const status = statusFromDb(to)
  if (status === 'open') return from ? 'reopened' : 'open'
  return status
}

function snapshotFromLegacyMetadata(value: unknown): Snapshot | undefined {
  const snapshot = objectValue(value)
  if (typeof snapshot.src !== 'string' || typeof snapshot.at !== 'string' || typeof snapshot.by !== 'string') return undefined
  return { src: snapshot.src, at: snapshot.at, by: snapshot.by, yaw: numberValue(snapshot.yaw, 0), pitch: numberValue(snapshot.pitch, 0) }
}

function attachmentFromRow(row: DatabaseRow, urls: Map<string, string>): TicketAttachment {
  const kind = row.kind === 'before' || row.kind === 'after' ? row.kind : 'file'
  const meta = objectValue(row.meta)
  const storagePath = stringValue(row.storage_path, '')
  return {
    id: stringValue(row.id, storagePath),
    kind,
    fileName: stringValue(row.file_name, 'attachment'),
    fileType: stringValue(row.file_type, 'application/octet-stream'),
    storagePath,
    url: urls.get(storagePath),
    uploadedBy: stringValue(row.uploaded_by, 'System'),
    uploadedAt: stringValue(row.uploaded_at, new Date().toISOString()),
    yaw: typeof meta.yaw === 'number' ? meta.yaw : undefined,
    pitch: typeof meta.pitch === 'number' ? meta.pitch : undefined,
  }
}

function snapshotFromAttachment(attachments: TicketAttachment[], kind: 'before' | 'after'): Snapshot | undefined {
  const latest = attachments.filter((a) => a.kind === kind && a.url).at(-1)
  if (!latest?.url) return undefined
  return { src: latest.url, at: latest.uploadedAt, by: latest.uploadedBy, yaw: latest.yaw ?? 0, pitch: latest.pitch ?? 0 }
}

function ticketFromRow(value: unknown, urls: Map<string, string>): Ticket {
  const row = asRow(value)
  const ptz = objectValue(row.ptz_coordinates)
  const metadata = objectValue(ptz.metadata)
  const camera = cameraForRow(row.camera_name)
  const createdAt = stringValue(row.created_at, new Date().toISOString())
  const yaw = numberValue(ptz.yaw, 0)
  const pitch = numberValue(ptz.pitch, 0)
  const zoom = numberValue(ptz.zoom, 1)
  const distanceM = numberValue(ptz.distanceM, 35)
  const computed = locateOnEarth(camera.siteId, yaw, distanceM)
  const hasStoredLocation = ptz.lat != null && ptz.lng != null && Number.isFinite(Number(ptz.lat)) && Number.isFinite(Number(ptz.lng))

  const rawPriority = typeof row.priority === 'string' ? row.priority.trim().toLowerCase() : ''
  const priority: Ticket['priority'] =
    rawPriority === 'critical' || rawPriority === 'high' || rawPriority === 'low' ? rawPriority : 'medium'

  const id = stringValue(row.ticket_id, stringValue(row.id, ''))
  if (!id) throw new Error('Supabase ticket row is missing both ticket_id and id')

  const comments: Ticket['comments'] = rowArray(row.replies).map((comment) => ({
    at: stringValue(comment.at, createdAt),
    by: stringValue(comment.by, 'System'),
    text: stringValue(comment.text, ''),
  }))

  const attachments = rowArray(row.ticket_attachments)
    .map((attachment) => attachmentFromRow(attachment, urls))
    .sort((a, b) => Date.parse(a.uploadedAt) - Date.parse(b.uploadedAt))

  const stateEvents: Ticket['timeline'] = rowArray(row.ticket_state_history).map((entry) => {
    const state = lifecycleFromHistory(entry.from_state, entry.to_state)
    return {
      at: stringValue(entry.changed_at, createdAt),
      by: stringValue(entry.changed_by, 'System'),
      state,
      text: entry.from_state ? `Moved to ${LIFECYCLE_LABEL[state]}` : `Ticket raised from Live View on ${cameraName(camera.id)}`,
    }
  })
  // Activity notes (assignments, comments, follows). State changes come from ticket_state_history only.
  const updateEvents: Ticket['timeline'] = rowArray(row.history_log)
    .filter((event) => event.state == null)
    .map((event) => ({
      at: stringValue(event.at, createdAt),
      by: stringValue(event.by, 'System'),
      text: stringValue(event.text, ''),
    }))
  const timeline = [...stateEvents, ...updateEvents].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

  const completedAt = typeof row.completed_at === 'string' ? row.completed_at : undefined
  const completion = objectValue(metadata.completion)
  const hasCompletion = typeof completion.by === 'string'
  const snapshotConfig = objectValue(metadata.snapshotConfig)
  const legacySnapshots = objectValue(metadata.snapshots)
  const rawType = metadata.type
  const validTypes: Ticket['type'][] = ['intrusion', 'loitering', 'tamper', 'camera_fault', 'vehicle', 'crowd', 'maintenance']
  const rawPlatform = metadata.platform
  const updatedAt = timeline.reduce(
    (latest, event) => (Date.parse(event.at) > Date.parse(latest) ? event.at : latest),
    completedAt && Date.parse(completedAt) > Date.parse(createdAt) ? completedAt : createdAt,
  )

  return {
    id,
    title: stringValue(row.title, 'Untitled ticket'),
    description: stringValue(row.description, ''),
    status: statusFromDb(row.status),
    priority,
    type: validTypes.find((candidate) => candidate === rawType) ?? 'intrusion',
    cameraId: camera.id,
    siteId: camera.siteId,
    zone: stringValue(metadata.zone, 'Perimeter'),
    assignee: stringValue(row.assignee, ''),
    creator: stringValue(row.reporter, 'System'),
    platform: rawPlatform === 'client' || rawPlatform === 'custom' ? rawPlatform : 'default',
    platformName: typeof metadata.platformName === 'string' ? metadata.platformName : undefined,
    followers: Array.isArray(metadata.followers) ? metadata.followers.filter((f): f is string => typeof f === 'string') : [],
    comments,
    createdAt,
    updatedAt,
    completedAt,
    completion: hasCompletion
      ? { by: stringValue(completion.by, 'System'), at: completedAt ?? stringValue(completion.at, createdAt), notes: stringValue(completion.notes, '') }
      : undefined,
    snapshots: {
      before: snapshotFromAttachment(attachments, 'before') ?? snapshotFromLegacyMetadata(legacySnapshots.before),
      after: snapshotFromAttachment(attachments, 'after') ?? snapshotFromLegacyMetadata(legacySnapshots.after),
    },
    attachments,
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
    lat: hasStoredLocation ? Number(ptz.lat) : computed.lat,
    lng: hasStoredLocation ? Number(ptz.lng) : computed.lng,
  }
}

function ptzForTicket(ticket: Ticket): DatabaseRow {
  const legacySnapshots = Object.fromEntries(
    Object.entries(ticket.snapshots).filter(([, snapshot]) => snapshot?.src.startsWith('data:')),
  )
  return {
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
      snapshotConfig: ticket.snapshotConfig,
      completion: ticket.completion,
      // Frames from before attachments existed are kept so nothing is lost; new frames live in Storage.
      ...(Object.keys(legacySnapshots).length ? { snapshots: legacySnapshots } : {}),
    },
  }
}

function editableColumns(ticket: Ticket): DatabaseRow {
  return {
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority,
    assignee: ticket.assignee || 'Unassigned',
    camera_name: ticket.cameraId,
    ptz_coordinates: ptzForTicket(ticket),
    replies: ticket.comments,
    history_log: ticket.timeline.filter((event) => !event.state),
  }
}

async function signAttachmentUrls(rows: unknown[], warn: Warn): Promise<Map<string, string>> {
  const paths = new Set<string>()
  for (const row of rows) {
    for (const attachment of rowArray(asRow(row).ticket_attachments)) {
      if (typeof attachment.storage_path === 'string') paths.add(attachment.storage_path)
    }
  }
  const urls = new Map<string, string>()
  if (paths.size === 0) return urls
  const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrls([...paths], SIGNED_URL_TTL_SECONDS)
  if (error) {
    warn(`Attachments could not be loaded: ${error.message}`)
    return urls
  }
  for (const entry of data) {
    if (entry.signedUrl && entry.path) urls.set(entry.path, entry.signedUrl)
    else warn(`Attachment ${entry.path ?? ''} could not be loaded: ${entry.error ?? 'unknown error'}`)
  }
  return urls
}

async function hydrate(rows: unknown[], warn: Warn): Promise<Ticket[]> {
  const urls = await signAttachmentUrls(rows, warn)
  const tickets: Ticket[] = []
  for (const row of rows) {
    try {
      tickets.push(ticketFromRow(row, urls))
    } catch (error) {
      warn(`A ticket could not be read: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return tickets
}

export async function fetchTickets(warn: Warn): Promise<Ticket[]> {
  const { data, error } = await supabase.from('tickets').select(TICKET_SELECT).order('created_at', { ascending: false })
  if (error) fail('Unable to load tickets', error)
  return hydrate(data ?? [], warn)
}

export async function fetchTicket(id: string, warn: Warn): Promise<Ticket> {
  const { data, error } = await supabase.from('tickets').select(TICKET_SELECT).eq('id', id).single()
  if (error) fail(`Unable to load ticket ${id}`, error)
  const [ticket] = await hydrate([data], warn)
  if (!ticket) throw new Error(`Ticket ${id} could not be read`)
  return ticket
}

/** Inserts the ticket and its initial state-history entry; the ticket is removed again if the history write fails. */
export async function insertTicket(ticket: Ticket): Promise<void> {
  const { error } = await supabase.from('tickets').insert({
    id: ticket.id,
    ticket_id: ticket.id,
    status: statusToDb(ticket.status),
    reporter: ticket.creator,
    ...editableColumns(ticket),
  })
  if (error) fail(`Unable to create ticket ${ticket.id}`, error)

  const history = await supabase.from('ticket_state_history').insert({
    ticket_id: ticket.id,
    from_state: null,
    to_state: statusToDb(ticket.status),
    changed_by: ticket.creator,
  })
  if (history.error) {
    await deleteTicket(ticket.id).catch(() => undefined)
    fail(`Unable to record the creation of ticket ${ticket.id}`, history.error)
  }
}

export async function updateTicketDetails(ticket: Ticket, warn: Warn): Promise<Ticket> {
  const { data, error } = await supabase
    .from('tickets')
    .update(editableColumns(ticket))
    .eq('id', ticket.id)
    .select(TICKET_SELECT)
    .single()
  if (error) fail(`Unable to save ticket ${ticket.id}`, error)
  const [saved] = await hydrate([data], warn)
  if (!saved) throw new Error(`Ticket ${ticket.id} could not be read after saving`)
  return saved
}

export async function changeTicketState(
  id: string,
  status: TicketStatus,
  changedBy: string,
  completion: { by: string; at: string; notes: string } | null,
  warn: Warn,
): Promise<Ticket> {
  const { error } = await supabase.rpc('change_ticket_state', {
    p_ticket_id: id,
    p_to_state: statusToDb(status),
    p_changed_by: changedBy,
    p_completion: completion,
  })
  if (error) fail(`Unable to change the state of ticket ${id}`, error)
  return fetchTicket(id, warn)
}

export async function uploadSnapshot(ticketId: string, kind: 'before' | 'after', snapshot: Snapshot): Promise<void> {
  const blob = await (await fetch(snapshot.src)).blob()
  const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
  const path = `${ticketId}/${kind}-${crypto.randomUUID()}.${extension}`

  const upload = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, blob, { contentType: blob.type || undefined, upsert: false })
  if (upload.error) fail(`Unable to upload the ${kind} snapshot for ${ticketId}`, upload.error)

  const { error } = await supabase.from('ticket_attachments').insert({
    ticket_id: ticketId,
    kind,
    file_name: `${kind}-snapshot.${extension}`,
    file_type: blob.type || 'image/png',
    storage_path: path,
    uploaded_by: snapshot.by,
    uploaded_at: snapshot.at,
    meta: { yaw: snapshot.yaw, pitch: snapshot.pitch },
  })
  if (error) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([path])
    fail(`Unable to save the ${kind} snapshot record for ${ticketId}`, error)
  }
}

export async function deleteTicket(id: string, storagePaths: string[] = []): Promise<void> {
  const { data, error } = await supabase.from('tickets').delete().eq('id', id).select('id')
  if (error) fail(`Unable to delete ticket ${id}`, error)
  if (!data?.length) throw new Error(`Unable to delete ticket ${id}: no matching row was removed (check the row level security policies)`)
  if (storagePaths.length) {
    const removal = await supabase.storage.from(ATTACHMENT_BUCKET).remove(storagePaths)
    if (removal.error) console.error(`Ticket ${id} deleted but its files could not be removed:`, removal.error.message)
  }
}

export const TICKET_REALTIME_TABLES = ['tickets', 'ticket_state_history', 'ticket_attachments'] as const
