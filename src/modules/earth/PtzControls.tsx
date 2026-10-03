import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { Box, Chip, IconButton, Paper, Stack, Tooltip, type Theme } from '@mui/material'
import { hudSurface } from '../../theme/hud'
import KeyboardArrowUpRoundedIcon from '@mui/icons-material/KeyboardArrowUpRounded'
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded'
import KeyboardArrowLeftRoundedIcon from '@mui/icons-material/KeyboardArrowLeftRounded'
import KeyboardArrowRightRoundedIcon from '@mui/icons-material/KeyboardArrowRightRounded'
import HomeRoundedIcon from '@mui/icons-material/HomeRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded'

interface Props {
  /** Which head the controls are currently driving. */
  targetLabel: string
  onPan: (dx: number, dy: number) => void
  onZoom: (direction: 1 | -1) => void
  onHome: () => void
}

/** Fires `fn` immediately on press and keeps repeating while held, for a real joystick-like feel. */
function useHold(fn: () => void) {
  const timer = useRef<number | null>(null)
  const fnRef = useRef(fn)
  useEffect(() => {
    fnRef.current = fn
  }, [fn])

  const stop = () => {
    if (timer.current !== null) {
      window.clearInterval(timer.current)
      timer.current = null
    }
  }

  useEffect(() => stop, [])

  return {
    onPointerDown: (e: ReactPointerEvent) => {
      e.preventDefault()
      fnRef.current()
      stop()
      timer.current = window.setInterval(() => fnRef.current(), 70)
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
  }
}

const glass = (t: Theme) => ({
  ...hudSurface(t),
  boxShadow: t.palette.mode === 'dark' ? '0 10px 30px rgba(0,0,0,0.35)' : '0 10px 30px rgba(28,28,30,0.12)',
})

export default function PtzControls({ targetLabel, onPan, onZoom, onHome }: Props) {
  const up = useHold(() => onPan(0, 1))
  const down = useHold(() => onPan(0, -1))
  const left = useHold(() => onPan(-1, 0))
  const right = useHold(() => onPan(1, 0))
  const zoomIn = useHold(() => onZoom(1))
  const zoomOut = useHold(() => onZoom(-1))

  const btn = { width: 40, height: 40, color: 'text.primary' }

  return (
    <Stack spacing={0.75} sx={{ alignItems: 'flex-start' }}>
      <Chip
        size="small"
        label={`Controls · ${targetLabel}`}
        sx={(t) => ({ ...glass(t), boxShadow: 'none', height: 24, fontWeight: 700 })}
      />
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <Paper elevation={0} sx={(t) => ({ ...glass(t), p: 0.75, borderRadius: '999px' })}>
          <Stack sx={{ alignItems: 'center' }}>
            <Tooltip title="Zoom in" placement="left">
              <IconButton size="small" sx={btn} aria-label="Zoom in" {...zoomIn}>
                <AddRoundedIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Zoom out" placement="left">
              <IconButton size="small" sx={btn} aria-label="Zoom out" {...zoomOut}>
                <RemoveRoundedIcon />
              </IconButton>
            </Tooltip>
          </Stack>
        </Paper>

        <Paper elevation={0} sx={(t) => ({ ...glass(t), p: 0.75, borderRadius: '50%' })}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 40px)',
              gridTemplateRows: 'repeat(3, 40px)',
              placeItems: 'center',
            }}
          >
            <span />
            <IconButton size="small" sx={btn} aria-label="Tilt up" {...up}>
              <KeyboardArrowUpRoundedIcon />
            </IconButton>
            <span />
            <IconButton size="small" sx={btn} aria-label="Pan left" {...left}>
              <KeyboardArrowLeftRoundedIcon />
            </IconButton>
            <Tooltip title="Home position" placement="top">
              <IconButton
                size="small"
                onClick={onHome}
                aria-label="Home position"
                sx={{ ...btn, width: 36, height: 36, bgcolor: 'primary.main', color: '#fff', '&:hover': { bgcolor: 'primary.dark' } }}
              >
                <HomeRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton size="small" sx={btn} aria-label="Pan right" {...right}>
              <KeyboardArrowRightRoundedIcon />
            </IconButton>
            <span />
            <IconButton size="small" sx={btn} aria-label="Tilt down" {...down}>
              <KeyboardArrowDownRoundedIcon />
            </IconButton>
            <span />
          </Box>
        </Paper>
      </Stack>
    </Stack>
  )
}
