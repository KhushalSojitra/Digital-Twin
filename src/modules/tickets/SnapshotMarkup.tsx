import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Box, Button, IconButton, Popover, SvgIcon, Tooltip, type SvgIconProps } from '@mui/material'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import TitleRoundedIcon from '@mui/icons-material/TitleRounded'
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded'
import CheckBoxOutlineBlankRoundedIcon from '@mui/icons-material/CheckBoxOutlineBlankRounded'
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded'
import UndoRoundedIcon from '@mui/icons-material/UndoRounded'
import RedoRoundedIcon from '@mui/icons-material/RedoRounded'

interface Point {
  x: number
  y: number
}

export type MarkupShape =
  | { kind: 'pen'; color: string; points: Point[] }
  | { kind: 'ellipse'; color: string; a: Point; b: Point }
  | { kind: 'rect'; color: string; a: Point; b: Point }
  | { kind: 'text'; color: string; at: Point; text: string }

type Tool = 'pen' | 'text' | 'ellipse' | 'rect' | 'eraser'

const COLORS = ['#ef4444', '#facc15', '#22c55e', '#3b82f6', '#ffffff']
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
      ctx.font = `600 ${FONT_SIZE * unit}px ${FONT_FAMILY}`
      ctx.textBaseline = 'top'
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
    const width = shape.text.length * FONT_SIZE * 0.6
    return at.x >= q.x - ERASE_RADIUS && at.x <= q.x + width + ERASE_RADIUS && at.y >= q.y - ERASE_RADIUS && at.y <= q.y + FONT_SIZE + ERASE_RADIUS
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
}

interface Props {
  src: string
  initialShapes: MarkupShape[]
  onCancel: () => void
  onDone: (shapes: MarkupShape[], image: string | null) => void
}

const barButtonSx = { width: 40, height: 40, borderRadius: '10px', color: '#fff' }
const groupSx = { display: 'flex', alignItems: 'center', gap: 0.5 }

export default function SnapshotMarkup({ src, initialShapes, onCancel, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const draftRef = useRef<MarkupShape | null>(null)
  const erasing = useRef(false)
  const [history, setHistory] = useState({ stack: [initialShapes], index: 0 })
  const [draft, setDraft] = useState<MarkupShape | null>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null)
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [toolbarOffset, setToolbarOffset] = useState({ x: 0, y: 0 })
  const [saving, setSaving] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)

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
      setTextDraft({ at: p, value: '' })
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
    if (value.value.trim()) pushShapes([...shapes, { kind: 'text', color, at: value.at, text: value.value.trim() }])
    setTextDraft((current) => (current === value ? null : current))
  }

  const handleToolbarPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (target.closest('button, input, [role="button"]')) return
    const toolbar = toolbarRef.current
    const parent = toolbar?.parentElement
    if (!toolbar || !parent) return
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: toolbarOffset.x,
      originY: toolbarOffset.y,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleToolbarPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const toolbar = toolbarRef.current
    const parent = toolbar?.parentElement
    if (!drag || !toolbar || !parent) return
    const maxX = Math.max(0, parent.clientWidth - toolbar.offsetWidth - 24)
    const maxY = Math.max(0, parent.clientHeight - toolbar.offsetHeight - 24)
    setToolbarOffset({
      x: Math.max(-12, Math.min(maxX, drag.originX + e.clientX - drag.startX)),
      y: Math.max(-12, Math.min(maxY, drag.originY + drag.startY - e.clientY)),
    })
  }

  const handleToolbarPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const finish = async () => {
    const pending = textDraft?.value.trim() ? [...shapes, { kind: 'text' as const, color, at: textDraft.at, text: textDraft.value.trim() }] : shapes
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
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTextDraft({ ...textDraft, value: e.target.value })}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') commitText(textDraft)
            if (e.key === 'Escape') setTextDraft(null)
          }}
          onBlur={() => commitText(textDraft)}
          sx={{
            position: 'absolute',
            left: `${textDraft.at.x * 100}%`,
            top: `${textDraft.at.y * 100}%`,
            width: `${Math.max(8, textDraft.value.length + 1)}ch`,
            maxWidth: '80%',
            p: 0,
            m: 0,
            border: 0,
            outline: '1px dashed rgba(255, 255, 255, 0.75)',
            bgcolor: 'transparent',
            color,
            font: `600 ${FONT_SIZE}px/1.2 ${FONT_FAMILY}`,
          }}
        />
      )}

      <Box
        ref={toolbarRef}
        role="toolbar"
        aria-label="Markup tools"
        onPointerDown={handleToolbarPointerDown}
        onPointerMove={handleToolbarPointerMove}
        onPointerUp={handleToolbarPointerUp}
        onPointerCancel={handleToolbarPointerUp}
        sx={{
          position: 'absolute',
          left: 12,
          bottom: 12,
          maxWidth: 'calc(100% - 24px)',
          transform: `translate(${toolbarOffset.x}px, ${toolbarOffset.y}px)`,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          rowGap: 0.5,
          columnGap: 1.5,
          p: 0.75,
          borderRadius: '16px',
          color: '#fff',
          bgcolor: 'rgba(14, 17, 23, 0.94)',
          backdropFilter: 'blur(8px)',
          cursor: dragRef.current ? 'grabbing' : 'grab',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        <Box sx={groupSx}>
        {tools.map((item) => (
          <Tooltip key={item.id} title={item.label}>
            <IconButton
              aria-label={item.label}
              aria-pressed={tool === item.id}
              onClick={() => setTool(item.id)}
              sx={{ ...barButtonSx, bgcolor: tool === item.id ? 'primary.main' : 'transparent', '&:hover': { bgcolor: tool === item.id ? 'primary.main' : 'rgba(255,255,255,0.12)' } }}
            >
              {item.icon}
            </IconButton>
          </Tooltip>
        ))}

        <Button
          aria-label="Markup color"
          onClick={(e) => setColorAnchor(e.currentTarget)}
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
                setColor(c)
                setColorAnchor(null)
              }}
              sx={{ p: 0.5, border: 2, borderColor: c === color ? 'primary.main' : 'transparent' }}
            >
              <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: c, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)' }} />
            </IconButton>
          ))}
        </Popover>

        <Tooltip title="Eraser">
          <IconButton
            aria-label="Eraser"
            aria-pressed={tool === 'eraser'}
            onClick={() => setTool('eraser')}
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
