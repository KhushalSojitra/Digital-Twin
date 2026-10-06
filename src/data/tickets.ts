import { ALL_DEVICES, SITES, getSite, siteCenter, type CameraDevice } from './cameras'

/** Where a ticket was raised. One unified ticket model; the source is the creation context. */
export type TicketSource = 'EARTH' | 'CAMERA_360' | 'CAMERA_PTZ' | 'CAMERA_CCTV'

export const TICKET_SOURCES: TicketSource[] = ['EARTH', 'CAMERA_360', 'CAMERA_PTZ', 'CAMERA_CCTV']

/** The only ticketing system for now; shown read-only in the Create Ticket dialogs. */
export const TICKETING_SYSTEM = 'Digital Twin Ticketing'

export const TICKET_SOURCE_LABEL: Record<TicketSource, string> = {
  EARTH: 'Earth',
  CAMERA_360: '360 Camera',
  CAMERA_PTZ: 'PTZ Camera',
  CAMERA_CCTV: 'CCTV Camera',
}

export function isTicketSource(value: unknown): value is TicketSource {
  return TICKET_SOURCES.some((source) => source === value)
}

export function sourceForDevice(device: Pick<CameraDevice, 'kind'>): TicketSource {
  return device.kind === 'ptz' ? 'CAMERA_PTZ' : 'CAMERA_360'
}

export type TicketStatus = 'open' | 'in_progress' | 'done' | 'accepted' | 'failed'
export type TicketPriority = 'critical' | 'high' | 'medium' | 'low'
export type TicketType = 'intrusion' | 'loitering' | 'tamper' | 'camera_fault' | 'vehicle' | 'crowd' | 'maintenance'
/** Where the ticket was raised: the OominiEye console, a client-facing app, or an integrated system. */
export type TicketPlatform = 'default' | 'client' | 'custom'

/** Lifecycle states shown in the activity stepper. `reopened` returns the ticket to Open. */
export type LifecycleState = TicketStatus | 'reopened'

export interface TicketEvent {
  at: string
  by: string
  text: string
  /** Set on events that moved the ticket through its lifecycle; drives the stepper. */
  state?: LifecycleState
}

export interface TicketComment {
  at: string
  by: string
  text: string
}

export interface Snapshot {
  /** Data URL of the frame grabbed from the camera. */
  src: string
  at: string
  by: string
  /** Camera orientation the frame was grabbed at. */
  yaw: number
  pitch: number
}

export interface SnapshotConfig {
  captureCreation: boolean
  captureCompletion: boolean
  showInImprovementHistory: boolean
}

export interface TicketCompletion {
  by: string
  at: string
  notes: string
}

export interface Ticket {
  id: string
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  type: TicketType
  source: TicketSource
  /** Null for Earth tickets, which are not tied to a camera. */
  cameraId: string | null
  cameraName: string | null
  /** Nearest camera site; empty when an Earth ticket sits away from every site. */
  siteId: string
  zone: string
  assignee: string
  creator: string
  platform: TicketPlatform
  /** Name shown for a custom platform, e.g. an analytics engine or partner API. */
  platformName?: string
  followers: string[]
  comments: TicketComment[]
  createdAt: string
  updatedAt: string
  completedAt?: string
  completion?: TicketCompletion
  snapshots: { before?: Snapshot; after?: Snapshot }
  snapshotConfig: SnapshotConfig
  timeline: TicketEvent[]
  /** Where the ticket sits in the camera's field of view (scene-relative pan/tilt, degrees). */
  yaw: number
  pitch: number
  /** PTZ optical zoom the ticket was framed at, relative to a 60° reference lens. */
  zoom: number
  /** Ground distance from the site's 360° head, used to place the ticket on the Earth view. */
  distanceM: number
  lat: number
  lng: number
}

export type NewTicketInput = Pick<
  Ticket,
  'title' | 'description' | 'priority' | 'type' | 'cameraId' | 'zone' | 'assignee' | 'yaw' | 'pitch' | 'zoom' | 'platform' | 'platformName'
> & {
  creator: string
  distanceM?: number
  followers?: string[]
  snapshotConfig: SnapshotConfig
  creationSnapshot?: Snapshot
}

/** A ticket raised by picking a coordinate directly on the Earth map. */
export type NewEarthTicketInput = Pick<
  Ticket,
  'title' | 'description' | 'priority' | 'type' | 'zone' | 'assignee' | 'platform' | 'platformName' | 'lat' | 'lng'
> & {
  source: 'EARTH'
  creator: string
  followers?: string[]
  snapshotConfig: SnapshotConfig
}

