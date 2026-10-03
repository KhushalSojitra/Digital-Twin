export type DeviceKind = '360' | 'ptz'
export type SelectionKind = '360' | 'ptz' | 'combo'
export type DeviceStatus = 'online' | 'degraded' | 'offline'

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
}

export interface CameraSite {
  id: string
  name: string
  description: string
  panorama: string
  cam360: CameraDevice
  ptz: CameraDevice
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
  center: [-74.0345, 40.6965] as [number, number],
  zoom: 14.4,
  pitch: 58,
  bearing: -22,
  label: 'New York Harbor — Liberty District',
}

const site = (
  id: string,
  name: string,
  description: string,
  panorama: string,
  cam360: Omit<CameraDevice, 'siteId' | 'kind' | 'id' | 'streamLabel'>,
  ptz: Omit<CameraDevice, 'siteId' | 'kind' | 'id' | 'streamLabel'>,
  home: CameraSite['home'],
): CameraSite => ({
  id,
  name,
  description,
  panorama,
  home,
  cam360: { ...cam360, id: `${id}-360`, siteId: id, kind: '360', streamLabel: '360° · 5760×2880 · 30 fps' },
  ptz: { ...ptz, id: `${id}-ptz`, siteId: id, kind: 'ptz', streamLabel: 'PTZ · 3840×2160 · 60 fps · 40× optical' },
})

export const SITES: CameraSite[] = [
  site(
    'liberty',
    'Liberty Island',
    'Statue of Liberty pedestal & promenade perimeter',
    '/panoramas/canary_wharf.jpg',
    {
      name: 'Liberty 360 — Pedestal',
      model: 'OE-360 Ultra',
      lat: 40.68935,
      lng: -74.04455,
      mountHeightM: 14,
      headingDeg: 35,
      status: 'online',
      ip: '10.20.1.11',
    },
    {
      name: 'Liberty PTZ — Promenade',
      model: 'OE-PTZ 40X',
      lat: 40.68992,
      lng: -74.04578,
      mountHeightM: 9,
      headingDeg: 120,
      status: 'online',
      ip: '10.20.1.12',
    },
    { yaw: 20, pitch: -2, fov: 20 },
  ),
  site(
    'ellis',
    'Ellis Island',
    'Ferry landing, museum entrance and north seawall',
    '/panoramas/urban_street_01.jpg',
    {
      name: 'Ellis 360 — Ferry Landing',
      model: 'OE-360 Ultra',
      lat: 40.69935,
      lng: -74.03955,
      mountHeightM: 11,
      headingDeg: 200,
      status: 'online',
      ip: '10.20.2.11',
    },
    {
      name: 'Ellis PTZ — North Seawall',
      model: 'OE-PTZ 40X',
      lat: 40.69885,
      lng: -74.04095,
      mountHeightM: 8,
      headingDeg: 10,
      status: 'degraded',
      ip: '10.20.2.12',
    },
    { yaw: -60, pitch: -1, fov: 18 },
  ),
  site(
    'battery',
    'Battery Park',
    'Ferry terminal approach and waterfront esplanade',
    '/panoramas/shanghai_bund.jpg',
    {
      name: 'Battery 360 — Esplanade',
      model: 'OE-360 Ultra',
      lat: 40.70318,
      lng: -74.0161,
      mountHeightM: 12,
      headingDeg: 260,
      status: 'online',
      ip: '10.20.3.11',
    },
    {
      name: 'Battery PTZ — Terminal',
      model: 'OE-PTZ 40X',
      lat: 40.70255,
      lng: -74.01475,
      mountHeightM: 10,
      headingDeg: 300,
      status: 'online',
      ip: '10.20.3.12',
    },
    { yaw: 90, pitch: -2, fov: 20 },
  ),
]

export const SELECTIONS: CameraSelection[] = SITES.flatMap((s) => [
  { id: `${s.id}:360`, siteId: s.id, kind: '360', label: s.cam360.name },
  { id: `${s.id}:ptz`, siteId: s.id, kind: 'ptz', label: s.ptz.name },
  { id: `${s.id}:combo`, siteId: s.id, kind: 'combo', label: `${s.name} — 360 + PTZ Combo` },
])

export const ALL_DEVICES: CameraDevice[] = SITES.flatMap((s) => [s.cam360, s.ptz])

export function getSite(siteId: string) {
  return SITES.find((s) => s.id === siteId)
}

export function getSelection(id: string | null) {
  return id ? (SELECTIONS.find((s) => s.id === id) ?? null) : null
}

export function selectionForDevice(device: CameraDevice): CameraSelection {
  return SELECTIONS.find((s) => s.siteId === device.siteId && s.kind === device.kind)!
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
