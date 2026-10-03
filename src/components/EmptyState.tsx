import { Box, Paper, Typography } from '@mui/material'
import type { SvgIconComponent } from '@mui/icons-material'

interface Props {
  icon: SvgIconComponent
  title: string
  description: string
}

export default function EmptyState({ icon: Icon, title, description }: Props) {
  return (
    <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 3, overflow: 'auto' }}>
      <Paper
        elevation={0}
        sx={(t) => ({
          maxWidth: 440,
          width: '100%',
          p: 4,
          textAlign: 'center',
          border: `1px solid ${t.palette.divider}`,
        })}
      >
        <Box
          sx={(t) => ({
            width: 64,
            height: 64,
            borderRadius: '20px',
            mx: 'auto',
            mb: 2,
            display: 'grid',
            placeItems: 'center',
            color: 'primary.main',
            bgcolor: t.palette.mode === 'dark' ? 'rgba(10,132,255,0.16)' : 'rgba(0,122,255,0.10)',
          })}
        >
          <Icon sx={{ fontSize: 32 }} />
        </Box>
        <Typography variant="h6" gutterBottom>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      </Paper>
    </Box>
  )
}
