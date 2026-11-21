import * as THREE from 'three'
import { directionToVector, vectorToDirection } from '../earth/panoramaMath'
import type { PinView } from '../../data/tickets'

/** Snapshot frames are 480 × 300 (see PanoramaViewer.captureAt and snapshotRenderer). */
export const SNAPSHOT_ASPECT = 480 / 300

/**
 * How the user adjusted the creation snapshot: zoom (1 = as captured) and the centre of the visible area
 * as a fraction of the original frame (0.5, 0.5 = unchanged).
 */
export interface SnapshotAdjust {
  zoom: number
  u: number
  v: number
}

/** Field of view used when a ticket has no stored camera view (matches the live capture default). */
export const DEFAULT_SNAPSHOT_FOV = 26

/** Where the snapshot should be framed: the stored creation framing, else the pinned camera view, else around the pin. */
export function snapshotFraming(ticket: { yaw: number; pitch: number; pinView?: PinView; snapshots?: { before?: { view?: PinView } } }): PinView {
  return ticket.snapshots?.before?.view ?? ticket.pinView ?? { yaw: ticket.yaw, pitch: ticket.pitch, fov: DEFAULT_SNAPSHOT_FOV }
}

export const NO_ADJUST: SnapshotAdjust = { zoom: 1, u: 0.5, v: 0.5 }

export const isAdjusted = (adjust: SnapshotAdjust) =>
  Math.abs(adjust.zoom - 1) > 1e-3 || Math.abs(adjust.u - 0.5) > 1e-3 || Math.abs(adjust.v - 0.5) > 1e-3

const DEG = Math.PI / 180

/**
 * Turns the camera view a snapshot was taken at, plus the user's zoom and position adjustment, into one
 * camera framing (centre direction + vertical field of view). Capturing at this framing gives the area the
 * user chose; the completion ("after") snapshot is captured at the same framing so both pictures match.
 */
export function frameFromAdjust(view: PinView, adjust: SnapshotAdjust): PinView {
  if (!isAdjusted(adjust)) return view
  const camera = new THREE.PerspectiveCamera(view.fov, SNAPSHOT_ASPECT, 0.1, 1100)
  camera.position.set(0, 0, 0)
  camera.lookAt(directionToVector(view))
  camera.updateMatrixWorld(true)
  // Point of the original frame the user centred on (NDC: x right, y up).
  const point = new THREE.Vector3(adjust.u * 2 - 1, 1 - adjust.v * 2, 0.5).unproject(camera)
  const centre = vectorToDirection(point)
  const fov = (2 * Math.atan(Math.tan((view.fov * DEG) / 2) / adjust.zoom)) / DEG
  return { yaw: centre.yaw, pitch: centre.pitch, fov }
}