export type TicketCreateInput = NewTicketInput | NewEarthTicketInput

export function isEarthInput(input: TicketCreateInput): input is NewEarthTicketInput {
  return 'source' in input && input.source === 'EARTH'
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
  accepted: 'Accepted',
  failed: 'Failed',
}

/** One palette for every surface: Earth pins, live markers, cards, chips and the stepper. */
export const STATUS_COLOR: Record<TicketStatus, string> = {
  open: '#FF453A',
  in_progress: '#FF9F0A',
  done: '#30D158',
  accepted: '#0A84FF',
  failed: '#8E8E93',
}

/** Statuses whose chips need dark text to stay legible on their fill. */
export const STATUS_NEEDS_DARK_TEXT: TicketStatus[] = ['in_progress']

export const LIFECYCLE_LABEL: Record<LifecycleState, string> = { ...STATUS_LABEL, reopened: 'Reopened' }

export const LIFECYCLE_COLOR: Record<LifecycleState, string> = { ...STATUS_COLOR, reopened: '#0A84FF' }

/** Status a ticket lands on once a lifecycle transition is applied. */
export const STATE_RESULT: Record<LifecycleState, TicketStatus> = {
  open: 'open',
  in_progress: 'in_progress',
  done: 'done',
  accepted: 'accepted',
  failed: 'failed',
  reopened: 'open',
}

/** Transitions offered for a ticket in each status. */
export const NEXT_STATES: Record<TicketStatus, LifecycleState[]> = {
  open: ['in_progress', 'done', 'failed'],
  in_progress: ['done', 'failed'],
  done: ['accepted', 'failed', 'reopened'],
  accepted: ['reopened'],
  failed: ['reopened', 'in_progress'],
}

export const COMPLETED_STATUSES: TicketStatus[] = ['done', 'accepted']
export const TICKET_HISTORY_WINDOW_DAYS = 30

export function isHistoricalTicket(ticket: Pick<Ticket, 'createdAt'>, now = Date.now()) {
  const createdAt = new Date(ticket.createdAt).getTime()
  return Number.isFinite(createdAt) && now - createdAt > TICKET_HISTORY_WINDOW_DAYS * 86_400_000
}

export function isCompleted(t: Ticket) {
  return COMPLETED_STATUSES.includes(t.status)
}

/** Projects a scene-relative pan angle and ground distance from the site's 360° head onto the map. */
export function locateOnEarth(siteId: string, yaw: number, distanceM: number) {
  const site = getSite(siteId)
  if (!site) return { lat: 0, lng: 0 }
  const origin = site.cam360
  const bearing = ((origin.headingDeg + yaw) * Math.PI) / 180
  const dLat = (distanceM * Math.cos(bearing)) / 111_320
  const dLng = (distanceM * Math.sin(bearing)) / (111_320 * Math.cos((origin.lat * Math.PI) / 180))
  return { lat: origin.lat + dLat, lng: origin.lng + dLng }
}

/** Sites within this ground distance of an Earth ticket claim it for clustering. */
const SITE_CLAIM_RADIUS_M = 3000

export function nearestSiteId(lat: number, lng: number): string {
  let best = ''
  let bestDistance = SITE_CLAIM_RADIUS_M
  for (const site of SITES) {
    const center = siteCenter(site)
    const dLat = (lat - center.lat) * 111_320
    const dLng = (lng - center.lng) * 111_320 * Math.cos((center.lat * Math.PI) / 180)
    const distance = Math.hypot(dLat, dLng)
    if (distance < bestDistance) {
      best = site.id
      bestDistance = distance
    }
  }
  return best
}

export function createEarthTicket(input: NewEarthTicketInput, id = `OE-${crypto.randomUUID()}`): Ticket {
  const lat = Number(input.lat)
  const lng = Number(input.lng)
  if (![lat, lng].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new Error('Earth ticket coordinates must be a valid latitude and longitude')
  }
  const now = new Date().toISOString()
  const followers = [...new Set([input.creator, ...(input.followers ?? [])])]
  const timeline: TicketEvent[] = [
    { at: now, by: input.creator, text: `Ticket raised on Earth at ${lat.toFixed(5)}, ${lng.toFixed(5)}`, state: 'open' },
  ]
  if (input.assignee) timeline.push({ at: now, by: input.creator, text: `Assigned to ${input.assignee}` })

  return {
    id,
    title: input.title,
    description: input.description,
    status: 'open',
    priority: input.priority,
    type: input.type,
    source: 'EARTH',
    cameraId: null,
    cameraName: null,
    siteId: nearestSiteId(lat, lng),
    zone: input.zone,
    assignee: input.assignee,
    creator: input.creator,
    platform: input.platform,
    platformName: input.platformName,
    followers,
    comments: [],
    createdAt: now,
    updatedAt: now,
    snapshots: {},
    snapshotConfig: input.snapshotConfig,
    timeline,
    yaw: 0,
    pitch: 0,
    zoom: 1,
    distanceM: 0,
    lat,
    lng,
  }
}

