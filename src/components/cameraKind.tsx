import { Box } from '@mui/material'
import ThreeSixtyRoundedIcon from '@mui/icons-material/ThreeSixtyRounded'
import ControlCameraRoundedIcon from '@mui/icons-material/ControlCameraRounded'
import type { SelectionKind } from '../data/cameras'

export function kindIcon(kind: SelectionKind, size = 18) {
  const sx = { fontSize: size }
  if (kind === '360') return <ThreeSixtyRoundedIcon sx={sx} />
  if (kind === 'ptz') return <ControlCameraRoundedIcon sx={sx} />
  return (
    <Box sx={{ position: 'relative', width: size, height: size }}>
      <ThreeSixtyRoundedIcon sx={{ fontSize: size, position: 'absolute', inset: 0 }} />
      <ControlCameraRoundedIcon sx={{ fontSize: size * 0.52, position: 'absolute', right: -1, bottom: -1 }} />
    </Box>
  )
}

export function kindLabel(kind: SelectionKind) {
  if (kind === '360') return '360° camera'
  if (kind === 'ptz') return 'PTZ camera'
  return '360° + PTZ combo'
}
