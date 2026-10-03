import * as THREE from 'three'
import { directionToVector, type Direction } from '../earth/panoramaMath'

/**
 * Renders still frames from a site panorama off-screen, using the same projection as the live
 * viewer so a snapshot matches what the operator saw. Used for historical tickets whose camera
 * is not currently open.
 */

export type SnapshotTreatment = 'before' | 'after' | 'none'

const WIDTH = 480
const HEIGHT = 300

/** Completed work reads brighter and cleaner than the frame that raised the ticket. */
const TREATMENT_FILTER: Record<SnapshotTreatment, string> = {
  before: 'brightness(0.84) saturate(0.72) contrast(0.96)',
  after: 'brightness(1.08) saturate(1.1) contrast(1.02)',
  none: 'none',
}

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let material: THREE.MeshBasicMaterial | null = null
let camera: THREE.PerspectiveCamera | null = null

const textures = new Map<string, Promise<THREE.Texture>>()

function loadTexture(src: string) {
  let pending = textures.get(src)
  if (!pending) {
    pending = new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(
        src,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          resolve(tex)
        },
        undefined,
        (err) => {
          textures.delete(src)
          reject(err)
        },
      )
    })
    textures.set(src, pending)
  }
  return pending
}

function ensureStage() {
  if (renderer && scene && camera && material) return { renderer, scene, camera, material }
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(WIDTH, HEIGHT, false)
  scene = new THREE.Scene()
  const geometry = new THREE.SphereGeometry(500, 72, 48)
  geometry.scale(-1, 1, 1)
  material = new THREE.MeshBasicMaterial({ color: 0x000000 })
  scene.add(new THREE.Mesh(geometry, material))
  camera = new THREE.PerspectiveCamera(30, WIDTH / HEIGHT, 0.1, 1100)
  return { renderer, scene, camera, material }
}

/** Applies the treatment and re-encodes, so snapshots stay small enough to keep in memory. */
export function toTreatedDataUrl(source: CanvasImageSource, treatment: SnapshotTreatment = 'none') {
  const out = document.createElement('canvas')
  out.width = WIDTH
  out.height = HEIGHT
  const ctx = out.getContext('2d')
  if (!ctx) return ''
  if (treatment !== 'none') ctx.filter = TREATMENT_FILTER[treatment]
  ctx.drawImage(source, 0, 0, WIDTH, HEIGHT)
  return out.toDataURL('image/jpeg', 0.72)
}

export async function renderSnapshot(src: string, dir: Direction, fov = 30, treatment: SnapshotTreatment = 'none') {
  const texture = await loadTexture(src)
  const stage = ensureStage()
  stage.material.map = texture
  stage.material.color.set(0xffffff)
  stage.material.needsUpdate = true
  stage.camera.fov = fov
  stage.camera.updateProjectionMatrix()
  stage.camera.lookAt(directionToVector(dir))
  stage.renderer.render(stage.scene, stage.camera)
  return toTreatedDataUrl(stage.renderer.domElement, treatment)
}
