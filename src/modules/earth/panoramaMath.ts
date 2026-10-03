import * as THREE from 'three'

export interface View {
  /** Pan angle in degrees. */
  yaw: number
  /** Tilt angle in degrees, positive looks up. */
  pitch: number
  /** Vertical field of view in degrees. */
  fov: number
}

export interface Direction {
  yaw: number
  pitch: number
}

const DEG = Math.PI / 180

/** Unit vector for a yaw/pitch pair, using the same convention as the sphere texture mapping. */
export function directionToVector(dir: Direction, out = new THREE.Vector3()) {
  const phi = (90 - dir.pitch) * DEG
  const theta = dir.yaw * DEG
  return out.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta))
}

export function vectorToDirection(v: THREE.Vector3): Direction {
  const n = v.clone().normalize()
  return {
    pitch: Math.asin(Math.max(-1, Math.min(1, n.y))) / DEG,
    yaw: Math.atan2(n.z, n.x) / DEG,
  }
}

/** Approximate optical zoom factor relative to a 60° reference lens. */
export function zoomFactor(fov: number) {
  return 60 / fov
}
