import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react'
import { Box } from '@mui/material'
import * as THREE from 'three'
import { directionToVector, vectorToDirection, type Direction, type View } from './panoramaMath'
import { clamp, wrapDeg } from '../../utils/format'
import { ProjectionContext, type FrameListener, type ProjectionHub, type ViewerApi } from './viewerProjection'
import { toTreatedDataUrl } from '../tickets/snapshotRenderer'

export type ViewerStatus = 'loading' | 'ready' | 'error'

interface Props {
  src: string
  /** Commanded (target) orientation. The rendered view eases toward it. */
  view: View
  fovRange: [number, number]
  pitchRange: [number, number]
  /** Rate (1/s) at which the rendered view closes on the target. Higher is snappier. */
  smoothing?: number
  onViewChange: (view: View) => void
  onPointClick?: (dir: Direction, screen: { clientX: number; clientY: number }) => void
  onPointContextMenu?: (dir: Direction, screen: { clientX: number; clientY: number }) => void
  onStatus?: (status: ViewerStatus) => void
  /** Rendered orientation, reported ~10×/s while in motion and once when settled. */
  onCurrentChange?: (view: View) => void
  /** Fires once each time the rendered view reaches the commanded target. */
  onSettled?: () => void
  /** Draws a frame on this viewer showing where the paired camera is aimed. */
  pairedView?: View | null
  pairedColor?: string
  cssFilter?: string
  /** Receives a handle for grabbing still frames from this camera. */
  apiRef?: MutableRefObject<ViewerApi | null>
  /** Shows a crosshair cursor, signalling that the next click picks a location. */
  pickCursor?: boolean
  children?: ReactNode
}

const textureCache = new Map<string, Promise<THREE.Texture>>()

const MAX_TEXTURE_WIDTH = 4096
const SHARPEN_AMOUNT = 0.45

/** Light 3×3 unsharp pass that restores edge contrast lost to upscaling. */
function sharpen(ctx: CanvasRenderingContext2D, width: number, height: number, amount: number) {
  const image = ctx.getImageData(0, 0, width, height)
  const src = image.data
  const out = new Uint8ClampedArray(src.length)
  const stride = width * 4
  for (let y = 0; y < height; y++) {
    const up = Math.max(0, y - 1) * stride
    const row = y * stride
    const down = Math.min(height - 1, y + 1) * stride
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - 1) * 4
      const mid = x * 4
      const right = Math.min(width - 1, x + 1) * 4
      for (let c = 0; c < 3; c++) {
        const centre = src[row + mid + c]
        const blur = (src[up + mid + c] + src[down + mid + c] + src[row + left + c] + src[row + right + c]) / 4
        out[row + mid + c] = centre + (centre - blur) * amount
      }
      out[row + mid + 3] = 255
    }
  }
  image.data.set(out)
  ctx.putImageData(image, 0, 0)
}

/**
 * Small source panoramas are upscaled once with high-quality resampling (instead of per-frame bilinear
 * magnification) and lightly sharpened. Sources that are already large are used untouched.
 */
function buildTexture(image: HTMLImageElement): THREE.Texture {
  const scale = image.naturalWidth >= 3000 ? 1 : Math.min(2, MAX_TEXTURE_WIDTH / image.naturalWidth)
  let tex: THREE.Texture
  if (scale > 1) {
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(image.naturalWidth * scale)
    canvas.height = Math.round(image.naturalHeight * scale)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx) {
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      sharpen(ctx, canvas.width, canvas.height, SHARPEN_AMOUNT)
      tex = new THREE.CanvasTexture(canvas)
    } else {
      tex = new THREE.Texture(image)
    }
  } else {
    tex = new THREE.Texture(image)
  }
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

function loadTexture(src: string) {
  let pending = textureCache.get(src)
  if (!pending) {
    pending = new Promise<THREE.Texture>((resolve, reject) => {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.onload = () => resolve(buildTexture(image))
      image.onerror = (err) => {
        textureCache.delete(src)
        reject(err)
      }
      image.src = src
    })
    textureCache.set(src, pending)
  }
  return pending
}

const SETTLE_EPS = 0.02

