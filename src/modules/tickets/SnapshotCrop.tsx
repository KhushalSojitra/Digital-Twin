import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { alpha, Box, Button, IconButton, Slider, Typography, type Theme } from '@mui/material'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import ZoomInRoundedIcon from '@mui/icons-material/ZoomInRounded'
import ZoomOutRoundedIcon from '@mui/icons-material/ZoomOutRounded'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface Point {
  x: number
  y: number
}

type HandleKind = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type DragKind = 'move' | 'pan' | HandleKind

interface DragState {
  kind: DragKind
  startX: number
  startY: number
  box: Rect
  pan: Point
}

const MIN_BOX = 48
const MIN_ZOOM = 1
const MAX_ZOOM = 4

const HANDLES: { kind: HandleKind; left: string; top: string; cursor: string }[] = [
  { kind: 'nw', left: '0%', top: '0%', cursor: 'nwse-resize' },
  { kind: 'n', left: '50%', top: '0%', cursor: 'ns-resize' },
  { kind: 'ne', left: '100%', top: '0%', cursor: 'nesw-resize' },
  { kind: 'e', left: '100%', top: '50%', cursor: 'ew-resize' },
  { kind: 'se', left: '100%', top: '100%', cursor: 'nwse-resize' },
  { kind: 's', left: '50%', top: '100%', cursor: 'ns-resize' },
  { kind: 'sw', left: '0%', top: '100%', cursor: 'nesw-resize' },
  { kind: 'w', left: '0%', top: '50%', cursor: 'ew-resize' },
]

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Snapshot could not be loaded'))
    img.src = src
  })
}

interface Props {
  src: string
  onCancel: () => void
  onSave: (image: string) => void
}

