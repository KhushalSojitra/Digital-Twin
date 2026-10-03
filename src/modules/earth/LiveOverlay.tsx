import { useEffect, useState } from 'react'
import { Box, Chip, CircularProgress, Stack, Typography } from '@mui/material'
import WifiOffRoundedIcon from '@mui/icons-material/WifiOffRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import type { CommandPhase } from './useCameraChannel'
import type { CameraDevice } from '../../data/cameras'
import type { View } from './panoramaMath'
import { zoomFactor } from './panoramaMath'
import type { ViewerStatus } from './PanoramaViewer'
import { kindIcon } from '../../components/cameraKind'

interface Props {
  device: CameraDevice
  view: View
  status: ViewerStatus
  compact?: boolean
  showCrosshair?: boolean
  /** Extra top spacing so HUD chips clear the floating title bar in the main window. */
  topInset?: number
  /** Command acknowledgement state for this head. */
  phase?: CommandPhase
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

const hud = {
  fontFamily: '"SF Mono", ui-monospace, Menlo, Consolas, monospace',
  fontSize: 12.5,
  letterSpacing: 0.3,
  color: 'rgba(255,255,255,0.92)',
  textShadow: '0 1px 2px rgba(0,0,0,0.8)',
} as const

export default function LiveOverlay({ device, view, status, compact = false, showCrosshair = false, topInset = 0, phase = 'idle' }: Props) {
  const now = useClock()
  const isPtz = device.kind === 'ptz'
  const top = (compact ? 8 : 12) + topInset
  const headLabel = isPtz ? 'PTZ' : '360°'

  const readout = (
    <Stack direction="row" spacing={compact ? 1 : 1.5} sx={{ justifyContent: 'flex-end', mt: compact ? 0 : 0.5 }}>
      <Typography sx={{ ...hud, fontSize: compact ? 10.5 : 11.5 }}>P {view.yaw.toFixed(1)}°</Typography>
      <Typography sx={{ ...hud, fontSize: compact ? 10.5 : 11.5 }}>T {view.pitch.toFixed(1)}°</Typography>
      <Typography sx={{ ...hud, fontSize: compact ? 10.5 : 11.5 }}>
        {isPtz ? `Z ${zoomFactor(view.fov).toFixed(1)}×` : `FOV ${view.fov.toFixed(0)}°`}
      </Typography>
    </Stack>
  )

  return (
    <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* Simulated sensor look: vignette + faint scanlines */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.45) 100%), repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 3px)',
          mixBlendMode: 'normal',
        }}
      />

      {status === 'loading' && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(0,0,0,0.6)' }}>
          <Stack spacing={1.5} sx={{ alignItems: 'center' }}>
            <CircularProgress size={compact ? 24 : 36} thickness={4} sx={{ color: '#fff' }} />
            {!compact && <Typography sx={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}>Connecting to {device.name}…</Typography>}
          </Stack>
        </Box>
      )}

      {status === 'error' && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(0,0,0,0.75)' }}>
          <Stack spacing={1} sx={{ alignItems: 'center' }}>
            <WifiOffRoundedIcon sx={{ color: '#FF453A', fontSize: compact ? 28 : 40 }} />
            {!compact && (
              <Typography sx={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
                Stream unavailable — check camera connectivity.
              </Typography>
            )}
          </Stack>
        </Box>
      )}

      {showCrosshair && status === 'ready' && (
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: compact ? 28 : 44,
            height: compact ? 28 : 44,
            transform: 'translate(-50%, -50%)',
            '&::before, &::after': {
              content: '""',
              position: 'absolute',
              bgcolor: 'rgba(255,255,255,0.85)',
              boxShadow: '0 0 3px rgba(0,0,0,0.8)',
            },
            '&::before': { left: '50%', top: 0, bottom: 0, width: '1px', transform: 'translateX(-50%)' },
            '&::after': { top: '50%', left: 0, right: 0, height: '1px', transform: 'translateY(-50%)' },
          }}
        />
      )}

      {/* Top-left: LIVE + identity */}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', position: 'absolute', top, left: compact ? 8 : 14 }}>
        <Chip
          size="small"
          label="LIVE"
          icon={
            <Box
              component="span"
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: '#FF453A',
                ml: '6px !important',
                animation: 'oe-blink 1.4s ease-in-out infinite',
              }}
            />
          }
          sx={{ bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, height: 24, fontWeight: 700, backdropFilter: 'blur(8px)' }}
        />
        <Chip
          size="small"
          icon={
            <Box component="span" sx={{ display: 'flex', color: '#fff !important', ml: '6px !important' }}>
              {kindIcon(device.kind, 14)}
            </Box>
          }
          label={compact ? device.name.split(' — ')[0] : device.name}
          sx={{
            bgcolor: 'rgba(0,0,0,0.6)',
            color: '#fff',
            fontSize: 12,
            height: 22,
            backdropFilter: 'blur(8px)',
            maxWidth: compact ? 140 : 320,
          }}
        />
      </Stack>

      {/* Top-right: clock + stream info */}
      <Box sx={{ position: 'absolute', top, right: compact ? 8 : 14, textAlign: 'right' }}>
        <Typography sx={{ ...hud, fontSize: compact ? 11 : 12.5 }}>
          {now.toLocaleTimeString([], { hour12: false })}
          {!compact && `  ·  ${now.toLocaleDateString([], { year: 'numeric', month: 'short', day: '2-digit' })}`}
        </Typography>
        {!compact && <Typography sx={{ ...hud, fontSize: 10.5, opacity: 0.75 }}>{device.streamLabel}</Typography>}
        {!compact && readout}
      </Box>

      {compact && <Box sx={{ position: 'absolute', bottom: 8, left: 8 }}>{readout}</Box>}

      {status === 'ready' && phase !== 'idle' && (
        <Chip
          size="small"
          icon={
            phase === 'reached' ? (
              <CheckCircleRoundedIcon sx={{ color: '#30D158 !important', fontSize: 16 }} />
            ) : (
              <CircularProgress size={12} thickness={5} sx={{ color: '#fff', ml: '6px !important' }} />
            )
          }
          label={
            phase === 'sending'
              ? `Sending command to ${headLabel}…`
              : phase === 'moving'
                ? `${headLabel} moving to position…`
                : 'Position reached'
          }
          sx={{
            position: 'absolute',
            left: '50%',
            bottom: compact ? 30 : 16,
            transform: 'translateX(-50%)',
            bgcolor: 'rgba(0,0,0,0.65)',
            color: '#fff',
            fontSize: compact ? 10.5 : 12,
            height: compact ? 22 : 26,
            fontWeight: 600,
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.18)',
            maxWidth: 'calc(100% - 16px)',
          }}
        />
      )}
    </Box>
  )
}
