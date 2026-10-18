import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Box, Button, IconButton, Popover, SvgIcon, Tooltip, type SvgIconProps } from '@mui/material'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import TitleRoundedIcon from '@mui/icons-material/TitleRounded'
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded'
import CheckBoxOutlineBlankRoundedIcon from '@mui/icons-material/CheckBoxOutlineBlankRounded'
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded'
import UndoRoundedIcon from '@mui/icons-material/UndoRounded'
import RedoRoundedIcon from '@mui/icons-material/RedoRounded'
import FormatBoldRoundedIcon from '@mui/icons-material/FormatBoldRounded'
import FormatAlignLeftRoundedIcon from '@mui/icons-material/FormatAlignLeftRounded'
import FormatListBulletedRoundedIcon from '@mui/icons-material/FormatListBulletedRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import MicRoundedIcon from '@mui/icons-material/MicRounded'
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded'

interface Point {
  x: number
  y: number
}

/** Shape coordinates are normalised (0–1) to the snapshot image itself, so they line up in every view size. */
export type MarkupShape =
  | { kind: 'pen'; color: string; points: Point[] }
  | { kind: 'ellipse'; color: string; a: Point; b: Point }
  | { kind: 'rect'; color: string; a: Point; b: Point }
  | { kind: 'text'; color: string; at: Point; text: string; boxColor?: string; fontSize?: number; bold?: boolean; align?: 'left' | 'center' | 'right' }

type Tool = 'pen' | 'text' | 'ellipse' | 'rect' | 'eraser'

const COLORS = ['#ef4444', '#111827', '#facc15', '#22c55e', '#3b82f6', '#ffffff']
const STROKE = 3.5
const FONT_SIZE = 20
const FONT_FAMILY = 'Inter, system-ui, sans-serif'
const ERASE_RADIUS = 10
const REFERENCE_WIDTH = 720
const MOVE_THRESHOLD = 3

function EraserIcon(props: SvgIconProps) {
  return (
    <SvgIcon {...props}>
      <path d="M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.008 4.008 0 0 1-5.66 0L2.81 17c-.78-.79-.78-2.05 0-2.84l10.6-10.6c.79-.78 2.05-.78 2.83 0zM4.22 15.58l3.54 3.53c.78.79 2.04.79 2.83 0l3.53-3.53-4.95-4.95-4.95 4.95z" />
    </SvgIcon>
  )
}

function drawShapes(ctx: CanvasRenderingContext2D, shapes: MarkupShape[], toPx: (p: Point) => Point, unit: number) {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const shape of shapes) {
    ctx.strokeStyle = shape.color
    ctx.fillStyle = shape.color
    ctx.lineWidth = STROKE * unit
    if (shape.kind === 'pen') {
      if (shape.points.length === 1) {
        const q = toPx(shape.points[0])
        ctx.beginPath()
        ctx.arc(q.x, q.y, (STROKE / 2) * unit, 0, Math.PI * 2)
        ctx.fill()
        continue
      }
      ctx.beginPath()
      shape.points.forEach((p, i) => {
        const q = toPx(p)
        if (i === 0) ctx.moveTo(q.x, q.y)
        else ctx.lineTo(q.x, q.y)
      })
      ctx.stroke()
    } else if (shape.kind === 'rect') {
      const a = toPx(shape.a)
      const b = toPx(shape.b)
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))
    } else if (shape.kind === 'ellipse') {
      const a = toPx(shape.a)
      const b = toPx(shape.b)
      ctx.beginPath()
      ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      const q = toPx(shape.at)
      ctx.font = `${shape.bold === false ? 500 : 700} ${(shape.fontSize ?? FONT_SIZE) * unit}px ${FONT_FAMILY}`
      ctx.textBaseline = 'top'
      ctx.textAlign = shape.align ?? 'left'
      if (shape.boxColor) {
        const padding = 8 * unit
        const width = ctx.measureText(shape.text).width + padding * 2
        ctx.fillStyle = shape.boxColor
        ctx.fillRect(q.x - padding, q.y - padding / 2, width, (shape.fontSize ?? FONT_SIZE) * 1.5 * unit)
        ctx.fillStyle = shape.color
      }
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)'
      ctx.shadowBlur = 3 * unit
      ctx.fillText(shape.text, q.x, q.y)
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
    }
  }
}

