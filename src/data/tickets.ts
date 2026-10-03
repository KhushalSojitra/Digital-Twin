import { ALL_DEVICES, SITES, getSite } from './cameras'

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
  cameraId: string
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

let nextTicketNumber = 1043

export function createTicket(input: NewTicketInput): Ticket {
  const device = ALL_DEVICES.find((d) => d.id === input.cameraId)!
  const now = new Date().toISOString()
  const distanceM = input.distanceM ?? 35
  const followers = [...new Set([input.creator, ...(input.followers ?? [])])]
  const timeline: TicketEvent[] = [{ at: now, by: input.creator, text: `Ticket raised from Live View on ${device.name}`, state: 'open' }]
  if (input.creationSnapshot) timeline.push({ at: now, by: input.creator, text: 'Creation snapshot captured from the live camera' })
  if (input.assignee) timeline.push({ at: now, by: input.creator, text: `Assigned to ${input.assignee}` })

  return {
    id: `OE-${nextTicketNumber++}`,
    title: input.title,
    description: input.description,
    status: 'open',
    priority: input.priority,
    type: input.type,
    cameraId: input.cameraId,
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
    yaw: input.yaw,
    pitch: input.pitch,
    zoom: input.zoom,
    distanceM,
    ...locateOnEarth(device.siteId, input.yaw, distanceM),
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

export function peekNextTicketId() {
  return `OE-${nextTicketNumber}`
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

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

interface Seed {
  n: number
  title: string
  description: string
  status: TicketStatus
  priority: TicketPriority
  type: TicketType
  cameraId: string
  zone: string
  assignee: string
  creator: string
  platform: TicketPlatform
  platformName?: string
  ageH: number
  followers?: string[]
  resolution?: string
  yaw: number
  pitch: number
  dist: number
}

const SEEDS: Seed[] = [
  {
    n: 1042,
    yaw: 48,
    pitch: -6,
    dist: 62,
    title: 'Person crossing perimeter fence, north side',
    description:
      'Analytics flagged a single person crossing the fence line near the north seawall. PTZ auto-tracked for 40 s before losing the subject behind the maintenance shed.',
    status: 'open',
    priority: 'critical',
    type: 'intrusion',
    cameraId: 'liberty-ptz',
    zone: 'Perimeter',
    assignee: 'Michael Reed',
    creator: 'Ava Sharma',
    platform: 'custom',
    platformName: 'Jira',
    ageH: 0.4,
    followers: ['Ava Sharma'],
  },
  {
    n: 1041,
    yaw: -12,
    pitch: -14,
    dist: 18,
    title: 'Unattended bag at pedestal entrance',
    description:
      'A dark backpack has been stationary at the pedestal entrance turnstiles for over 12 minutes. No owner identified in the 360° footage.',
    status: 'in_progress',
    priority: 'high',
    type: 'loitering',
    cameraId: 'liberty-360',
    zone: 'Pedestal',
    assignee: 'Ava Sharma',
    creator: 'Michael Reed',
    platform: 'default',
    ageH: 1.2,
    followers: ['Ava Sharma'],
  },
  {
    n: 1040,
    yaw: -95,
    pitch: 4,
    dist: 40,
    title: 'Ellis PTZ video degraded — packet loss',
    description:
      'Stream bitrate dropping intermittently to under 2 Mbps with visible artefacts. Switch port on the north seawall cabinet suspected.',
    status: 'in_progress',
    priority: 'high',
    type: 'camera_fault',
    cameraId: 'ellis-ptz',
    zone: 'Seawall',
    assignee: 'Ava Sharma',
    creator: 'Ava Sharma',
    platform: 'default',
    ageH: 2.5,
  },
  {
    n: 1039,
    yaw: 150,
    pitch: -9,
    dist: 55,
    title: 'Crowd density above threshold at ferry queue',
    description: 'Estimated 340 people in the ferry landing queue area, exceeding the 300-person soft limit for 6 minutes.',
    status: 'open',
    priority: 'medium',
    type: 'crowd',
    cameraId: 'ellis-360',
    zone: 'Ferry landing',
    assignee: 'Sarah Wilson',
    creator: 'Ava Sharma',
    platform: 'custom',
    platformName: 'Jira',
    ageH: 3.1,
  },
  {
    n: 1038,
    yaw: 112,
    pitch: -11,
    dist: 48,
    title: 'Vehicle stopped in terminal approach lane',
    description: 'White van stationary in the no-standing lane for 9 minutes. Driver not visible.',
    status: 'done',
    priority: 'medium',
    type: 'vehicle',
    cameraId: 'battery-ptz',
    zone: 'Terminal approach',
    assignee: 'Michael Reed',
    creator: 'Sarah Wilson',
    platform: 'client',
    ageH: 5,
  },
  {
    n: 1037,
    yaw: -160,
    pitch: -24,
    dist: 12,
    title: 'Lens obstruction on Battery 360',
    description: 'Bottom-left quadrant of the panorama obscured, likely bird droppings. Requires cleaning visit.',
    status: 'accepted',
    priority: 'low',
    type: 'maintenance',
    cameraId: 'battery-360',
    zone: 'Esplanade',
    assignee: 'Ava Sharma',
    creator: 'Ava Sharma',
    platform: 'default',
    ageH: 9,
  },
  {
    n: 1036,
    yaw: 72,
    pitch: 10,
    dist: 30,
    title: 'Camera housing tamper alarm',
    description: 'Housing tamper contact triggered on the promenade PTZ. Footage shows a contractor ladder resting against the pole.',
    status: 'done',
    priority: 'high',
    type: 'tamper',
    cameraId: 'liberty-ptz',
    zone: 'Promenade',
    assignee: 'Michael Reed',
    creator: 'Ava Sharma',
    platform: 'custom',
    platformName: 'Jira',
    ageH: 14,
    followers: ['Ava Sharma'],
  },
  {
    n: 1035,
    yaw: -40,
    pitch: -3,
    dist: 70,
    title: 'Loitering near museum entrance after closing',
    description: 'Two individuals remained at the museum entrance 25 minutes after closing. Left when approached by patrol.',
    status: 'accepted',
    priority: 'medium',
    type: 'loitering',
    cameraId: 'ellis-360',
    zone: 'Museum entrance',
    assignee: 'Sarah Wilson',
    creator: 'Michael Reed',
    platform: 'client',
    ageH: 20,
  },
  {
    n: 1034,
    yaw: 20,
    pitch: -2,
    dist: 35,
    title: 'PTZ preset drift — home position off by 4°',
    description: 'Home preset on the promenade PTZ is returning 4° left of the calibrated bearing. Needs recalibration.',
    status: 'failed',
    priority: 'low',
    type: 'maintenance',
    cameraId: 'liberty-ptz',
    zone: 'Promenade',
    assignee: 'Ava Sharma',
    creator: 'Michael Reed',
    platform: 'default',
    ageH: 27,
  },
  {
    n: 1033,
    yaw: -120,
    pitch: -8,
    dist: 90,
    title: 'Small craft approaching seawall',
    description: 'Inflatable boat approached within 15 m of the north seawall before turning away. Harbor patrol notified.',
    status: 'done',
    priority: 'critical',
    type: 'intrusion',
    cameraId: 'ellis-ptz',
    zone: 'Seawall',
    assignee: 'Ava Sharma',
    creator: 'Ava Sharma',
    platform: 'custom',
    platformName: 'Jira',
    ageH: 31,
  },
  {
    n: 1032,
    yaw: -70,
    pitch: -6,
    dist: 58,
    title: 'Esplanade crowd surge during event',
    description: 'Crowd surge along the esplanade during evening event. Density peaked at 4.1 people/m².',
    status: 'accepted',
    priority: 'high',
    type: 'crowd',
    cameraId: 'battery-360',
    zone: 'Esplanade',
    assignee: 'Michael Reed',
    creator: 'Sarah Wilson',
    platform: 'default',
    ageH: 40,
  },
  {
    n: 1031,
    yaw: 0,
    pitch: -30,
    dist: 6,
    title: 'Scheduled firmware update — Liberty 360',
    description: 'Roll firmware 4.2.1 to the pedestal 360° unit during the maintenance window.',
    status: 'done',
    priority: 'low',
    type: 'maintenance',
    cameraId: 'liberty-360',
    zone: 'Pedestal',
    assignee: 'Ava Sharma',
    creator: 'Ava Sharma',
    platform: 'default',
    ageH: 52,
  },
  {
    n: 1030,
    yaw: 140,
    pitch: -7,
    dist: 64,
    title: 'Motorcycle on pedestrian esplanade',
    description: 'Motorcycle rode along the pedestrian esplanade for approximately 200 m.',
    status: 'failed',
    priority: 'medium',
    type: 'vehicle',
    cameraId: 'battery-ptz',
    zone: 'Esplanade',
    assignee: 'Michael Reed',
    creator: 'Ava Sharma',
    platform: 'custom',
    platformName: 'Jira',
    ageH: 60,
  },
  {
    n: 1029,
    yaw: 20,
    pitch: 30,
    dist: 30,
    title: 'Tamper: PTZ pointed at sky',
    description: 'Promenade PTZ found pointing at the sky with no operator command logged.',
    status: 'open',
    priority: 'high',
    type: 'tamper',
    cameraId: 'liberty-ptz',
    zone: 'Promenade',
    assignee: 'Michael Reed',
    creator: 'Sarah Wilson',
    platform: 'client',
    ageH: 75,
  },
  {
    n: 1028,
    yaw: -15,
    pitch: -10,
    dist: 25,
    title: 'Night-time IR illuminator failure',
    description: 'IR illuminator on the ferry landing 360° unit not activating after dusk. Image noise elevated.',
    status: 'in_progress',
    priority: 'medium',
    type: 'camera_fault',
    cameraId: 'ellis-360',
    zone: 'Ferry landing',
    assignee: 'Ava Sharma',
    creator: 'Ava Sharma',
    platform: 'custom',
    platformName: 'Jira',
    ageH: 96,
    followers: ['Ava Sharma'],
  },
  {
    n: 1027,
    yaw: -30,
    pitch: -16,
    dist: 16,
    title: 'Person climbing pedestal railing',
    description: 'Visitor climbed onto the pedestal railing for photographs. Warned by staff.',
    status: 'accepted',
    priority: 'medium',
    type: 'intrusion',
    cameraId: 'liberty-360',
    zone: 'Pedestal',
    assignee: 'Ava Sharma',
    creator: 'Michael Reed',
    platform: 'default',
    ageH: 120,
  },
  {
    n: 1026,
    yaw: 95,
    pitch: -5,
    dist: 44,
    title: 'Partner API test ticket — terminal zone',
    description: 'Synthetic ticket raised by the partner integration health check.',
    status: 'done',
    priority: 'low',
    type: 'maintenance',
    cameraId: 'battery-ptz',
    zone: 'Terminal approach',
    assignee: 'Sarah Wilson',
    creator: 'Michael Reed',
    platform: 'custom',
    platformName: 'Partner API',
    ageH: 150,
  },
  {
    n: 1025,
    yaw: -135,
    pitch: -9,
    dist: 72,
    title: 'Vehicle reversing into restricted dock area',
    description: 'Delivery truck reversed into the restricted dock area beside the seawall without escort.',
    status: 'open',
    priority: 'medium',
    type: 'vehicle',
    cameraId: 'ellis-ptz',
    zone: 'Seawall',
    assignee: 'Sarah Wilson',
    creator: 'Ava Sharma',
    platform: 'custom',
    platformName: 'Jira',
    ageH: 170,
  },
]

interface SeedLifecycle {
  timeline: TicketEvent[]
  comments: TicketComment[]
  completedAt?: string
  completion?: TicketCompletion
}

const REVIEWER = 'Ava Sharma'

function buildLifecycle(seed: Seed, createdAt: string): SeedLifecycle {
  const at = (fraction: number) => hoursAgo(Math.max(0.05, seed.ageH * (1 - fraction)))
  const platform = platformLabel(seed)
  const timeline: TicketEvent[] = [{ at: createdAt, by: seed.creator, text: `Ticket raised via ${platform}`, state: 'open' }]
  const comments: TicketComment[] = []
  let completedAt: string | undefined
  let completion: TicketCompletion | undefined

  if (seed.status !== 'open') {
    timeline.push({ at: at(0.2), by: seed.assignee, text: 'Acknowledged and started investigation', state: 'in_progress' })
    comments.push({ at: at(0.25), by: seed.assignee, text: 'On site now, reviewing the camera feed and the surrounding area.' })
  }

  if (seed.status === 'done' || seed.status === 'accepted') {
    completedAt = at(0.6)
    completion = { by: seed.assignee, at: completedAt, notes: seed.resolution ?? 'Issue resolved and verified on the live camera.' }
    timeline.push({ at: completedAt, by: seed.assignee, text: 'Work completed and completion snapshot captured', state: 'done' })
  }

  if (seed.status === 'accepted') {
    timeline.push({ at: at(0.85), by: REVIEWER, text: 'Improvement verified against the before snapshot and accepted', state: 'accepted' })
    comments.push({ at: at(0.85), by: REVIEWER, text: 'Before and after look right. Closing this out.' })
  }

  if (seed.status === 'failed') {
    timeline.push({ at: at(0.6), by: seed.assignee, text: 'Resolution attempt unsuccessful — escalated to the site team', state: 'failed' })
    comments.push({ at: at(0.62), by: seed.assignee, text: 'Could not resolve with the tools on hand. Needs the contractor.' })
  }

  return { timeline, comments, completedAt, completion }
}

export const SEED_TICKETS: Ticket[] = SEEDS.map((s) => {
  const device = ALL_DEVICES.find((d) => d.id === s.cameraId)!
  const createdAt = hoursAgo(s.ageH)
  const { timeline, comments, completedAt, completion } = buildLifecycle(s, createdAt)
  return {
    id: `OE-${s.n}`,
    title: s.title,
    description: s.description,
    status: s.status,
    priority: s.priority,
    type: s.type,
    cameraId: s.cameraId,
    siteId: device.siteId,
    zone: s.zone,
    assignee: s.assignee,
    creator: s.creator,
    platform: s.platform,
    platformName: s.platformName,
    followers: [...new Set([s.creator, ...(s.followers ?? [])])].filter((p) => p !== 'Ava Sharma'),
    comments,
    createdAt,
    updatedAt: timeline[timeline.length - 1].at,
    completedAt,
    completion,
    snapshots: {},
    snapshotConfig: { ...DEFAULT_SNAPSHOT_CONFIG },
    timeline,
    yaw: s.yaw,
    pitch: s.pitch,
    // Historical tickets were framed tighter the further away the subject was.
    zoom: Math.round(Math.min(18, Math.max(1.5, s.dist / 5)) * 10) / 10,
    distanceM: s.dist,
    ...locateOnEarth(device.siteId, s.yaw, s.dist),
  }
})

export function cameraName(cameraId: string) {
  return ALL_DEVICES.find((d) => d.id === cameraId)?.name ?? cameraId
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
      (t) => t.cameraId,
      (id) => cameraName(id),
    ),
    topSites: rank(
      (t) => t.siteId,
      (id) => siteName(id),
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
