import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
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

interface Point {
  x: number
  y: number
}

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

function hitsShape(shape: MarkupShape, p: Point, w: number, h: number) {
  const px = (pt: Point): Point => ({ x: pt.x * w, y: pt.y * h })
  const at = px(p)
  if (shape.kind === 'pen') {
    const pts = shape.points.map(px)
    if (pts.length === 1) return Math.hypot(at.x - pts[0].x, at.y - pts[0].y) <= ERASE_RADIUS
    return pts.slice(1).some((pt, i) => distanceToSegment(at, pts[i], pt) <= ERASE_RADIUS)
  }
  if (shape.kind === 'text') {
    const q = px(shape.at)
    const fontSize = shape.fontSize ?? FONT_SIZE
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
    return Math.abs(r - 1) * Math.min(rx, ry) <= ERASE_RADIUS
  }
  const outside = Math.abs(at.x - cx) <= rx + ERASE_RADIUS && Math.abs(at.y - cy) <= ry + ERASE_RADIUS
  const inside = Math.abs(at.x - cx) < rx - ERASE_RADIUS && Math.abs(at.y - cy) < ry - ERASE_RADIUS
  return outside && !inside
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/** Burns the markup into the snapshot at its natural size, mapping from the panel's cover-fit framing. */
async function composeSnapshot(src: string, shapes: MarkupShape[], panel: { w: number; h: number }) {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0)
  const scale = Math.max(panel.w / img.naturalWidth, panel.h / img.naturalHeight)
  const offsetX = (panel.w - img.naturalWidth * scale) / 2
  const offsetY = (panel.h - img.naturalHeight * scale) / 2
  drawShapes(ctx, shapes, (p) => ({ x: (p.x * panel.w - offsetX) / scale, y: (p.y * panel.h - offsetY) / scale }), 1 / scale)
  return canvas.toDataURL('image/jpeg', 0.85)
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

interface Props {
  src: string
  initialShapes: MarkupShape[]
  onCancel: () => void
  onDone: (shapes: MarkupShape[], image: string | null) => void
}

const barButtonSx = { width: 34, height: 34, borderRadius: '8px', color: '#fff', flexShrink: 0 }
const groupSx = { display: 'flex', alignItems: 'center', gap: 0.5 }

export default function SnapshotMarkup({ src, initialShapes, onCancel, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const draftRef = useRef<MarkupShape | null>(null)
  const erasing = useRef(false)
  const [history, setHistory] = useState({ stack: [initialShapes], index: 0 })
  const [draft, setDraft] = useState<MarkupShape | null>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const selectTool = (nextTool: Tool) => {
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
  const textDrag = useRef<{ pointerId: number; startX: number; startY: number; origin: Point } | null>(null)
  const [saving, setSaving] = useState(false)
  const textToolbarRef = useRef<HTMLDivElement>(null)
  const actionToolbarRef = useRef<HTMLDivElement>(null)
  const [textToolbarOffset, setTextToolbarOffset] = useState({ x: 0, y: 0 })
  const [actionToolbarOffset, setActionToolbarOffset] = useState({ x: 0, y: 0 })
  const textToolbarDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)

  const shapes = history.stack[history.index]
  const canUndo = history.index > 0
  const canRedo = history.index < history.stack.length - 1

  const pushShapes = (next: MarkupShape[]) =>
    setHistory((h) => ({ stack: [...h.stack.slice(0, h.index + 1), next], index: h.index + 1 }))

  useLayoutEffect(() => {
    const parent = canvasRef.current?.parentElement
    if (!parent) return
    const measure = () => setSize({ w: parent.clientWidth, h: parent.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(parent)
    return () => observer.disconnect()
  }, [])

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
    drawShapes(ctx, draft ? [...shapes, draft] : shapes, (p) => ({ x: p.x * size.w, y: p.y * size.h }), 1)
  }, [shapes, draft, size])

  const setDraftShape = (shape: MarkupShape | null) => {
    draftRef.current = shape
    setDraft(shape)
  }

  const pointFrom = (e: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    }
  }

  const eraseAt = (p: Point) => {
    for (let i = shapes.length - 1; i >= 0; i -= 1) {
      if (hitsShape(shapes[i], p, size.w, size.h)) {
        pushShapes(shapes.filter((_, index) => index !== i))
        return
      }
    }
  }

  const handleDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const p = pointFrom(e)
    if (tool === 'text') {
      const existingIndex = shapes.findIndex((shape) => {
        try {
          return shape.kind === 'text' && hitsShape(shape, p, size.w, size.h)
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
    const p = pointFrom(e)
    if (erasing.current) {
      eraseAt(p)
      return
    }
    const current = draftRef.current
    if (!current) return
    if (current.kind === 'pen') setDraftShape({ ...current, points: [...current.points, p] })
    else if (current.kind === 'rect' || current.kind === 'ellipse') setDraftShape({ ...current, b: p })
  }

  const handleUp = () => {
    erasing.current = false
    const current = draftRef.current
    if (!current) return
    setDraftShape(null)
    if (current.kind === 'rect' || current.kind === 'ellipse') {
      const moved = Math.hypot((current.b.x - current.a.x) * size.w, (current.b.y - current.a.y) * size.h)
      if (moved < 4) return
    }
    pushShapes([...shapes, current])
  }

  const commitText = (value: TextDraft) => {
    if (!value.value.trim()) return
    const nextText: MarkupShape = { kind: 'text', color, at: value.at, text: value.value.trim(), boxColor, fontSize: textSize, bold: textBold, align: textAlign }
    if (editingTextIndex !== null) {
      pushShapes(shapes.map((shape, index) => index === editingTextIndex ? nextText : shape))
    } else {
      pushShapes([...shapes, nextText])
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
    if (!drag || !textDraft || !size.w || !size.h) return
    setTextDraft({ ...textDraft, at: { x: Math.max(0, Math.min(1, drag.origin.x + (e.clientX - drag.startX) / size.w)), y: Math.max(0, Math.min(1, drag.origin.y + (e.clientY - drag.startY) / size.h)) } })
  }

  const handleTextPointerUp = (e: ReactPointerEvent<HTMLInputElement>) => {
    if (textDrag.current?.pointerId === e.pointerId) {
      textDrag.current = null
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const actionToolbarDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)

  const handleActionToolbarPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, [role="button"]')) return
    actionToolbarDragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, originX: actionToolbarOffset.x, originY: actionToolbarOffset.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleActionToolbarPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = actionToolbarDragRef.current
    const toolbar = actionToolbarRef.current
    const parent = toolbar?.parentElement
    if (!drag || !toolbar || !parent) return
    const parentRect = parent.getBoundingClientRect()
    const toolbarRect = toolbar.getBoundingClientRect()
    const deltaX = e.clientX - drag.startX
    const deltaY = e.clientY - drag.startY
    const currentX = toolbarRect.left - parentRect.left
    const currentY = toolbarRect.top - parentRect.top
    setActionToolbarOffset({
      x: drag.originX + Math.max(-currentX, Math.min(parent.clientWidth - toolbar.offsetWidth - currentX, deltaX)),
      y: drag.originY + Math.max(-currentY, Math.min(parent.clientHeight - toolbar.offsetHeight - currentY, deltaY)),
    })
  }

  const handleActionToolbarPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (actionToolbarDragRef.current?.pointerId === e.pointerId) {
      actionToolbarDragRef.current = null
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const handleTextToolbarPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, [role="button"]')) return
    textToolbarDragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, originX: textToolbarOffset.x, originY: textToolbarOffset.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleTextToolbarPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = textToolbarDragRef.current
    const toolbar = textToolbarRef.current
    const parent = toolbar?.parentElement
    if (!drag || !toolbar || !parent) return
    const parentRect = parent.getBoundingClientRect()
    const toolbarRect = toolbar.getBoundingClientRect()
    const deltaX = e.clientX - drag.startX
    const deltaY = e.clientY - drag.startY
    const currentX = toolbarRect.left - parentRect.left
    const currentY = toolbarRect.top - parentRect.top
    setTextToolbarOffset({
      x: drag.originX + Math.max(-currentX, Math.min(parent.clientWidth - toolbar.offsetWidth - currentX, deltaX)),
      y: drag.originY + Math.max(-currentY, Math.min(parent.clientHeight - toolbar.offsetHeight - currentY, deltaY)),
    })
  }

  const handleTextToolbarPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (textToolbarDragRef.current?.pointerId === e.pointerId) {
      textToolbarDragRef.current = null
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
      onDone(pending, await composeSnapshot(src, pending, size))
    } catch {
      onDone(shapes, null)
    }
  }

  const tools: { id: Tool; label: string; icon: React.ReactNode }[] = [
    { id: 'pen', label: 'Pen', icon: <EditRoundedIcon /> },
    { id: 'text', label: 'Text', icon: <TitleRoundedIcon /> },
    { id: 'ellipse', label: 'Circle', icon: <RadioButtonUncheckedRoundedIcon sx={{ color: color }} /> },
    { id: 'rect', label: 'Rectangle', icon: <CheckBoxOutlineBlankRoundedIcon /> },
  ]

  return (
    <>
      <canvas
        ref={canvasRef}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: tool === 'text' ? 'text' : 'crosshair' }}
      />

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
            left: `${textDraft.at.x * 100}%`,
            top: `${textDraft.at.y * 100}%`,
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
            font: `${textBold ? 700 : 500} ${textSize}px/1.2 ${FONT_FAMILY}`,  
            boxShadow: '0 0 0 2px rgba(255,255,255,0.85), 0 0 0 4px #1976ff',
          }}
        />
      )}

      {tool === 'text' && (
        <>
          <Box
            ref={textToolbarRef}
            role="toolbar"
            aria-label="Text annotation options"
            onPointerDown={handleTextToolbarPointerDown}
            onPointerMove={handleTextToolbarPointerMove}
            onPointerUp={handleTextToolbarPointerUp}
            onPointerCancel={handleTextToolbarPointerUp}
            sx={{ position: 'absolute', right: 10, bottom: 58, display: 'flex', flexDirection: 'column', gap: 0, p: 0.35, borderRadius: '10px', color: '#fff', bgcolor: 'rgba(14, 17, 23, 0.94)', backdropFilter: 'blur(8px)', transform: `translate(${textToolbarOffset.x}px, ${textToolbarOffset.y}px)`, cursor: textToolbarDragRef.current ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'none', zIndex: 3 }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
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
          <Box ref={actionToolbarRef} onPointerDown={handleActionToolbarPointerDown} onPointerMove={handleActionToolbarPointerMove} onPointerUp={handleActionToolbarPointerUp} onPointerCancel={handleActionToolbarPointerUp} sx={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', alignItems: 'center', gap: 0.25, p: 0.35, borderRadius: '10px', color: '#fff', bgcolor: 'rgba(14, 17, 23, 0.94)', transform: `translate(${actionToolbarOffset.x}px, ${actionToolbarOffset.y}px)`, cursor: actionToolbarDragRef.current ? 'grabbing' : 'grab', userSelect: 'none', touchAction: 'none', zIndex: 3 }}>
            <Tooltip title="Delete selected text"><IconButton aria-label="Delete selected text" onClick={() => { if (editingTextIndex !== null) pushShapes(shapes.filter((_, index) => index !== editingTextIndex)); setEditingTextIndex(null); setTextDraft(null) }} sx={barButtonSx}><DeleteOutlineRoundedIcon /></IconButton></Tooltip>
            <Tooltip title="Undo"><span><IconButton aria-label="Undo" disabled={!canUndo} onClick={() => setHistory((h) => ({ ...h, index: h.index - 1 }))} sx={barButtonSx}><UndoRoundedIcon /></IconButton></span></Tooltip>
            <Tooltip title="Redo"><span><IconButton aria-label="Redo" disabled={!canRedo} onClick={() => setHistory((h) => ({ ...h, index: h.index + 1 }))} sx={barButtonSx}><RedoRoundedIcon /></IconButton></span></Tooltip>
            <Button onClick={onCancel} sx={{ height: 34, minWidth: 58, px: 1, color: '#fff', fontWeight: 700 }}>Cancel</Button>
            <Button variant="contained" onClick={finish} disabled={saving} sx={{ height: 34, minWidth: 58, px: 1.25, borderRadius: '8px', fontWeight: 700 }}>Save</Button>
          </Box>
        </>
      )}

      <Box
        role="toolbar"
        aria-label="Markup tools"
        sx={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 12,
          display: tool === 'text' ? 'none' : 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          rowGap: 0.5,
          columnGap: 1.5,
          p: 0.75,
          borderRadius: '16px',
          color: '#fff',
          bgcolor: 'rgba(14, 17, 23, 0.94)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <Box sx={groupSx}>
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