/** Optional crop editor: drag/resize the crop box, drag the image to pan, zoom with the slider. */
export default function SnapshotCrop({ src, onCancel, onSave }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [failed, setFailed] = useState(false)
  const [stage, setStage] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 })
  const [box, setBox] = useState<Rect | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    loadImage(src)
      .then((img) => alive && setImage(img))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [src])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const baseScale = image && stage.w > 0 && stage.h > 0 ? Math.min(stage.w / image.naturalWidth, stage.h / image.naturalHeight) : 0
  const scale = baseScale * zoom

  const imageRect = useCallback(
    (z: number, p: Point): Rect => {
      const w = (image?.naturalWidth ?? 0) * baseScale * z
      const h = (image?.naturalHeight ?? 0) * baseScale * z
      return { x: stage.w / 2 + p.x - w / 2, y: stage.h / 2 + p.y - h / 2, w, h }
    },
    [image, baseScale, stage.w, stage.h],
  )

  const clampPan = useCallback(
    (p: Point, z: number): Point => {
      const rect = imageRect(z, { x: 0, y: 0 })
      const limitX = Math.max(0, (rect.w - stage.w) / 2)
      const limitY = Math.max(0, (rect.h - stage.h) / 2)
      return { x: clamp(p.x, -limitX, limitX), y: clamp(p.y, -limitY, limitY) }
    },
    [imageRect, stage.w, stage.h],
  )

  const allowedRect = useCallback(
    (z: number, p: Point): Rect => {
      const rect = imageRect(z, p)
      const left = Math.max(rect.x, 0)
      const top = Math.max(rect.y, 0)
      const right = Math.min(rect.x + rect.w, stage.w)
      const bottom = Math.min(rect.y + rect.h, stage.h)
      return { x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) }
    },
    [imageRect, stage.w, stage.h],
  )

  const clampBox = useCallback((b: Rect, allowed: Rect): Rect => {
    const w = Math.min(b.w, allowed.w)
    const h = Math.min(b.h, allowed.h)
    return { w, h, x: clamp(b.x, allowed.x, allowed.x + allowed.w - w), y: clamp(b.y, allowed.y, allowed.y + allowed.h - h) }
  }, [])

  useEffect(() => {
    if (!image || baseScale === 0 || box) return
    const allowed = allowedRect(1, { x: 0, y: 0 })
    const w = allowed.w * 0.84
    const h = allowed.h * 0.84
    setBox({ x: allowed.x + (allowed.w - w) / 2, y: allowed.y + (allowed.h - h) / 2, w, h })
  }, [image, baseScale, box, allowedRect])

  useEffect(() => {
    if (!box || baseScale === 0) return
    setPan((current) => clampPan(current, zoom))
    setBox((current) => (current ? clampBox(current, allowedRect(zoom, clampPan(pan, zoom))) : current))
    // Re-fit only when the stage is resized.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.w, stage.h])

  const applyView = (nextZoom: number, nextPan: Point) => {
    const safePan = clampPan(nextPan, nextZoom)
    setZoom(nextZoom)
    setPan(safePan)
    setBox((current) => (current ? clampBox(current, allowedRect(nextZoom, safePan)) : current))
  }

  const changeZoom = (nextZoom: number) => {
    const z = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM)
    const ratio = zoom > 0 ? z / zoom : 1
    applyView(z, { x: pan.x * ratio, y: pan.y * ratio })
  }

  const startDrag = (kind: DragKind) => (e: ReactPointerEvent) => {
    if (!box || e.button > 0) return
    e.stopPropagation()
    stageRef.current?.setPointerCapture(e.pointerId)
    dragRef.current = { kind, startX: e.clientX, startY: e.clientY, box, pan }
  }

  const handleMove = (e: ReactPointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY

    if (drag.kind === 'pan') {
      applyView(zoom, { x: drag.pan.x + dx, y: drag.pan.y + dy })
      return
    }

    const allowed = allowedRect(zoom, pan)
    if (drag.kind === 'move') {
      setBox(clampBox({ ...drag.box, x: drag.box.x + dx, y: drag.box.y + dy }, allowed))
      return
    }

    let left = drag.box.x
    let top = drag.box.y
    let right = drag.box.x + drag.box.w
    let bottom = drag.box.y + drag.box.h
    if (drag.kind.includes('w')) left = clamp(left + dx, allowed.x, right - MIN_BOX)
    if (drag.kind.includes('e')) right = clamp(right + dx, left + MIN_BOX, allowed.x + allowed.w)
    if (drag.kind.includes('n')) top = clamp(top + dy, allowed.y, bottom - MIN_BOX)
    if (drag.kind.includes('s')) bottom = clamp(bottom + dy, top + MIN_BOX, allowed.y + allowed.h)
    setBox({ x: left, y: top, w: right - left, h: bottom - top })
  }

  const endDrag = (e: ReactPointerEvent) => {
    if (!dragRef.current) return
    dragRef.current = null
    if (stageRef.current?.hasPointerCapture(e.pointerId)) stageRef.current.releasePointerCapture(e.pointerId)
  }

  const save = () => {
    if (!image || !box || scale === 0 || saving) return
    setSaving(true)
    const rect = imageRect(zoom, pan)
    const sx = clamp((box.x - rect.x) / scale, 0, image.naturalWidth - 1)
    const sy = clamp((box.y - rect.y) / scale, 0, image.naturalHeight - 1)
    const sw = clamp(box.w / scale, 1, image.naturalWidth - sx)
    const sh = clamp(box.h / scale, 1, image.naturalHeight - sy)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sw))
    canvas.height = Math.max(1, Math.round(sh))
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setSaving(false)
      return
    }
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    try {
      onSave(canvas.toDataURL('image/jpeg', 0.92))
    } catch {
      setSaving(false)
      setFailed(true)
    }
  }

  const display = image && baseScale > 0 ? imageRect(zoom, pan) : null
  const pillButtonSx = { borderRadius: 999, minWidth: 104, py: 1, fontWeight: 700, fontSize: 15, textTransform: 'none' as const }

  return (
    <Box
      role="group"
      aria-label="Crop snapshot"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: { xs: 360, md: 420 },
        overflow: 'hidden',
        borderRadius: '16px',
        border: 1,
        borderColor: (t: Theme) => alpha(t.palette.text.primary, 0.2),
        bgcolor: (t: Theme) => alpha(t.palette.text.primary, 0.04),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <IconButton size="small" onClick={onCancel} aria-label="Back without cropping">
          <ArrowBackRoundedIcon />
        </IconButton>
        <Typography component="h3" sx={{ fontSize: 18, fontWeight: 700 }}>
          Crop Image
        </Typography>
      </Box>

      <Box
        ref={stageRef}
        onPointerDown={startDrag('pan')}
        onPointerMove={handleMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={(e) => changeZoom(zoom - e.deltaY * 0.002)}
        sx={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', bgcolor: '#05080f', cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
      >
        {failed && (
          <Typography role="alert" variant="body2" sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'error.main' }}>
            This snapshot cannot be cropped.
          </Typography>
        )}
        {display && (
          <Box
            component="img"
            src={src}
            alt=""
            draggable={false}
            sx={{ position: 'absolute', left: display.x, top: display.y, width: display.w, height: display.h, maxWidth: 'none', pointerEvents: 'none' }}
          />
        )}
        {display && box && (
          <Box
            onPointerDown={startDrag('move')}
            sx={{
              position: 'absolute',
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
              border: '2px solid #fff',
              boxShadow: '0 0 0 9999px rgba(3, 7, 18, 0.55)',
              cursor: 'move',
              backgroundImage:
                'linear-gradient(to right, transparent calc(33.333% - 0.5px), rgba(255,255,255,0.55) calc(33.333% - 0.5px), rgba(255,255,255,0.55) calc(33.333% + 0.5px), transparent calc(33.333% + 0.5px), transparent calc(66.666% - 0.5px), rgba(255,255,255,0.55) calc(66.666% - 0.5px), rgba(255,255,255,0.55) calc(66.666% + 0.5px), transparent calc(66.666% + 0.5px)),' +
                'linear-gradient(to bottom, transparent calc(33.333% - 0.5px), rgba(255,255,255,0.55) calc(33.333% - 0.5px), rgba(255,255,255,0.55) calc(33.333% + 0.5px), transparent calc(33.333% + 0.5px), transparent calc(66.666% - 0.5px), rgba(255,255,255,0.55) calc(66.666% - 0.5px), rgba(255,255,255,0.55) calc(66.666% + 0.5px), transparent calc(66.666% + 0.5px))',
            }}
          >
            {HANDLES.map((handle) => (
              <Box
                key={handle.kind}
                onPointerDown={startDrag(handle.kind)}
                sx={{
                  position: 'absolute',
                  left: handle.left,
                  top: handle.top,
                  width: 14,
                  height: 14,
                  ml: '-7px',
                  mt: '-7px',
                  borderRadius: '50%',
                  bgcolor: '#fff',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
                  cursor: handle.cursor,
                  '&::after': { content: '""', position: 'absolute', inset: -9 },
                }}
              />
            ))}
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: '1 1 220px', minWidth: 0 }}>
          <IconButton size="small" onClick={() => changeZoom(zoom - 0.25)} aria-label="Zoom out" disabled={zoom <= MIN_ZOOM}>
            <ZoomOutRoundedIcon />
          </IconButton>
          <Slider
            size="small"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(_, value) => changeZoom(value as number)}
            aria-label="Zoom"
            sx={{ mx: 0.5 }}
          />
          <IconButton size="small" onClick={() => changeZoom(zoom + 0.25)} aria-label="Zoom in" disabled={zoom >= MAX_ZOOM}>
            <ZoomInRoundedIcon />
          </IconButton>
          <Typography variant="body2" sx={{ minWidth: 44, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(zoom * 100)}%
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
          <Button type="button" variant="outlined" color="inherit" onClick={onCancel} sx={{ ...pillButtonSx, borderColor: (t: Theme) => alpha(t.palette.text.primary, 0.34) }}>
            Cancel
          </Button>
          <Button type="button" variant="contained" onClick={save} disabled={!box || saving || failed} sx={pillButtonSx}>
            Save Crop
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
