import { useCallback, useEffect, useRef } from 'react'
import { Badge, Box, ButtonBase, Tooltip, Typography } from '@mui/material'
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded'
import type { CameraDevice, DeviceStatus } from '../../data/cameras'
import { useViewerFrame, type Projector } from './viewerProjection'

export const CCTV_STATUS_COLOR: Record<DeviceStatus, string> = {
  online: '#30D158',
  degraded: '#FFD60A',
  offline: '#FF453A',
}

interface Props {
  cameras: CameraDevice[]
  /** Open (non-historical) ticket count per CCTV id. */
  openCounts: Record<string, number>
  activeId: string | null
  compact?: boolean
  onSelect: (device: CameraDevice, screen: { clientX: number; clientY: number }) => void
}

/** Fixed CCTV camera icons pinned to their mounting direction inside a 360° environment. */
export default function CctvLayer({ cameras, openCounts, activeId, compact = false, onSelect }: Props) {
  const nodes = useRef(new Map<string, HTMLElement>())
  const camerasRef = useRef(cameras)

  const onFrame = useCallback((project: Projector) => {
    for (const camera of camerasRef.current) {
      const el = nodes.current.get(camera.id)
      if (!el || !camera.view) continue
      const p = project(camera.view)
      if (!p.visible) {
        el.style.display = 'none'
        continue
      }
      el.style.display = 'block'
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`
    }
  }, [])
  const hub = useViewerFrame(onFrame)
  useEffect(() => {
    camerasRef.current = cameras
    hub?.requestFrame()
  }, [cameras, hub])

  const size = compact ? 18 : 30

  return (
    <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 2 }}>
      {cameras.map((camera) => {
        const color = CCTV_STATUS_COLOR[camera.status]
        const active = camera.id === activeId
        return (
          <Box
            key={camera.id}
            ref={(el: HTMLElement | null) => {
              if (el) nodes.current.set(camera.id, el)
              else nodes.current.delete(camera.id)
            }}
            sx={{ position: 'absolute', top: 0, left: 0, display: 'none', pointerEvents: compact ? 'none' : 'auto' }}
          >
            <Tooltip
              title={
                <Box>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{camera.name}</Typography>
                  <Typography sx={{ fontSize: 11, opacity: 0.85 }}>
                    {camera.zone} · {camera.status}
                  </Typography>
                </Box>
              }
              disableHoverListener={compact}
            >
              <ButtonBase
                aria-label={`Open ${camera.name}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => onSelect(camera, { clientX: e.clientX, clientY: e.clientY })}
                sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderRadius: '10px' }}
              >
                <Badge
                  badgeContent={openCounts[camera.id] ?? 0}
                  color="error"
                  invisible={compact || !openCounts[camera.id]}
                  slotProps={{ badge: { sx: { fontSize: 10, height: 16, minWidth: 16 } } }}
                >
                  <Box
                    sx={{
                      width: size,
                      height: size,
                      borderRadius: '9px',
                      display: 'grid',
                      placeItems: 'center',
                      bgcolor: active ? '#0A84FF' : 'rgba(10,12,16,0.78)',
                      color: '#fff',
                      border: `2px solid ${color}`,
                      boxShadow: active ? '0 0 0 4px rgba(10,132,255,0.35)' : '0 4px 14px rgba(0,0,0,0.45)',
                      backdropFilter: 'blur(6px)',
                    }}
                  >
                    <VideocamRoundedIcon sx={{ fontSize: compact ? 11 : 17 }} />
                  </Box>
                </Badge>
                {!compact && (
                  <Typography
                    component="span"
                    sx={{
                      mt: 0.4,
                      px: 0.75,
                      py: 0.1,
                      borderRadius: '6px',
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: '#fff',
                      bgcolor: 'rgba(10,12,16,0.72)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {camera.name}
                  </Typography>
                )}
                <Box sx={{ width: 2, height: compact ? 4 : 8, bgcolor: color, opacity: 0.8 }} />
              </ButtonBase>
            </Tooltip>
          </Box>
        )
      })}
    </Box>
  )
}
