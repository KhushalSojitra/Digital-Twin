import { Box, Paper, Tab, Tabs, Typography } from '@mui/material'
import { useState } from 'react'
import TicketingIntegrations from './TicketingIntegrations'
import UserManagement from './UserManagement'
import DeviceManagement from './DeviceManagement'

type AdminTab = 'users' | 'devices' | 'tickets'

export default function Administration() {
  const [tab, setTab] = useState<AdminTab>('tickets')

  return (
    <Box sx={{ height: '100%', overflow: 'auto', p: { xs: 1.5, md: 2.5 } }}>
      <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
        <Typography variant="overline" color="text.secondary">
          Administration
        </Typography>
        <Typography variant="h5" sx={{ mb: 1.5 }}>
          Administration
        </Typography>
        <Paper elevation={0} sx={(t) => ({ border: `1px solid ${t.palette.divider}`, borderRadius: '16px', overflow: 'hidden' })}>
          <Tabs
            value={tab}
            onChange={(_, next) => setTab(next)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ px: 1, borderBottom: 1, borderColor: 'divider', minHeight: 46, '& .MuiTab-root': { minHeight: 46, textTransform: 'none' } }}
          >
            <Tab value="users" label="User Management" />
            <Tab value="devices" label="Device Management" />
            <Tab value="tickets" label="Ticket Management" />
          </Tabs>
          <Box sx={{ p: { xs: 1.5, md: 2 } }}>
            {tab === 'users' && <UserManagement />}
            {tab === 'devices' && <DeviceManagement />}
            {tab === 'tickets' && <TicketingIntegrations />}
          </Box>
        </Paper>
      </Box>
    </Box>
  )
}
