import type { SvgIconComponent } from '@mui/icons-material'
import PublicRoundedIcon from '@mui/icons-material/PublicRounded'
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded'
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded'

export interface ModuleDef {
  id: string
  label: string
  path: string
  icon: SvgIconComponent
}

export const MODULES: ModuleDef[] = [
  { id: 'earth', label: 'Earth', path: '/earth', icon: PublicRoundedIcon },
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: DashboardRoundedIcon },
  { id: 'reports', label: 'Reports', path: '/reports', icon: AssessmentRoundedIcon },
  { id: 'alerts', label: 'Alerts', path: '/alerts', icon: WarningAmberRoundedIcon },
  { id: 'administration', label: 'Administration', path: '/administration', icon: AdminPanelSettingsRoundedIcon },
]
