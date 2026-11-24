import { Box } from '@mui/material'
import { useState } from 'react'
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined'
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined'
import DnsOutlinedIcon from '@mui/icons-material/DnsOutlined'
import ConfirmationNumberOutlinedIcon from '@mui/icons-material/ConfirmationNumberOutlined'
import TicketingIntegrations from './TicketingIntegrations'
import UserManagement from './UserManagement'
import DeviceManagement from './DeviceManagement'
import { IconTabs, PageHeader, type IconTabItem } from '../../components/ui/figma'

type AdminTab = 'users' | 'devices' | 'tickets'

const TABS: IconTabItem<AdminTab>[] = [
  { value: 'users', label: 'User Management', icon: <PeopleAltOutlinedIcon /> },
  { value: 'devices', label: 'Device Management', icon: <DnsOutlinedIcon /> },
  { value: 'tickets', label: 'Ticket Management', icon: <ConfirmationNumberOutlinedIcon /> },
]

export default function Administration() {
  const [tab, setTab] = useState<AdminTab>('tickets')
  const current = TABS.find((t) => t.value === tab) ?? TABS[0]

  return (
    <Box sx={{ height: '100%', overflow: 'auto', px: { xs: 1.5, md: 2.5 }, py: { xs: 1.5, md: 2 } }}>
      <PageHeader icon={<ShieldOutlinedIcon />} trail={['Administration', current.label]} pageIcon={current.icon} />
      <IconTabs value={tab} onChange={setTab} items={TABS} />
      {tab === 'users' && <UserManagement />}
      {tab === 'devices' && <DeviceManagement />}
      {tab === 'tickets' && <TicketingIntegrations />}
    </Box>
  )
}
