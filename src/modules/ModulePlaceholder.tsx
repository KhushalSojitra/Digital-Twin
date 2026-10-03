import EmptyState from '../components/EmptyState'
import { MODULES } from '../layout/modules'

const COPY: Record<string, string> = {
  dashboard: 'Operational dashboards will appear here once configured for your command center.',
  reports: 'Scheduled and on-demand reports will be listed here once reporting is enabled.',
  alerts: 'Alerts from your deployed cameras and analytics will be triaged here once alerting is enabled.',
  administration: 'User, role and device administration will be available here once provisioned.',
}

export default function ModulePlaceholder({ moduleId }: { moduleId: string }) {
  const def = MODULES.find((m) => m.id === moduleId) ?? MODULES[1]
  return <EmptyState icon={def.icon} title={`${def.label} module`} description={COPY[def.id] ?? 'This module is not configured yet.'} />
}
