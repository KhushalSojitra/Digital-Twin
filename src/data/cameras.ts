export type DeviceKind = '360' | 'ptz' | 'cctv'
/** The two pan/tilt heads that make up a live combo view. */
export type LiveDeviceKind = '360' | 'ptz'
export type SelectionKind = '360' | 'ptz' | 'combo'
export type DeviceStatus = 'online' | 'degraded' | 'offline'
export type PremiseType = 'construction' | 'factory'

export interface CameraDevice {
  id: string
  siteId: string
  name: string
  kind: DeviceKind
  model: string
  lat: number
  lng: number
  /** Metres above ground the unit is mounted. */
  mountHeightM: number
  /** Compass heading (degrees) the sensor's zero-yaw points to. */
  headingDeg: number
  status: DeviceStatus
  ip: string
  streamLabel: string
  /**
   * Fixed CCTV only: where the camera sits and looks inside the premise's 360° environment.
   * The yaw/pitch place its icon in the 360° scene and frame its fixed preview.
   */
  view?: { yaw: number; pitch: number; fov: number }
  /** Fixed CCTV only: the area of the premise it covers. */
  zone?: string
  /** Fixed CCTV only: what the 360° head cannot inspect properly that this camera covers. */
  blindSpot?: string
}

export interface CameraSite {
  id: string
  name: string
  type: PremiseType
  description: string
  panorama: string
  cam360: CameraDevice
  ptz: CameraDevice
  /** Fixed CCTV cameras installed around the premise, shown as icons inside the 360° environment. */
  cctv: CameraDevice[]
  /** Default yaw/pitch the PTZ parks at when homed. */
  home: { yaw: number; pitch: number; fov: number }
}

/** What the header dropdown lets the operator choose. */
export interface CameraSelection {
  id: string
  siteId: string
  kind: SelectionKind
  label: string
}

export const HOME_LOCATION = {
  center: [-74.1478, 40.6862] as [number, number],
  zoom: 14.6,
  pitch: 58,
  bearing: -18,
  label: 'OominiEye Industrial Estate — Port Newark',
}

type DeviceSpec = Omit<CameraDevice, 'siteId' | 'kind' | 'id' | 'streamLabel' | 'view' | 'zone' | 'blindSpot'>

interface CctvSpec {
  slot: string
  name: string
  zone: string
  blindSpot: string
  view: { yaw: number; pitch: number; fov: number }
  status?: DeviceStatus
}

const site = (
  id: string,
  name: string,
  type: PremiseType,
  description: string,
  panorama: string,
  cam360: DeviceSpec,
  ptz: DeviceSpec,
  cctv: CctvSpec[],
  home: CameraSite['home'],
): CameraSite => ({
  id,
  name,
  type,
  description,
  panorama,
  home,
  cam360: { ...cam360, id: `${id}-360`, siteId: id, kind: '360', streamLabel: '360° · 5760×2880 · 30 fps' },
  ptz: { ...ptz, id: `${id}-ptz`, siteId: id, kind: 'ptz', streamLabel: 'PTZ · 3840×2160 · 60 fps · 40× optical' },
  cctv: cctv.map((spec, index) => ({
    id: `${id}-cctv-${spec.slot}`,
    siteId: id,
    kind: 'cctv',
    name: spec.name,
    zone: spec.zone,
    blindSpot: spec.blindSpot,
    view: spec.view,
    model: 'OE-Fixed 4K Bullet',
    lat: cam360.lat,
    lng: cam360.lng,
    mountHeightM: 4,
    headingDeg: (cam360.headingDeg + spec.view.yaw + 360) % 360,
    status: spec.status ?? 'online',
    ip: `${cam360.ip.split('.').slice(0, 3).join('.')}.${21 + index}`,
    streamLabel: 'CCTV · 2560×1440 · 25 fps · fixed',
  })),
})

