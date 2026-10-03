import { Box, FormControl, ListSubheader, MenuItem, Select, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { SELECTIONS, SITES } from '../data/cameras'
import { kindIcon, kindLabel } from '../components/cameraKind'
import { useCameraSelection } from '../state/CameraSelectionContext'

export default function CameraDropdown({ compact = false }: { compact?: boolean }) {
  const { selectionId, select } = useCameraSelection()
  const navigate = useNavigate()

  return (
    <FormControl size="small" sx={{ width: '100%', minWidth: compact ? 0 : 220, maxWidth: { xs: '100%', sm: 360 } }}>
      <Select
        aria-label="Camera"
        variant="outlined"
        displayEmpty
        value={selectionId ?? ''}
        onChange={(e) => {
          const value = e.target.value as string
          select(value || null)
          if (value) navigate('/earth')
        }}
        renderValue={(value) => {
          const sel = SELECTIONS.find((s) => s.id === value)
          if (!sel) return <Typography color="text.secondary">Select a camera…</Typography>
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <Box sx={{ color: 'primary.main', display: 'flex' }}>{kindIcon(sel.kind)}</Box>
              <Typography noWrap variant="subtitle2">
                {sel.label}
              </Typography>
            </Box>
          )
        }}
        MenuProps={{ slotProps: { paper: { sx: { maxHeight: 440, mt: 0.5 } } } }}
        sx={(t) => ({
          borderRadius: '12px',
          fontSize: 14,
          bgcolor: t.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(118,118,128,0.10)',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: 'transparent' },
          '&:hover': { bgcolor: t.palette.mode === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(118,118,128,0.16)' },
        })}
      >
        <MenuItem value="">
          <Typography color="text.secondary">No camera selected</Typography>
        </MenuItem>
        {SITES.flatMap((site) => [
          <ListSubheader key={`${site.id}-hdr`} sx={{ bgcolor: 'transparent', lineHeight: '32px', fontWeight: 700 }}>
            {site.name}
          </ListSubheader>,
          ...SELECTIONS.filter((s) => s.siteId === site.id).map((s) => (
            <MenuItem key={s.id} value={s.id} sx={{ gap: 1.25 }}>
              <Box sx={{ color: 'primary.main', display: 'flex' }}>{kindIcon(s.kind, 20)}</Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: 14, fontWeight: 600 }}>
                  {s.label}
                </Typography>
                <Typography noWrap variant="caption" color="text.secondary">
                  {kindLabel(s.kind)}
                </Typography>
              </Box>
            </MenuItem>
          )),
        ])}
      </Select>
    </FormControl>
  )
}
