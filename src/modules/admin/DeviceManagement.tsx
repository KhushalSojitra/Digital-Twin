import { Chip, Paper, Stack, Typography } from '@mui/material'
import { SITES, siteStatus } from '../../data/cameras'
import { kindLabel } from '../../components/cameraKind'

export default function DeviceManagement() {
  return (
    <Stack spacing={1.25}>
      <Typography variant="body2" color="text.secondary">
        Deployed 360 + PTZ combo sites used by Earth and Live View.
      </Typography>
      {SITES.map((site) => (
        <Paper key={site.id} elevation={0} sx={(t) => ({ p: 1.5, borderRadius: '14px', border: `1px solid ${t.palette.divider}` })}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75 }}>
            <Typography variant="subtitle2" sx={{ flex: 1 }}>
              {site.name}
            </Typography>
            <Chip size="small" label={siteStatus(site)} />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {site.description}
          </Typography>
          <Stack spacing={0.5} sx={{ mt: 1 }}>
            {[site.cam360, site.ptz].map((device) => (
              <Typography key={device.id} variant="body2">
                {device.name} · {kindLabel(device.kind)} · {device.ip}
              </Typography>
            ))}
          </Stack>
        </Paper>
      ))}
    </Stack>
  )
}
