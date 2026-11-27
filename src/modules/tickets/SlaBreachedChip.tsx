import { Chip, Tooltip } from '@mui/material'
import AlarmOffRoundedIcon from '@mui/icons-material/AlarmOffRounded'

/** Red tag for a ticket that missed its deadline (SLA breached). */
export function SlaBreachedChip({ compact = false }: { compact?: boolean }) {
  return (
    <Tooltip title="Deadline missed (SLA breached)">
      <Chip
        size="small"
        icon={<AlarmOffRoundedIcon />}
        label={compact ? 'SLA' : 'SLA breached'}
        sx={{
          height: compact ? 20 : 26,
          fontSize: compact ? 11 : 12,
          fontWeight: 700,
          color: '#DC2626',
          bgcolor: 'rgba(220,38,38,0.12)',
          border: '1px solid rgba(220,38,38,0.35)',
          flexShrink: 0,
          '& .MuiChip-icon': { color: '#DC2626', fontSize: compact ? 14 : 16 },
        }}
      />
    </Tooltip>
  )
}