export function createTicket(input: NewTicketInput, id = `OE-${crypto.randomUUID()}`): Ticket {
  const device = ALL_DEVICES.find((d) => d.id === input.cameraId)
  if (!device) throw new Error(`Unknown camera device: ${input.cameraId}`)
  const now = new Date().toISOString()
  const yaw = Number(input.yaw)
  const pitch = Number(input.pitch)
  const zoom = Number(input.zoom)
  const distanceM = Number(input.distanceM ?? 35)
  if (![yaw, pitch, zoom, distanceM].every(Number.isFinite)) {
    throw new Error('Ticket camera coordinates must be finite numbers')
  }
  const followers = [...new Set([input.creator, ...(input.followers ?? [])])]
  const timeline: TicketEvent[] = [{ at: now, by: input.creator, text: `Ticket raised from Live View on ${device.name}`, state: 'open' }]
  if (input.creationSnapshot) timeline.push({ at: now, by: input.creator, text: 'Creation snapshot captured from the live camera' })
  if (input.assignee) timeline.push({ at: now, by: input.creator, text: `Assigned to ${input.assignee}` })

  return {
    id,
    title: input.title,
    description: input.description,
    status: 'open',
    priority: input.priority,
    type: input.type,
    source: sourceForDevice(device),
    cameraId: device.id,
    cameraName: device.name,
    siteId: device.siteId,
    zone: input.zone,
    assignee: input.assignee,
    creator: input.creator,
    platform: input.platform,
    platformName: input.platformName,
    followers,
    comments: [],
    createdAt: now,
    updatedAt: now,
    snapshots: { before: input.creationSnapshot },
    snapshotConfig: input.snapshotConfig,
    timeline,
    yaw,
    pitch,
    zoom,
    distanceM,
    ...locateOnEarth(device.siteId, yaw, distanceM),
  }
}

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const PRIORITY_COLOR: Record<TicketPriority, string> = {
  critical: '#FF453A',
  high: '#FF9F0A',
  medium: '#FFD60A',
  low: '#8E8E93',
}

export const TYPE_LABEL: Record<TicketType, string> = {
  intrusion: 'Intrusion',
  loitering: 'Loitering',
  tamper: 'Camera tamper',
  camera_fault: 'Camera fault',
  vehicle: 'Vehicle',
  crowd: 'Crowd density',
  maintenance: 'Maintenance',
}

export const PLATFORM_LABEL: Record<TicketPlatform, string> = {
  default: 'Default platform',
  client: 'Client platform',
  custom: 'Custom platform',
}

export const DEFAULT_SNAPSHOT_CONFIG: SnapshotConfig = {
  captureCreation: true,
  captureCompletion: true,
  showInImprovementHistory: true,
}

export function snapshotFromProof(on: boolean): SnapshotConfig {
  return { captureCreation: on, captureCompletion: on, showInImprovementHistory: on }
}

export function snapshotIsProof(c: SnapshotConfig) {
  return c.captureCreation || c.captureCompletion
}

/** Custom platforms carry their own name; the built-in ones use the standard label. */
export function platformLabel(t: Pick<Ticket, 'platform' | 'platformName'>) {
  return t.platformName ?? (t.platform === 'custom' ? 'Custom platform' : PLATFORM_LABEL[t.platform])
}

export const ZONES = ['Perimeter', 'Pedestal', 'Promenade', 'Ferry landing', 'Seawall', 'Esplanade', 'Terminal approach', 'Museum entrance']

const PEOPLE = ['Ava Sharma', 'Michael Reed', 'Sarah Wilson']
export const ASSIGNEES = PEOPLE
export const CREATORS = PEOPLE
export const DEMO_PEOPLE = PEOPLE

export function cameraName(cameraId: string) {
  return ALL_DEVICES.find((d) => d.id === cameraId)?.name ?? cameraId
}

/** Camera name for camera tickets, "Earth" for tickets raised on the map. */
export function ticketContextLabel(t: Pick<Ticket, 'source' | 'cameraId' | 'cameraName'>) {
  if (t.source === 'EARTH' || !t.cameraId) return TICKET_SOURCE_LABEL.EARTH
  return t.cameraName ?? cameraName(t.cameraId)
}

