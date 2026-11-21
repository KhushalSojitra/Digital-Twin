import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { alpha, Box, Button, IconButton, Slider, Typography, type Theme } from '@mui/material'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import ZoomInRoundedIcon from '@mui/icons-material/ZoomInRounded'
import ZoomOutRoundedIcon from '@mui/icons-material/ZoomOutRounded'
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded'
import { NO_ADJUST, SNAPSHOT_ASPECT, type SnapshotAdjust } from './snapshotFraming'

const MIN_ZOOM = 1
const MAX_ZOOM = 4

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

interface Props {
  /** The snapshot as captured from the camera view (before any adjustment). */
  src: string
  /** Adjustment saved earlier, so reopening the editor continues from it. */
  initial: SnapshotAdjust
  onCancel: () => void
  onSave: (adjust: SnapshotAdjust) => void
}

/**
 * Zoom and position the creation snapshot (no free crop: the frame keeps the camera's shape).
 * The result is saved as a framing, so the completion snapshot is captured over exactly the same area.
 */
export default function SnapshotFrame({ src, initial, onCancel, onSave }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; u: number; v: number } | null>(null)
  const [width, setWidth] = useState(0)
  const [adjust, setAdjust] = useState<SnapshotAdjust>(initial)

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const height = width / SNAPSHOT_ASPECT

  /** Keeps the visible area inside the picture for the given zoom. */
  const fit = (next: SnapshotAdjust): SnapshotAdjust => {
    const zoom = clamp(next.zoom, MIN_ZOOM, MAX_ZOOM)
    const half = 0.5 / zoom
    return { zoom, u: clamp(next.u, half, 1 - half), v: clamp(next.v, half, 1 - half) }
  }

  const changeZoom = (zoom: number) => setAdjust((current) => fit({ ...current, zoom }))

  const startDrag = (e: ReactPointerEvent) => {
    if (e.button > 0) return
    stageRef.current?.setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, u: adjust.u, v: adjust.v }
  }

  const moveDrag = (e: ReactPointerEvent) => {
    const drag = dragRef.current
    if (!drag || width === 0) return
    // Dragging the picture right shows more of its left side.
    const du = (e.clientX - drag.x) / (width * adjust.zoom)
    const dv = (e.clientY - drag.y) / (height * adjust.zoom)
    setAdjust((current) => fit({ ...current, u: drag.u - du, v: drag.v - dv }))
  }

  const endDrag = (e: ReactPointerEvent) => {
    dragRef.current = null
    if (stageRef.current?.hasPointerCapture(e.pointerId)) stageRef.current.releasePointerCapture(e.pointerId)
  }

  const imageW = width * adjust.zoom
  const imageH = height * adjust.zoom
  const left = width / 2 - adjust.u * imageW
  const top = height / 2 - adjust.v * imageH
  const pillButtonSx = { borderRadius: 999, minWidth: 104, py: 1, fontWeight: 700, fontSize: 15, textTransform: 'none' as const }

  return (
    <Box
      role="group"
      aria-label="Adjust snapshot view"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: '16px',
        border: 1,
        borderColor: (t: Theme) => alpha(t.palette.text.primary, 0.2),
        bgcolor: (t: Theme) => alpha(t.palette.text.primary, 0.04),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <IconButton size="small" onClick={onCancel} aria-label="Back without changing the view">
          <ArrowBackRoundedIcon />
        </IconButton>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h3" sx={{ fontSize: 18, fontWeight: 700 }}>
            Adjust view
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Zoom and drag to frame the area. The completion snapshot is taken of exactly this area.
          </Typography>
        </Box>
      </Box>

      <Box
        ref={stageRef}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={(e) => changeZoom(adjust.zoom - e.deltaY * 0.002)}
        sx={{
          position: 'relative',
          width: '100%',
          aspectRatio: `${SNAPSHOT_ASPECT}`,
          overflow: 'hidden',
          bgcolor: '#05080f',
          cursor: adjust.zoom > 1 ? 'grab' : 'default',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        {width > 0 && (
          <Box
            component="img"
            src={src}
            alt="Snapshot being adjusted"
            draggable={false}
            sx={{ position: 'absolute', left, top, width: imageW, height: imageH, maxWidth: 'none', pointerEvents: 'none' }}
          />
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, px: 2, py: 1.5, borderTop: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: '1 1 220px', minWidth: 0 }}>
          <IconButton size="small" onClick={() => changeZoom(adjust.zoom - 0.25)} aria-label="Zoom out" disabled={adjust.zoom <= MIN_ZOOM}>
            <ZoomOutRoundedIcon />
          </IconButton>
          <Slider
            size="small"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={adjust.zoom}
            onChange={(_, value) => changeZoom(value as number)}
            aria-label="Zoom"
            sx={{ mx: 0.5 }}
          />
          <IconButton size="small" onClick={() => changeZoom(adjust.zoom + 0.25)} aria-label="Zoom in" disabled={adjust.zoom >= MAX_ZOOM}>
            <ZoomInRoundedIcon />
          </IconButton>
          <Typography variant="body2" sx={{ minWidth: 44, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(adjust.zoom * 100)}%
          </Typography>
          <IconButton size="small" onClick={() => setAdjust(NO_ADJUST)} aria-label="Reset view">
            <RestartAltRoundedIcon />
          </IconButton>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
          <Button type="button" variant="outlined" color="inherit" onClick={onCancel} sx={{ ...pillButtonSx, borderColor: (t: Theme) => alpha(t.palette.text.primary, 0.34) }}>
            Cancel
          </Button>
          <Button type="button" variant="contained" onClick={() => onSave(fit(adjust))} sx={pillButtonSx}>
            Save view
          </Button>
        </Box>
      </Box>
    </Box>
  )
}