function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** `w`/`h` are the displayed image size in px; `solid` also grabs the inside of circles and rectangles. */
function hitsShape(shape: MarkupShape, p: Point, w: number, h: number, unit: number, solid = false) {
  const px = (pt: Point): Point => ({ x: pt.x * w, y: pt.y * h })
  const at = px(p)
  if (shape.kind === 'pen') {
    const pts = shape.points.map(px)
    if (pts.length === 1) return Math.hypot(at.x - pts[0].x, at.y - pts[0].y) <= ERASE_RADIUS
    return pts.slice(1).some((pt, i) => distanceToSegment(at, pts[i], pt) <= ERASE_RADIUS)
  }
  if (shape.kind === 'text') {
    const q = px(shape.at)
    const fontSize = (shape.fontSize ?? FONT_SIZE) * unit
    const width = Math.max(shape.text.length * fontSize * 0.6, 44)
    const padding = 12
    return at.x >= q.x - padding - ERASE_RADIUS && at.x <= q.x + width + padding + ERASE_RADIUS && at.y >= q.y - padding - ERASE_RADIUS && at.y <= q.y + fontSize * 1.6 + padding + ERASE_RADIUS
  }
  const a = px(shape.a)
  const b = px(shape.b)
  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2
  const rx = Math.max(Math.abs(b.x - a.x) / 2, 1)
  const ry = Math.max(Math.abs(b.y - a.y) / 2, 1)
  if (shape.kind === 'ellipse') {
    const r = Math.hypot((at.x - cx) / rx, (at.y - cy) / ry)
    if (solid) return r * Math.min(rx, ry) <= Math.min(rx, ry) + ERASE_RADIUS
    return Math.abs(r - 1) * Math.min(rx, ry) <= ERASE_RADIUS
  }
  const outside = Math.abs(at.x - cx) <= rx + ERASE_RADIUS && Math.abs(at.y - cy) <= ry + ERASE_RADIUS
  if (solid) return outside
  const inside = Math.abs(at.x - cx) < rx - ERASE_RADIUS && Math.abs(at.y - cy) < ry - ERASE_RADIUS
  return outside && !inside
}

function boundsOf(shape: MarkupShape) {
  if (shape.kind === 'text') return { minX: shape.at.x, maxX: shape.at.x, minY: shape.at.y, maxY: shape.at.y }
  const pts = shape.kind === 'pen' ? shape.points : [shape.a, shape.b]
  const xs = pts.map((pt) => pt.x)
  const ys = pts.map((pt) => pt.y)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

/** Returns a copy of the shape shifted by (dx, dy) in image-normalised units, kept inside the image. */
function moveShape(shape: MarkupShape, dx: number, dy: number): MarkupShape {
  const b = boundsOf(shape)
  const x = Math.max(-b.minX, Math.min(1 - b.maxX, dx))
  const y = Math.max(-b.minY, Math.min(1 - b.maxY, dy))
  const shift = (pt: Point): Point => ({ x: pt.x + x, y: pt.y + y })
  if (shape.kind === 'pen') return { ...shape, points: shape.points.map(shift) }
  if (shape.kind === 'text') return { ...shape, at: shift(shape.at) }
  return { ...shape, a: shift(shape.a), b: shift(shape.b) }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Burns the markup into the snapshot at its natural size. */
async function composeSnapshot(src: string, shapes: MarkupShape[]) {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0)
  drawShapes(ctx, shapes, (p) => ({ x: p.x * img.naturalWidth, y: p.y * img.naturalHeight }), img.naturalWidth / REFERENCE_WIDTH)
  return canvas.toDataURL('image/jpeg', 0.85)
}

/** Click-hold → drag → release repositioning of a toolbar, constrained to its positioned parent. */
function useDraggable() {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointerId: number; startX: number; startY: number; origin: Point; minX: number; maxX: number; minY: number; maxY: number } | null>(null)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, input, a, [role="button"]')) return
    const el = ref.current
    const parent = (el?.offsetParent as HTMLElement | null) ?? el?.parentElement
    if (!el || !parent) return
    const rect = el.getBoundingClientRect()
    const bounds = parent.getBoundingClientRect()
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origin: offset,
      minX: bounds.left - rect.left,
      maxX: bounds.right - rect.right,
      minY: bounds.top - rect.top,
      maxY: bounds.bottom - rect.bottom,
    }
    el.setPointerCapture(e.pointerId)
    setDragging(true)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    setOffset({
      x: d.origin.x + Math.max(d.minX, Math.min(d.maxX, e.clientX - d.startX)),
      y: d.origin.y + Math.max(d.minY, Math.min(d.maxY, e.clientY - d.startY)),
    })
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== e.pointerId) return
    drag.current = null
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return { ref, offset, dragging, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp } }
}