export function siteName(siteId: string) {
  return SITES.find((s) => s.id === siteId)?.name ?? siteId
}

export interface ImprovementStats {
  /** Completed work: done plus accepted. */
  improvements: number
  open: number
  closed: number
  accepted: number
  failed: number
  total: number
}

export function summarise(tickets: Ticket[]): ImprovementStats {
  const count = (s: TicketStatus) => tickets.filter((t) => t.status === s).length
  const closed = count('done')
  const accepted = count('accepted')
  return { improvements: closed + accepted, open: count('open'), closed, accepted, failed: count('failed'), total: tickets.length }
}

export interface SummaryRow {
  id: string
  label: string
  stats: ImprovementStats
  cameras: { id: string; label: string; stats: ImprovementStats }[]
}

/** Site-level rollups, each carrying its cameras' own numbers. */
export function summariseBySite(tickets: Ticket[]): SummaryRow[] {
  return SITES.map((site) => {
    const forSite = tickets.filter((t) => t.siteId === site.id)
    return {
      id: site.id,
      label: site.name,
      stats: summarise(forSite),
      cameras: [site.cam360, site.ptz].map((device) => ({
        id: device.id,
        label: device.name,
        stats: summarise(forSite.filter((t) => t.cameraId === device.id)),
      })),
    }
  }).filter((row) => row.stats.total > 0)
}

const EARTH_KEY = '__earth__'
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

export function completedAtMs(t: Ticket) {
  return new Date(t.completedAt ?? t.updatedAt).getTime()
}

/** Hours from raised to completed, for the tickets that got there. */
export function resolutionHours(t: Ticket) {
  return (completedAtMs(t) - new Date(t.createdAt).getTime()) / 3_600_000
}

export interface TrendPoint {
  /** Days back from now: 0 is today. */
  daysAgo: number
  raised: number
  closed: number
}

export interface ImprovementInsights {
  stats: ImprovementStats
  thisWeek: number
  /** Mean resolution time in hours across completed tickets, null when there are none. */
  avgResolutionHours: number | null
  trend: TrendPoint[]
  topCameras: { id: string; label: string; improvements: number }[]
  topSites: { id: string; label: string; improvements: number }[]
}

export function buildInsights(tickets: Ticket[], now = Date.now(), days = 8): ImprovementInsights {
  const completed = tickets.filter(isCompleted)
  const rank = (key: (t: Ticket) => string, label: (id: string) => string) =>
    Object.entries(
      completed.reduce<Record<string, number>>((acc, t) => {
        const k = key(t)
        acc[k] = (acc[k] ?? 0) + 1
        return acc
      }, {}),
    )
      .map(([id, improvements]) => ({ id, label: label(id), improvements }))
      .sort((a, b) => b.improvements - a.improvements)

  const dayBucket = (ms: number) => Math.floor((now - ms) / DAY_MS)

  return {
    stats: summarise(tickets),
    thisWeek: completed.filter((t) => now - completedAtMs(t) < WEEK_MS).length,
    avgResolutionHours: completed.length ? completed.reduce((sum, t) => sum + resolutionHours(t), 0) / completed.length : null,
    trend: Array.from({ length: days }, (_, i) => {
      const daysAgo = days - 1 - i
      return {
        daysAgo,
        raised: tickets.filter((t) => dayBucket(new Date(t.createdAt).getTime()) === daysAgo).length,
        closed: completed.filter((t) => dayBucket(completedAtMs(t)) === daysAgo).length,
      }
    }),
    topCameras: rank(
      (t) => t.cameraId ?? EARTH_KEY,
      (id) => (id === EARTH_KEY ? TICKET_SOURCE_LABEL.EARTH : cameraName(id)),
    ),
    topSites: rank(
      (t) => t.siteId || EARTH_KEY,
      (id) => (id === EARTH_KEY ? TICKET_SOURCE_LABEL.EARTH : siteName(id)),
    ),
  }
}

/**
 * Demo scene-improvement score for a completed ticket. Derived from the ticket itself so it is
 * stable between renders: higher for accepted, high-priority work, lower when it was reopened.
 */
export function improvementScore(t: Ticket) {
  const base = { critical: 92, high: 86, medium: 78, low: 71 }[t.priority]
  const accepted = t.status === 'accepted' ? 6 : 0
  const reopens = t.timeline.filter((e) => e.state === 'reopened').length * 7
  return Math.max(38, Math.min(99, base + accepted - reopens))
}
