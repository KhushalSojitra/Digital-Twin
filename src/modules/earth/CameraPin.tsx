import { Box, Tooltip, Typography } from '@mui/material'
import { formatCoord } from '../../utils/format'
import { kindIcon } from '../../components/cameraKind'
import { siteStatus, type CameraSite, type DeviceStatus } from '../../data/cameras'

const STATUS_COLOR: Record<DeviceStatus, string> = { online: '#30D158', degraded: '#FF9F0A', offline: '#FF453A' }

const labelSx = {
  mt: -0.5,
  color: '#fff',
  fontSize: 12.5,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  textShadow: '0 1px 3px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.6)',
} as const

interface Props {
  site: CameraSite
  onClick: () => void
}

export default function CameraPin({ site, onClick }: Props) {
  const color = '#0A84FF'
  const status = siteStatus(site)

  return (
    <Tooltip
      arrow
      placement="top"
      enterDelay={200}
      title={
        <Box sx={{ p: 0.25 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 12.5 }}>{site.name} — 360 + PTZ combo</Typography>
          <Typography sx={{ fontSize: 11, opacity: 0.85 }}>{site.description}</Typography>
          <Typography sx={{ fontSize: 11, opacity: 0.85 }}>{site.cam360.model} · {site.cam360.ip}</Typography>
          <Typography sx={{ fontSize: 11, opacity: 0.85 }}>{site.ptz.model} · {site.ptz.ip}</Typography>
          <Typography sx={{ fontSize: 11, opacity: 0.85 }}>{formatCoord(site.cam360.lat, site.cam360.lng)}</Typography>
          <Typography sx={{ fontSize: 11, opacity: 0.85 }}>
            <Box component="span" sx={{ color: STATUS_COLOR[status], textTransform: 'capitalize' }}>
              {status}
            </Box>
          </Typography>
          <Typography sx={{ fontSize: 11, mt: 0.5, color: '#5AC8FA' }}>Click to open live view</Typography>
        </Box>
      }
    >
      <Box
        onClick={onClick}
        role="button"
        aria-label={`Open live view for ${site.name} combo camera`}
        sx={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          cursor: 'pointer',
          '&:hover .oe-pin-head': { transform: 'scale(1.12)' },
        }}
      >
        <Box sx={{ position: 'relative', width: 34, height: 44 }}>
          <Box
            className="oe-pin-head"
            sx={{
              position: 'absolute',
              inset: 0,
              transition: 'transform 150ms',
              transformOrigin: '50% 100%',
              filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.55))',
            }}
          >
            <Box component="svg" viewBox="0 0 34 44" sx={{ width: 34, height: 44, display: 'block', overflow: 'visible' }}>
              {status === 'online' && (
                <circle cx="17" cy="16" fill="none" stroke={color} strokeWidth="2">
                  <animate attributeName="r" values="8;17" dur="2.2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0" dur="2.2s" repeatCount="indefinite" />
                </circle>
              )}
              <path
                d="M17 43 C17 43 3 26 3 16 A14 14 0 0 1 31 16 C31 26 17 43 17 43 Z"
                fill={color}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth="1.5"
              />
              <circle cx="17" cy="16" r="9.5" fill="rgba(255,255,255,0.96)" />
            </Box>
            <Box sx={{ position: 'absolute', top: 7, left: 8, width: 18, height: 18, display: 'grid', placeItems: 'center', color }}>
              {kindIcon('combo', 14)}
            </Box>
            <Box
              sx={{
                position: 'absolute',
                top: 1,
                right: 3,
                width: 9,
                height: 9,
                borderRadius: '50%',
                bgcolor: STATUS_COLOR[status],
                border: '1.5px solid #fff',
              }}
            />
          </Box>
        </Box>
        <Typography className="oe-pin-label" sx={labelSx}>
          {site.name}
        </Typography>
        <Typography className="oe-site-label" sx={labelSx}>
          {site.name}
        </Typography>
      </Box>
    </Tooltip>
  )
}