function DragGrip({ vertical = false }: { vertical?: boolean }) {
  return (
    <Box aria-hidden sx={{ display: 'grid', placeItems: 'center', width: vertical ? 34 : 18, height: vertical ? 18 : 34, flexShrink: 0, color: 'rgba(255,255,255,0.5)' }}>
      <DragIndicatorRoundedIcon sx={{ fontSize: 18, transform: vertical ? 'rotate(90deg)' : 'none' }} />
    </Box>
  )
}

interface TextDraft {
  at: Point
  value: string
  index?: number
  color?: string
  boxColor?: string
  fontSize?: number
  bold?: boolean
  align?: 'left' | 'center' | 'right'
}

interface MoveState {
  index: number
  pointerId: number
  clientX: number
  clientY: number
  start: Point
  original: MarkupShape
  latest: MarkupShape
  moved: boolean
  clickToEdit: boolean
}

interface Props {
  src: string
  initialShapes: MarkupShape[]
  onCancel: () => void
  onDone: (shapes: MarkupShape[], image: string | null) => void
  defaultCollapsed?: boolean
}

const barButtonSx = { width: 34, height: 34, borderRadius: '8px', color: '#fff', flexShrink: 0 }
const groupSx = { display: 'flex', alignItems: 'center', gap: 0.5 }

