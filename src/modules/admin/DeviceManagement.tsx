import { Box, Stack, Typography } from '@mui/material'
import { SITES, siteStatus } from '../../data/cameras'
import { kindLabel } from '../../components/cameraKind'
import { NeutralChip, glassCardSx } from '../../components/ui/figma'

const sep = (
  <Box component="span" sx={{ mx: 0.75, color: 'text.secondary' }}>
    ·
  </Box>
)

export default function DeviceManagement() {
  return (
    <Stack spacing={1.5}>
      {SITES.map((site) => (
        <Box key={site.id} sx={(t) => ({ ...glassCardSx(t), px: 2, py: 1.75 })}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.75 }}>
            <Typography variant="subtitle2" sx={{ flex: 1, fontSize: 15 }}>
              {site.name}
            </Typography>
            <NeutralChip label={siteStatus(site)} />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
            {site.description}
          </Typography>
          <Stack spacing={0.75}>
            {[site.cam360, site.ptz, ...site.cctv].map((device) => (
              <Typography key={device.id} variant="body2">
                {device.name}
                {sep}
                {kindLabel(device.kind)}
                {sep}
                <Box component="span" sx={{ fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, monospace', fontSize: 12.5 }}>
                  {device.ip}
                </Box>
              </Typography>
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  )
}