export const SITES: CameraSite[] = [
  site(
    'construction',
    'Construction Site',
    'construction',
    'Tower block build — crane-mounted 360° overview of the whole site',
    '/panoramas/construction_site.png',
    {
      name: 'Construction Site 360',
      model: 'OE-360 Ultra · crane mount',
      lat: 40.69045,
      lng: -74.15295,
      mountHeightM: 48,
      headingDeg: 0,
      status: 'online',
      ip: '10.40.1.11',
    },
    {
      name: 'Site PTZ',
      model: 'OE-PTZ 40X',
      lat: 40.69052,
      lng: -74.15282,
      mountHeightM: 46,
      headingDeg: 0,
      status: 'online',
      ip: '10.40.1.12',
    },
    [
    { slot: 'zone', name: 'Construction Zone CCTV', zone: 'Construction zone', blindSpot: 'Rear face of the tower block, hidden behind the structure from the crane head', view: { yaw: 14, pitch: -14, fov: 32 } },
    { slot: 'storage', name: 'Material Storage CCTV', zone: 'Material storage', blindSpot: 'Gap between the container stack and the perimeter fence', view: { yaw: 199, pitch: -22, fov: 30 } },
    { slot: 'entrance', name: 'Site Entrance CCTV', zone: 'Site entrance', blindSpot: 'Gate and approach road, foreshortened directly beneath the crane head', view: { yaw: 283, pitch: -50, fov: 30 } },
    ],
    { yaw: 100, pitch: -18, fov: 22 },
  ),
  site(
    'factory-1',
    'Factory 1',
    'factory',
    'Automated assembly plant — production line, warehouse and dispatch dock',
    '/panoramas/factory_1.png',
    {
      name: 'Factory 1 360',
      model: 'OE-360 Ultra · truss mount',
      lat: 40.68618,
      lng: -74.13985,
      mountHeightM: 8,
      headingDeg: 0,
      status: 'online',
      ip: '10.40.2.11',
    },
    {
      name: 'Factory 1 PTZ',
      model: 'OE-PTZ 40X',
      lat: 40.68624,
      lng: -74.13972,
      mountHeightM: 8,
      headingDeg: 0,
      status: 'online',
      ip: '10.40.2.12',
    },
    [
    { slot: 'production', name: 'Production Floor CCTV', zone: 'Production floor', blindSpot: 'Behind the CNC machining cell, screened by the machines', view: { yaw: 135, pitch: -14, fov: 34 } },
    { slot: 'warehouse', name: 'Warehouse CCTV', zone: 'Warehouse', blindSpot: 'Aisle ends behind the racking and the forklift lane', view: { yaw: 240, pitch: -8, fov: 28 } },
    { slot: 'entrance', name: 'Entrance CCTV', zone: 'Entrance', blindSpot: 'Door under the mezzanine, hidden by the office structure', view: { yaw: 295, pitch: -14, fov: 28 } },
    { slot: 'loading', name: 'Loading Area CCTV', zone: 'Loading area', blindSpot: 'Dock doors and trailer bays, blocked by door frames and stacked pallets', view: { yaw: 342, pitch: -10, fov: 28 } },
    ],
    { yaw: 175, pitch: -22, fov: 22 },
  ),
  site(
    'factory-2',
    'Factory 2',
    'factory',
    'Steel fabrication & packaging plant — presses, coil store and dispatch bay',
    '/panoramas/factory_2.png',
    {
      name: 'Factory 2 360',
      model: 'OE-360 Ultra · column mount',
      lat: 40.68108,
      lng: -74.15045,
      mountHeightM: 9,
      headingDeg: 0,
      status: 'online',
      ip: '10.40.3.11',
    },
    {
      name: 'Factory 2 PTZ',
      model: 'OE-PTZ 40X',
      lat: 40.68114,
      lng: -74.15032,
      mountHeightM: 9,
      headingDeg: 0,
      status: 'degraded',
      ip: '10.40.3.12',
    },
    [
    { slot: 'production', name: 'Production CCTV', zone: 'Production floor', blindSpot: 'Welding bay behind the press and the steel columns', view: { yaw: 40, pitch: -14, fov: 30 } },
    { slot: 'warehouse', name: 'Warehouse CCTV', zone: 'Warehouse', blindSpot: 'Far side of the racking, behind the pallet stacks', view: { yaw: 262, pitch: -12, fov: 30 } },
    { slot: 'loading', name: 'Loading Area CCTV', zone: 'Loading area', blindSpot: 'Trailer bay partly screened by the forklift lane and the door frame', view: { yaw: 318, pitch: -9, fov: 28 } },
    { slot: 'entrance', name: 'Entrance CCTV', zone: 'Entrance', blindSpot: 'Turnstile entrance behind the door frame and gates', view: { yaw: 350, pitch: -24, fov: 26 } },
    ],
    { yaw: 124, pitch: -30, fov: 22 },
  ),
]

export const SELECTIONS: CameraSelection[] = SITES.flatMap((s) => [
  { id: `${s.id}:360`, siteId: s.id, kind: '360', label: s.cam360.name },
  { id: `${s.id}:ptz`, siteId: s.id, kind: 'ptz', label: s.ptz.name },
  { id: `${s.id}:combo`, siteId: s.id, kind: 'combo', label: `${s.name} — 360 + PTZ Combo` },
])

export const ALL_DEVICES: CameraDevice[] = SITES.flatMap((s) => [s.cam360, s.ptz, ...s.cctv])

export function getSite(siteId: string) {
  return SITES.find((s) => s.id === siteId)
}

export function getDevice(deviceId: string | null | undefined) {
  return deviceId ? ALL_DEVICES.find((d) => d.id === deviceId) : undefined
}

export function getSelection(id: string | null) {
  return id ? (SELECTIONS.find((s) => s.id === id) ?? null) : null
}

/** CCTV cameras are viewed from inside their premise's combo live view. */
export function selectionForDevice(device: CameraDevice): CameraSelection {
  const kind: SelectionKind = device.kind === 'cctv' ? 'combo' : device.kind
  return SELECTIONS.find((s) => s.siteId === device.siteId && s.kind === kind)!
}

export function selectionForCombo(siteId: string): CameraSelection {
  return SELECTIONS.find((s) => s.siteId === siteId && s.kind === 'combo')!
}

export function siteCenter(site: CameraSite) {
  return {
    lat: (site.cam360.lat + site.ptz.lat) / 2,
    lng: (site.cam360.lng + site.ptz.lng) / 2,
  }
}

export function siteStatus(site: CameraSite): DeviceStatus {
  const pair = [site.cam360.status, site.ptz.status]
  if (pair.every((s) => s === 'offline')) return 'offline'
  if (pair.some((s) => s !== 'online')) return 'degraded'
  return 'online'
}