export default function SnapshotMarkup({ src, initialShapes, onCancel, onDone, defaultCollapsed = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const draftRef = useRef<MarkupShape | null>(null)
  const moveRef = useRef<MoveState | null>(null)
  const erasing = useRef(false)
  const [history, setHistory] = useState({ stack: [initialShapes], index: 0 })
  const [draft, setDraft] = useState<MarkupShape | null>(null)
  const [moving, setMoving] = useState<{ index: number; shape: MarkupShape } | null>(null)
  const [hoverMove, setHoverMove] = useState(false)
  const [tool, setTool] = useState<Tool | null>(null)
  const [expanded, setExpanded] = useState(!defaultCollapsed)
  const [color, setColor] = useState(COLORS[0])
  const selectTool = (nextTool: Tool) => {
    if (tool === nextTool) {
      setTool(null)
      setTextDraft(null)
      setEditingTextIndex(null)
      return
    }
    setTool(nextTool)
    if (nextTool === 'text') setColor('#ffffff')
    else if (nextTool !== 'eraser') setColor('#ef4444')
  }
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null)
  const [colorTarget, setColorTarget] = useState<'text' | 'box' | 'markup'>('markup')
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null)
  const [editingTextIndex, setEditingTextIndex] = useState<number | null>(null)
  const [textBold, setTextBold] = useState(true)
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left')
  const [textSize, setTextSize] = useState(FONT_SIZE)
  const [boxColor, setBoxColor] = useState('#ffe56b')
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const textDrag = useRef<{ pointerId: number; startX: number; startY: number; origin: Point } | null>(null)
  const [saving, setSaving] = useState(false)
  const mainToolbar = useDraggable()
  const textToolbar = useDraggable()
  const actionToolbar = useDraggable()

  const shapes = history.stack[history.index]
  const canUndo = history.index > 0
  const canRedo = history.index < history.stack.length - 1
  const displayShapes = useMemo(
    () => (moving ? shapes.map((shape, index) => (index === moving.index ? moving.shape : shape)) : shapes),
    [shapes, moving],
  )

  /** Where the (contain-fitted) image sits inside the canvas, in px. */
  const frame = useMemo(() => {
    if (!natural || !size.w || !size.h) return { ox: 0, oy: 0, iw: size.w, ih: size.h }
    const scale = Math.min(size.w / natural.w, size.h / natural.h)
    const iw = natural.w * scale
    const ih = natural.h * scale
    return { ox: (size.w - iw) / 2, oy: (size.h - ih) / 2, iw, ih }
  }, [natural, size])
  const unit = frame.iw > 0 ? frame.iw / REFERENCE_WIDTH : 1

  const pushShapes = (next: MarkupShape[] | ((current: MarkupShape[]) => MarkupShape[])) =>
    setHistory((h) => {
      const current = h.stack[h.index]
      const resolved = typeof next === 'function' ? next(current) : next
      return { stack: [...h.stack.slice(0, h.index + 1), resolved], index: h.index + 1 }
    })

  useLayoutEffect(() => {
    const parent = canvasRef.current?.parentElement
    if (!parent) return
    const measure = () => setSize({ w: parent.clientWidth, h: parent.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const img = imageRef.current
    if (img?.complete && img.naturalWidth) setNatural({ w: img.naturalWidth, h: img.naturalHeight })
  }, [src])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.w || !size.h) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(size.w * dpr)
    canvas.height = Math.floor(size.h * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)
    drawShapes(ctx, draft ? [...displayShapes, draft] : displayShapes, (p) => ({ x: frame.ox + p.x * frame.iw, y: frame.oy + p.y * frame.ih }), unit)
  }, [displayShapes, draft, size, frame, unit])

  const setDraftShape = (shape: MarkupShape | null) => {
    draftRef.current = shape
    setDraft(shape)
  }

  const pointFrom = (e: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left - frame.ox) / (frame.iw || 1))),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top - frame.oy) / (frame.ih || 1))),
    }
  }

  const findShapeAt = (p: Point, solid: boolean) => {
    for (let i = shapes.length - 1; i >= 0; i -= 1) {
      if (hitsShape(shapes[i], p, frame.iw, frame.ih, unit, solid)) return i
    }
    return -1
  }

  const eraseAt = (p: Point) => {
    const i = findShapeAt(p, false)
    if (i >= 0) pushShapes((current) => current.filter((_, index) => index !== i))
  }

  const openTextAt = (p: Point) => {
    const existingIndex = shapes.findIndex((shape) => {
      try {
        return shape.kind === 'text' && hitsShape(shape, p, frame.iw, frame.ih, unit)
      } catch {
        return false
      }
    })
    const existing = existingIndex >= 0 ? shapes[existingIndex] : null
    if (existing?.kind === 'text') {
      setEditingTextIndex(existingIndex)
      setTextBold(existing.bold !== false)
      setTextAlign(existing.align ?? 'left')
      setTextSize(existing.fontSize ?? FONT_SIZE)
      setBoxColor(existing.boxColor ?? '#ffe56b')
      setColor(existing.color)
      setTextDraft({ at: { ...existing.at }, value: existing.text, index: existingIndex, color: existing.color, boxColor: existing.boxColor, fontSize: existing.fontSize, bold: existing.bold, align: existing.align })
    } else {
      setEditingTextIndex(null)
      setTextDraft({ at: p, value: '' })
    }
  }

  const handleDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const p = pointFrom(e)

    if (tool !== 'pen' && tool !== 'eraser') {
      const hit = findShapeAt(p, tool === null)
      if (hit >= 0) {
        moveRef.current = { index: hit, pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, start: p, original: shapes[hit], latest: shapes[hit], moved: false, clickToEdit: tool === 'text' }
        e.currentTarget.setPointerCapture(e.pointerId)
        return
      }
    }

    if (!tool) return
    if (tool === 'text') {
      openTextAt(p)
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    if (tool === 'eraser') {
      erasing.current = true
      eraseAt(p)
      return
    }
    setDraftShape(tool === 'pen' ? { kind: 'pen', color, points: [p] } : { kind: tool, color, a: p, b: p })
  }

  const handleMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const move = moveRef.current
    if (move) {
      const dx = e.clientX - move.clientX
      const dy = e.clientY - move.clientY
      if (!move.moved && Math.hypot(dx, dy) < MOVE_THRESHOLD) return
      move.moved = true
      move.latest = moveShape(move.original, dx / (frame.iw || 1), dy / (frame.ih || 1))
      setMoving({ index: move.index, shape: move.latest })
      return
    }
    const p = pointFrom(e)
    if (erasing.current) {
      eraseAt(p)
      return
    }
    const current = draftRef.current
    if (current) {
      if (current.kind === 'pen') setDraftShape({ ...current, points: [...current.points, p] })
      else if (current.kind === 'rect' || current.kind === 'ellipse') setDraftShape({ ...current, b: p })
      return
    }
    if (tool !== 'pen' && tool !== 'eraser') setHoverMove(findShapeAt(p, tool === null) >= 0)
    else setHoverMove(false)
  }

  const handleUp = (e?: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e) {
      try {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // The pointer may already have been released by the browser.
      }
    }
    erasing.current = false

    const move = moveRef.current
    if (move) {
      moveRef.current = null
      setMoving(null)
      if (move.moved) {
        const finalShape = move.latest
        pushShapes((current) => current.map((shape, index) => (index === move.index ? finalShape : shape)))
      } else if (move.clickToEdit) {
        openTextAt(move.start)
      }
      return
    }

    const current = draftRef.current
    if (!current) return
    setDraftShape(null)
    if (current.kind === 'rect' || current.kind === 'ellipse') {
      const moved = Math.hypot((current.b.x - current.a.x) * frame.iw, (current.b.y - current.a.y) * frame.ih)
      if (moved < 4) return
    }
    pushShapes((existing) => [...existing, current])
  }

  const handleUpRef = useRef(handleUp)
  handleUpRef.current = handleUp
  useEffect(() => {
    const release = () => handleUpRef.current()
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    return () => {
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
    }
  }, [])

  const commitText = (value: TextDraft) => {
    if (!value.value.trim()) return
    const nextText: MarkupShape = { kind: 'text', color, at: value.at, text: value.value.trim(), boxColor, fontSize: textSize, bold: textBold, align: textAlign }
    if (editingTextIndex !== null) {
      pushShapes((current) => current.map((shape, index) => index === editingTextIndex ? nextText : shape))
    } else {
      pushShapes((current) => [...current, nextText])
    }
    setEditingTextIndex(null)
    setTextDraft(null)
  }

  const handleTextPointerDown = (e: ReactPointerEvent<HTMLInputElement>) => {
    if (e.target !== e.currentTarget || !textDraft) return
    textDrag.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, origin: textDraft.at }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleTextPointerMove = (e: ReactPointerEvent<HTMLInputElement>) => {
    const drag = textDrag.current
    if (!drag || !textDraft || !frame.iw || !frame.ih) return
    setTextDraft({ ...textDraft, at: { x: Math.max(0, Math.min(1, drag.origin.x + (e.clientX - drag.startX) / frame.iw)), y: Math.max(0, Math.min(1, drag.origin.y + (e.clientY - drag.startY) / frame.ih)) } })
  }

  const handleTextPointerUp = (e: ReactPointerEvent<HTMLInputElement>) => {
    if (textDrag.current?.pointerId === e.pointerId) {
      textDrag.current = null
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const finish = async () => {
    const pendingText: MarkupShape | null = textDraft?.value.trim() ? { kind: 'text', color, at: textDraft.at, text: textDraft.value.trim(), boxColor, fontSize: textSize, bold: textBold, align: textAlign } : null
    const pending = pendingText
      ? editingTextIndex !== null ? shapes.map((shape, index) => index === editingTextIndex ? pendingText : shape) : [...shapes, pendingText]
      : shapes
    if (pending.length === 0) {
      onDone([], null)
      return
    }
    setSaving(true)
    try {
      onDone(pending, await composeSnapshot(src, pending))
    } catch {
      onDone(pending, null)
    }
  }

  const tools: { id: Tool; label: string; icon: React.ReactNode }[] = [
    { id: 'pen', label: 'Pen', icon: <EditRoundedIcon /> },
    { id: 'text', label: 'Text', icon: <TitleRoundedIcon /> },
    { id: 'ellipse', label: 'Circle', icon: <RadioButtonUncheckedRoundedIcon sx={{ color: color }} /> },
    { id: 'rect', label: 'Rectangle', icon: <CheckBoxOutlineBlankRoundedIcon /> },
  ]

  const canvasCursor = moving ? 'grabbing' : hoverMove ? 'move' : !tool ? 'default' : tool === 'text' ? 'text' : 'crosshair'

  return (
    <>
      <Box
        ref={imageRef}
        component="img"
        src={src}
        alt="Snapshot of the current camera view"
        onLoad={(e: React.SyntheticEvent<HTMLImageElement>) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', userSelect: 'none', zIndex: 0 }}
      />
      <canvas
        ref={canvasRef}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onPointerLeave={(e) => { if (e.buttons === 0) { handleUp(e); setHoverMove(false) } }}
        onLostPointerCapture={() => handleUp()}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', zIndex: 1, pointerEvents: tool || shapes.length > 0 ? 'auto' : 'none', cursor: canvasCursor }}
      />

      {!expanded && (
        <Tooltip title="Mark up snapshot">
          <IconButton
            aria-label="Mark up snapshot"
            onClick={() => setExpanded(true)}
            sx={{ ...barButtonSx, position: 'absolute', right: 12, bottom: 12, zIndex: 3, width: 40, height: 40, bgcolor: 'rgba(14, 17, 23, 0.94)', '&:hover': { bgcolor: 'rgba(14, 17, 23, 1)' } }}
          >
            <EditRoundedIcon />
          </IconButton>
        </Tooltip>
      )}

      {textDraft && (
        <Box
          component="input"
          autoFocus
          value={textDraft.value}
          aria-label="Markup text"
          onPointerDown={handleTextPointerDown}
          onPointerMove={handleTextPointerMove}
          onPointerUp={handleTextPointerUp}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTextDraft({ ...textDraft, value: e.target.value })}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') commitText(textDraft)
            if (e.key === 'Escape') setTextDraft(null)
          }}
          onBlur={() => undefined}
          sx={{
            position: 'absolute',
            left: `${frame.ox + textDraft.at.x * frame.iw}px`,
            top: `${frame.oy + textDraft.at.y * frame.ih}px`,
            width: `${Math.max(8, textDraft.value.length + 1)}ch`,
            maxWidth: '80%',
            m: 0,
            border: '2px solid #1976ff',
            outline: 'none',
            borderRadius: '7px',
            bgcolor: boxColor,
            color: '#111827',
            p: '8px 12px',
            cursor: textDrag.current ? 'grabbing' : 'grab',
            textAlign,
            font: `${textBold ? 700 : 500} ${textSize * unit}px/1.2 ${FONT_FAMILY}`,
            boxShadow: '0 0 0 2px rgba(255,255,255,0.85), 0 0 0 4px #1976ff',
            zIndex: 2,
            pointerEvents: 'auto',
          }}
        />
      )}

      {tool === 'text' && (
        <>
          <Box
            ref={textToolbar.ref}
            role="toolbar"
            aria-label="Text annotation options"
            {...textToolbar.handlers}
            sx={{ position: 'absolute', right: 10, bottom: 58, display: 'flex', flexDirection: 'column', gap: 0, p: 0.35, borderRadius: '10px', color: '#fff', bgcolor: 'rgba(14, 17, 23, 0.94)', backdropFilter: 'blur(8px)', transform: `translate(${textToolbar.offset.x}px, ${textToolbar.offset.y}px)`, cursor: textToolbar.dragging ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'none', pointerEvents: 'auto', zIndex: 10 }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
              <DragGrip vertical />
              <Tooltip title="Voice to text"><IconButton aria-label="Voice to text" onClick={() => document.querySelector<HTMLInputElement>('[aria-label=\"Markup text\"]')?.focus()} sx={barButtonSx}><MicRoundedIcon /></IconButton></Tooltip>
              <Tooltip title="Bold"><IconButton aria-label="Bold" aria-pressed={textBold} onClick={() => setTextBold((value) => !value)} sx={{ ...barButtonSx, bgcolor: textBold ? 'rgba(255,255,255,0.16)' : 'transparent' }}><FormatBoldRoundedIcon /></IconButton></Tooltip>
              <Tooltip title={`Increase text size (${textSize}px)`}><IconButton aria-label="Increase text size" onClick={() => setTextSize((value) => Math.min(40, value + 4))} sx={barButtonSx}><Box component="span" sx={{ fontSize: 23, fontWeight: 800, lineHeight: 1 }}>A+</Box></IconButton></Tooltip>
              <Tooltip title={`Decrease text size (${textSize}px)`}><IconButton aria-label="Decrease text size" onClick={() => setTextSize((value) => Math.max(12, value - 4))} sx={barButtonSx}><Box component="span" sx={{ fontSize: 17, fontWeight: 800, lineHeight: 1 }}>A−</Box></IconButton></Tooltip>
              <Tooltip title="Align text"><IconButton aria-label="Align text" onClick={() => setTextAlign((value) => value === 'left' ? 'center' : value === 'center' ? 'right' : 'left')} sx={barButtonSx}><FormatAlignLeftRoundedIcon /></IconButton></Tooltip>
              <Tooltip title="List"><IconButton aria-label="List" sx={barButtonSx}><FormatListBulletedRoundedIcon /></IconButton></Tooltip>
              <Button aria-label="Text color" onClick={(e) => { setColorTarget('text'); setColorAnchor(e.currentTarget) }} sx={{ minWidth: 38, height: 40, flexDirection: 'column', gap: 0, px: 0.25, color: '#fff', flexShrink: 0 }}><Box component="span" sx={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>A</Box><Box component="span" aria-hidden sx={{ width: 22, height: 4, borderRadius: 2, bgcolor: color, mt: 0.25 }} /></Button>
              <Tooltip title="Box color"><IconButton aria-label="Box color" onClick={(e) => { setColorTarget('box'); setColorAnchor(e.currentTarget) }} sx={barButtonSx}><Box sx={{ width: 20, height: 15, borderRadius: '3px', bgcolor: boxColor, border: '2px solid #fff' }} /></IconButton></Tooltip>
            </Box>
          </Box>
          <Box ref={actionToolbar.ref} {...actionToolbar.handlers} sx={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', alignItems: 'center', gap: 0.25, p: 0.35, borderRadius: '10px', color: '#fff', bgcolor: 'rgba(14, 17, 23, 0.94)', transform: `translate(${actionToolbar.offset.x}px, ${actionToolbar.offset.y}px)`, cursor: actionToolbar.dragging ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'none', pointerEvents: 'auto', zIndex: 10 }}>
            <DragGrip />
            <Tooltip title="Delete selected text"><IconButton aria-label="Delete selected text" onClick={() => { if (editingTextIndex !== null) pushShapes(shapes.filter((_, index) => index !== editingTextIndex)); setEditingTextIndex(null); setTextDraft(null) }} sx={barButtonSx}><DeleteOutlineRoundedIcon /></IconButton></Tooltip>
            <Tooltip title="Undo"><span><IconButton aria-label="Undo" disabled={!canUndo} onClick={() => setHistory((h) => ({ ...h, index: h.index - 1 }))} sx={barButtonSx}><UndoRoundedIcon /></IconButton></span></Tooltip>
            <Tooltip title="Redo"><span><IconButton aria-label="Redo" disabled={!canRedo} onClick={() => setHistory((h) => ({ ...h, index: h.index + 1 }))} sx={barButtonSx}><RedoRoundedIcon /></IconButton></span></Tooltip>
            <Button onClick={onCancel} sx={{ height: 34, minWidth: 58, px: 1, color: '#fff', fontWeight: 700 }}>Cancel</Button>
            <Button variant="contained" onClick={finish} disabled={saving} sx={{ height: 34, minWidth: 58, px: 1.25, borderRadius: '8px', fontWeight: 700 }}>Save</Button>
          </Box>
        </>
      )}

      <Box
        ref={mainToolbar.ref}
        role="toolbar"
        aria-label="Markup tools"
        {...mainToolbar.handlers}
        sx={{
          position: 'absolute',
          left: '50%',
          bottom: 12,
          width: 'max-content',
          maxWidth: 'calc(100% - 24px)',
          transform: `translateX(-50%) translate(${mainToolbar.offset.x}px, ${mainToolbar.offset.y}px)`,
          display: !expanded || tool === 'text' ? 'none' : 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          rowGap: 0.5,
          columnGap: 1.5,
          p: 0.75,
          borderRadius: '16px',
          color: '#fff',
          bgcolor: 'rgba(14, 17, 23, 0.94)',
          backdropFilter: 'blur(8px)',
          cursor: mainToolbar.dragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          touchAction: 'none',
          pointerEvents: 'auto',
          zIndex: 10,
        }}
      >
        <Box sx={groupSx}>
        <DragGrip />
        {tools.map((item) => (
          <Tooltip key={item.id} title={item.label}>
            <IconButton
              aria-label={item.label}
              aria-pressed={tool === item.id}
              onClick={() => selectTool(item.id)}
              sx={{ ...barButtonSx, bgcolor: tool === item.id ? 'primary.main' : 'transparent', '&:hover': { bgcolor: tool === item.id ? 'primary.main' : 'rgba(255,255,255,0.12)' } }}
            >
              {item.icon}
            </IconButton>
          </Tooltip>
        ))}

        <Button
          aria-label="Markup color"
          onClick={(e) => { setColorTarget('markup'); setColorAnchor(e.currentTarget) }}
          sx={{ minWidth: 0, height: 40, ml: 0.5, px: 1.25, gap: 0.5, borderRadius: '10px', color: '#fff', bgcolor: 'rgba(255,255,255,0.08)' }}
        >
          <Box aria-hidden sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: color, border: '2px solid rgba(255,255,255,0.85)' }} />
          <KeyboardArrowDownRoundedIcon fontSize="small" />
        </Button>
        <Popover
          open={Boolean(colorAnchor)}
          anchorEl={colorAnchor}
          onClose={() => setColorAnchor(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          sx={{ zIndex: (t) => t.zIndex.modal + 30 }}
          slotProps={{ paper: { sx: { display: 'flex', gap: 1, p: 1, mt: -1, borderRadius: '12px' } } }}
        >
          {COLORS.map((c) => (
            <IconButton
              key={c}
              size="small"
              aria-label={`Use color ${c}`}
              onClick={() => {
                if (colorTarget === 'box') setBoxColor(c)
                else setColor(c)
                setColorAnchor(null)
              }}
              sx={{ p: 0.5, border: 2, borderColor: (colorTarget === 'box' ? c === boxColor : c === color) ? 'primary.main' : 'transparent' }}
            >
              <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: c, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)' }} />
            </IconButton>
          ))}
        </Popover>

        <Tooltip title="Eraser">
          <IconButton
            aria-label="Eraser"
            aria-pressed={tool === 'eraser'}
            onClick={() => selectTool('eraser')}
            sx={{ ...barButtonSx, ml: 0.5, bgcolor: tool === 'eraser' ? 'primary.main' : 'transparent', '&:hover': { bgcolor: tool === 'eraser' ? 'primary.main' : 'rgba(255,255,255,0.12)' } }}
          >
            <EraserIcon />
          </IconButton>
        </Tooltip>

        </Box>

        <Box sx={groupSx}>
        <Tooltip title="Undo">
          <span>
            <IconButton
              aria-label="Undo"
              disabled={!canUndo}
              onClick={() => setHistory((h) => ({ ...h, index: h.index - 1 }))}
              sx={{ ...barButtonSx, '&.Mui-disabled': { color: 'rgba(255,255,255,0.35)' } }}
            >
              <UndoRoundedIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Redo">
          <span>
            <IconButton
              aria-label="Redo"
              disabled={!canRedo}
              onClick={() => setHistory((h) => ({ ...h, index: h.index + 1 }))}
              sx={{ ...barButtonSx, '&.Mui-disabled': { color: 'rgba(255,255,255,0.35)' } }}
            >
              <RedoRoundedIcon />
            </IconButton>
          </span>
        </Tooltip>

        </Box>

        <Box sx={{ ...groupSx, ml: 'auto' }}>
          <Button onClick={onCancel} sx={{ height: 40, px: 1.5, color: '#fff', fontWeight: 700 }}>
            Cancel
          </Button>
          <Button variant="contained" onClick={finish} disabled={saving} sx={{ height: 40, px: 2, borderRadius: '10px', fontWeight: 700 }}>
            Done
          </Button>
        </Box>
      </Box>
    </>
  )
}