/** Ease `current` toward `target`; returns true when there is still visible motion left. */
function approach(current: View, target: View, alpha: number): boolean {
  const dYaw = wrapDeg(target.yaw - current.yaw)
  const dPitch = target.pitch - current.pitch
  const dFov = target.fov - current.fov
  if (Math.abs(dYaw) < SETTLE_EPS && Math.abs(dPitch) < SETTLE_EPS && Math.abs(dFov) < SETTLE_EPS) {
    current.yaw = target.yaw
    current.pitch = target.pitch
    current.fov = target.fov
    return false
  }
  current.yaw = wrapDeg(current.yaw + dYaw * alpha)
  current.pitch += dPitch * alpha
  current.fov += dFov * alpha
  return true
}

export default function PanoramaViewer({
  src,
  view,
  fovRange,
  pitchRange,
  smoothing = 8,
  onViewChange,
  onPointClick,
  onPointContextMenu,
  onStatus,
  onCurrentChange,
  onSettled,
  pairedView,
  pairedColor = '#0A84FF',
  cssFilter,
  apiRef,
  pickCursor,
  children,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const targetRef = useRef<View>(view)
  const currentRef = useRef<View>({ ...view })
  const pairedTargetRef = useRef<View | null | undefined>(pairedView)
  const pairedCurrentRef = useRef<View | null>(pairedView ? { ...pairedView } : null)
  const movingRef = useRef(false)
  const draggingRef = useRef(false)
  const committedViewsRef = useRef(new WeakSet<View>())
  const dirtyRef = useRef(true)
  const rangesRef = useRef({ fovRange, pitchRange })
  const smoothingRef = useRef(smoothing)
  const callbacksRef = useRef({ onViewChange, onPointClick, onPointContextMenu, onStatus, onCurrentChange, onSettled })
  const listenersRef = useRef(new Set<FrameListener>())
  const hub = useMemo<ProjectionHub>(
    () => ({
      subscribe: (listener) => {
        listenersRef.current.add(listener)
        dirtyRef.current = true
        return () => {
          listenersRef.current.delete(listener)
        }
      },
      requestFrame: () => {
        dirtyRef.current = true
      },
    }),
    [],
  )

  useEffect(() => {
    callbacksRef.current = { onViewChange, onPointClick, onPointContextMenu, onStatus, onCurrentChange, onSettled }
  })

  useEffect(() => {
    rangesRef.current = { fovRange, pitchRange }
    smoothingRef.current = smoothing
  }, [fovRange, pitchRange, smoothing])

  useEffect(() => {
    // Views produced by dragging are already applied; echoing them back would pull the camera backwards.
    if (draggingRef.current || committedViewsRef.current.has(view)) return
    targetRef.current = view
    movingRef.current = true
    dirtyRef.current = true
  }, [view])

  useEffect(() => {
    pairedTargetRef.current = pairedView
    if (pairedView && !pairedCurrentRef.current) pairedCurrentRef.current = { ...pairedView }
    if (!pairedView) pairedCurrentRef.current = null
    dirtyRef.current = true
  }, [pairedView])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.touchAction = 'none'
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(currentRef.current.fov, 1, 0.1, 1100)
    const geometry = new THREE.SphereGeometry(500, 80, 56)
    geometry.scale(-1, 1, 1)
    const material = new THREE.MeshBasicMaterial({ color: 0x000000 })
    const sphere = new THREE.Mesh(geometry, material)
    scene.add(sphere)

    let disposed = false
    callbacksRef.current.onStatus?.('loading')
    loadTexture(src).then(
      (tex) => {
        if (disposed) return
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
        material.map = tex
        material.color.set(0xffffff)
        material.needsUpdate = true
        dirtyRef.current = true
        callbacksRef.current.onStatus?.('ready')
      },
      () => {
        if (!disposed) callbacksRef.current.onStatus?.('error')
      },
    )

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      if (w === 0 || h === 0) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      dirtyRef.current = true
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    const lookTarget = new THREE.Vector3()
    const projected = new THREE.Vector3()

    const updatePairedFrame = () => {
      const frame = frameRef.current
      if (!frame) return
      const paired = pairedCurrentRef.current
      if (!paired) {
        frame.style.display = 'none'
        return
      }
      directionToVector(paired, projected)
      const facing = projected.dot(camera.getWorldDirection(lookTarget)) > 0.05
      projected.project(camera)
      if (!facing || Math.abs(projected.x) > 1.4 || Math.abs(projected.y) > 1.4) {
        frame.style.display = 'none'
        return
      }
      const w = host.clientWidth
      const h = host.clientHeight
      const x = ((projected.x + 1) / 2) * w
      const y = ((1 - projected.y) / 2) * h
      const frameH = (paired.fov / currentRef.current.fov) * h
      const frameW = frameH * (16 / 9)
      frame.style.display = 'block'
      frame.style.width = `${Math.max(28, frameW)}px`
      frame.style.height = `${Math.max(16, frameH)}px`
      frame.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
    }

    const projVec = new THREE.Vector3()
    const camDir = new THREE.Vector3()
    const project = (dir: Direction) => {
      directionToVector(dir, projVec)
      const facing = projVec.dot(camera.getWorldDirection(camDir)) > 0.05
      projVec.project(camera)
      const visible = facing && Math.abs(projVec.x) <= 1.15 && Math.abs(projVec.y) <= 1.15
      return {
        x: ((projVec.x + 1) / 2) * host.clientWidth,
        y: ((1 - projVec.y) / 2) * host.clientHeight,
        visible,
      }
    }

    // Snapshots re-render the scene through a dedicated camera so the frame is centred on the
    // requested direction regardless of where the operator is currently looking.
    const snapCamera = new THREE.PerspectiveCamera(30, 480 / 300, 0.1, 1100)
    const snapTarget = new THREE.WebGLRenderTarget(480, 300)
    // Off-screen targets are linear by default; tag it sRGB so grabbed frames match the canvas.
    snapTarget.texture.colorSpace = THREE.SRGBColorSpace
    const snapBuffer = new Uint8Array(480 * 300 * 4)
    const snapCanvas = document.createElement('canvas')
    snapCanvas.width = 480
    snapCanvas.height = 300

    const markVec = new THREE.Vector3()
    const markInFrame = (mark: Direction, centre: THREE.Vector3) => {
      directionToVector(mark, markVec)
      if (markVec.dot(centre) < 0.2) return false
      markVec.project(snapCamera)
      return Math.abs(markVec.x) <= 0.82 && Math.abs(markVec.y) <= 0.82
    }

    const captureAt: ViewerApi['captureAt'] = (dir, fov = 30, treatment = 'none', marks = []) => {
      if (!material.map) return null
      const centre = directionToVector(dir).clone()
      snapCamera.lookAt(centre)
      let frameFov = fov
      for (let attempt = 0; attempt < 8; attempt++) {
        snapCamera.fov = frameFov
        snapCamera.updateProjectionMatrix()
        snapCamera.updateMatrixWorld(true)
        if (marks.every((mark) => markInFrame(mark, centre))) break
        frameFov = Math.min(110, frameFov * 1.18)
      }
      renderer.setRenderTarget(snapTarget)
      renderer.render(scene, snapCamera)
      renderer.readRenderTargetPixels(snapTarget, 0, 0, 480, 300, snapBuffer)
      renderer.setRenderTarget(null)
      dirtyRef.current = true
      const ctx = snapCanvas.getContext('2d')
      if (!ctx) return null
      const image = ctx.createImageData(480, 300)
      // WebGL reads bottom-up; flip into canvas order.
      for (let y = 0; y < 300; y++) {
        const src = (299 - y) * 480 * 4
        image.data.set(snapBuffer.subarray(src, src + 480 * 4), y * 480 * 4)
      }
      ctx.putImageData(image, 0, 0)

      const pins: { x: number; y: number }[] = []
      for (const mark of marks) {
        directionToVector(mark, markVec)
        if (markVec.dot(centre) <= 0) continue
        markVec.project(snapCamera)
        pins.push({ x: ((markVec.x + 1) / 2) * 480, y: ((1 - markVec.y) / 2) * 300 })
      }
      return toTreatedDataUrl(snapCanvas, treatment, (out) => {
        for (const pin of pins) {
          out.save()
          out.translate(pin.x, pin.y)
          out.lineCap = 'round'
          const stroke = (style: string, width: number) => {
            out.strokeStyle = style
            out.lineWidth = width
            out.beginPath()
            out.arc(0, 0, 13, 0, Math.PI * 2)
            for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              out.moveTo(sx * 17, sy * 17)
              out.lineTo(sx * 25, sy * 25)
            }
            out.stroke()
          }
          stroke('#ffffff', 7)
          stroke('#0A84FF', 3.5)
          out.fillStyle = '#ffffff'
          out.beginPath()
          out.arc(0, 0, 5.5, 0, Math.PI * 2)
          out.fill()
          out.fillStyle = '#0A84FF'
          out.beginPath()
          out.arc(0, 0, 3.5, 0, Math.PI * 2)
          out.fill()
          out.restore()
        }
      })
    }
    if (apiRef) apiRef.current = { captureAt }

    let raf = 0
    let last = performance.now()
    let lastReport = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now

      // Commands glide like a motorised head; dragging bypasses easing and writes the view directly.
      const alpha = 1 - Math.exp(-smoothingRef.current * dt)

      if (draggingRef.current && now - lastReport > 100) {
        lastReport = now
        callbacksRef.current.onCurrentChange?.({ ...currentRef.current })
      }

      let stillMoving = false
      if (movingRef.current) {
        stillMoving = approach(currentRef.current, targetRef.current, alpha)
        dirtyRef.current = true
        if (!stillMoving) {
          movingRef.current = false
          callbacksRef.current.onCurrentChange?.({ ...currentRef.current })
          callbacksRef.current.onSettled?.()
        } else if (now - lastReport > 100) {
          lastReport = now
          callbacksRef.current.onCurrentChange?.({ ...currentRef.current })
        }
      }

      const pairedTarget = pairedTargetRef.current
      if (pairedTarget && pairedCurrentRef.current) {
        if (approach(pairedCurrentRef.current, pairedTarget, alpha)) dirtyRef.current = true
      }

      if (!dirtyRef.current) return
      dirtyRef.current = false
      const v = currentRef.current
      camera.fov = v.fov
      camera.updateProjectionMatrix()
      directionToVector(v, lookTarget)
      camera.lookAt(lookTarget)
      renderer.render(scene, camera)
      updatePairedFrame()
      if (listenersRef.current.size) {
        const size = { width: host.clientWidth, height: host.clientHeight }
        listenersRef.current.forEach((fn) => fn(project, size))
      }
    }
    raf = requestAnimationFrame(loop)

    // ----- interaction -----
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    let pointerId: number | null = null
    let startX = 0
    let startY = 0
    let lastX = 0
    let lastY = 0
    let moved = 0
    let downAt = 0
    let holdTimer: number | null = null
    let holdOpened = false
    let lastTapAt = 0
    let lastTapX = 0
    let lastTapY = 0

    const commit = (next: Partial<View>) => {
      const { fovRange: fr, pitchRange: pr } = rangesRef.current
      const base = targetRef.current
      const merged: View = {
        yaw: wrapDeg(next.yaw ?? base.yaw),
        pitch: clamp(next.pitch ?? base.pitch, pr[0], pr[1]),
        fov: clamp(next.fov ?? base.fov, fr[0], fr[1]),
      }
      targetRef.current = merged
      movingRef.current = true
      callbacksRef.current.onViewChange(merged)
    }

    /** Applies a drag straight to the rendered view so the panorama stays under the cursor. */
    const dragTo = (next: View) => {
      targetRef.current = next
      currentRef.current = { ...next }
      movingRef.current = false
      dirtyRef.current = true
      committedViewsRef.current.add(next)
      callbacksRef.current.onViewChange(next)
    }

    const pickAt = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect()
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1))
      raycaster.setFromCamera(ndc, camera)
      return vectorToDirection(raycaster.ray.direction)
    }

    const clearHold = () => {
      if (holdTimer !== null) {
        window.clearTimeout(holdTimer)
        holdTimer = null
      }
    }

    const openTicketMenu = (clientX: number, clientY: number) => {
      callbacksRef.current.onPointContextMenu?.(pickAt(clientX, clientY), { clientX, clientY })
    }

    // Long-press is only for real touch screens. Trackpads often report pointerType
    // "touch" but remain pointer:fine — those must pan/aim, not open Create Ticket.
    const isCoarseTouch = (e: PointerEvent) =>
      e.pointerType === 'touch' && window.matchMedia('(pointer: coarse)').matches

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || pointerId !== null) return
      pointerId = e.pointerId
      startX = lastX = e.clientX
      startY = lastY = e.clientY
      moved = 0
      downAt = performance.now()
      holdOpened = false
      draggingRef.current = true
      // Grabbing mid-glide freezes the view where it is.
      targetRef.current = { ...currentRef.current }
      movingRef.current = false
      renderer.domElement.setPointerCapture(e.pointerId)
      renderer.domElement.style.cursor = 'grabbing'
      if (isCoarseTouch(e) && callbacksRef.current.onPointContextMenu) {
        holdTimer = window.setTimeout(() => {
          holdTimer = null
          if (moved >= 8) return
          holdOpened = true
          draggingRef.current = false
          openTicketMenu(startX, startY)
        }, 550)
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      moved += Math.abs(dx) + Math.abs(dy)
      if (moved >= 8) clearHold()
      if (holdOpened) return
      if (dx === 0 && dy === 0) return
      const base = currentRef.current
      // Exact angular size of a pixel at the view centre, so the scene follows the cursor 1:1.
      const degPerPx = THREE.MathUtils.radToDeg((2 * Math.tan(THREE.MathUtils.degToRad(base.fov) / 2)) / host.clientHeight)
      const pr = rangesRef.current.pitchRange
      dragTo({
        yaw: wrapDeg(base.yaw - dx * degPerPx),
        pitch: clamp(base.pitch + dy * degPerPx, pr[0], pr[1]),
        fov: base.fov,
      })
    }

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      pointerId = null
      draggingRef.current = false
      callbacksRef.current.onCurrentChange?.({ ...currentRef.current })
      renderer.domElement.style.cursor = 'grab'
      clearHold()
      if (holdOpened) {
        holdOpened = false
        return
      }
      const isClick = moved < 6 && performance.now() - downAt < 500
      if (isClick) {
        const now = performance.now()
        const doubled = now - lastTapAt < 320 && Math.hypot(startX - lastTapX, startY - lastTapY) < 12
        lastTapAt = now
        lastTapX = startX
        lastTapY = startY
        if (doubled || e.detail >= 2) {
          openTicketMenu(startX, startY)
          return
        }
        callbacksRef.current.onPointClick?.(pickAt(startX, startY), { clientX: startX, clientY: startY })
      }
    }

    const onClick = (e: MouseEvent) => {
      if (e.detail < 2) return
      e.preventDefault()
      openTicketMenu(e.clientX, e.clientY)
    }

    const onDblClick = (e: MouseEvent) => {
      e.preventDefault()
      if (!callbacksRef.current.onPointContextMenu) return
      openTicketMenu(e.clientX, e.clientY)
    }

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      if (!callbacksRef.current.onPointContextMenu) return
      if (holdOpened) return
      if (pointerId !== null && moved >= 8) return
      openTicketMenu(e.clientX, e.clientY)
    }

    const onForceWillBegin = (e: Event) => e.preventDefault()
    const onForceDown = (e: Event) => {
      e.preventDefault()
      const mouse = e as MouseEvent
      if (pointerId !== null && moved >= 8) return
      openTicketMenu(mouse.clientX, mouse.clientY)
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const scale = Math.exp(e.deltaY * 0.0015)
      commit({ fov: targetRef.current.fov * scale })
    }

    const el = renderer.domElement
    el.style.cursor = 'grab'
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    el.addEventListener('click', onClick)
    el.addEventListener('dblclick', onDblClick)
    el.addEventListener('contextmenu', onContextMenu)
    el.addEventListener('webkitmouseforcewillbegin', onForceWillBegin)
    el.addEventListener('webkitmouseforcedown', onForceDown)
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      disposed = true
      clearHold()
      if (apiRef) apiRef.current = null
      snapTarget.dispose()
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      el.removeEventListener('click', onClick)
      el.removeEventListener('dblclick', onDblClick)
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('webkitmouseforcewillbegin', onForceWillBegin)
      el.removeEventListener('webkitmouseforcedown', onForceDown)
      el.removeEventListener('wheel', onWheel)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      host.removeChild(el)
    }
  }, [src, apiRef])

  return (
    <Box sx={{ position: 'absolute', inset: 0, overflow: 'hidden', bgcolor: '#000' }}>
      <Box
        ref={hostRef}
        sx={{
          position: 'absolute',
          inset: 0,
          filter: cssFilter,
          '& canvas': {
            width: '100% !important',
            height: '100% !important',
            ...(pickCursor ? { cursor: 'crosshair !important' } : {}),
          },
        }}
      />
      <Box
        ref={frameRef}
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          display: 'none',
          pointerEvents: 'none',
          border: `2px solid ${pairedColor}`,
          borderRadius: '6px',
          boxShadow: `0 0 0 1px rgba(0,0,0,0.45), 0 0 18px ${pairedColor}66`,
          '&::after': {
            content: '""',
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: pairedColor,
            transform: 'translate(-50%, -50%)',
          },
        }}
      />
      <ProjectionContext.Provider value={hub}>{children}</ProjectionContext.Provider>
    </Box>
  )
}
