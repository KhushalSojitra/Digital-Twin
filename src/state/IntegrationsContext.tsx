import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import {
  DEFAULT_SNAPSHOT_POLICY,
  INTEGRATIONS,
  defaultIntegrationFields,
  platformForType,
  type Integration,
  type SnapshotPolicy,
} from '../data/integrations'

interface IntegrationsValue {
  integrations: Integration[]
  defaultId: string
  setDefaultId: (id: string) => void
  defaultIntegration: Integration
  snapshotPolicy: SnapshotPolicy
  setSnapshotPolicy: (policy: SnapshotPolicy) => void
  sync: (id: string) => void
  testConnection: (id: string) => Promise<boolean>
  saveIntegration: (integration: Integration) => void
  addIntegration: (input: Omit<Integration, 'id' | 'status' | 'lastSyncAt' | 'syncedTickets' | 'platform' | 'platformName'> & { id?: string }) => Integration
  removeIntegration: (id: string) => void
}

const IntegrationsContext = createContext<IntegrationsValue | null>(null)

export function IntegrationsProvider({ children }: { children: ReactNode }) {
  const [integrations, setIntegrations] = useState<Integration[]>(INTEGRATIONS)
  const [defaultId, setDefaultId] = useState('jira')

  const sync = useCallback(
    (id: string) =>
      setIntegrations((list) =>
        list.map((i) =>
          i.id === id
            ? {
                ...i,
                lastSyncAt: new Date().toISOString(),
                status: i.status === 'disconnected' ? 'connected' : i.status === 'degraded' ? 'connected' : i.status,
                syncedTickets: i.syncedTickets + 1,
              }
            : i,
        ),
      ),
    [],
  )

  const testConnection = useCallback(async (id: string) => {
    await new Promise((resolve) => window.setTimeout(resolve, 700))
    setIntegrations((list) => list.map((i) => (i.id === id ? { ...i, status: 'connected', lastSyncAt: new Date().toISOString() } : i)))
    return true
  }, [])

  const saveIntegration = useCallback((integration: Integration) => {
    const mapped = platformForType(integration.platformType)
    const next = { ...integration, ...mapped, platformName: integration.name || mapped.platformName }
    setIntegrations((list) => {
      const exists = list.some((i) => i.id === next.id)
      return exists ? list.map((i) => (i.id === next.id ? { ...i, ...next, locked: i.locked } : i)) : [...list, next]
    })
  }, [])

  const addIntegration = useCallback(
    (input: Omit<Integration, 'id' | 'status' | 'lastSyncAt' | 'syncedTickets' | 'platform' | 'platformName'> & { id?: string }) => {
      const id = input.id ?? `int-${Date.now()}`
      const mapped = platformForType(input.platformType)
      const created: Integration = {
        ...defaultIntegrationFields(id),
        ...input,
        id,
        status: 'disconnected',
        lastSyncAt: new Date(0).toISOString(),
        syncedTickets: 0,
        ...mapped,
        platformName: input.name || mapped.platformName,
        webhookListenerId: input.webhookListenerId || id,
      }
      setIntegrations((list) => [...list, created])
      return created
    },
    [],
  )

  const removeIntegration = useCallback((id: string) => {
    setIntegrations((list) => list.filter((i) => i.id !== id || i.locked))
    setDefaultId((current) => (current === id ? 'jira' : current))
  }, [])

  const value = useMemo(() => {
    const defaultIntegration = integrations.find((i) => i.id === defaultId) ?? integrations[0]
    const snapshotPolicy = defaultIntegration?.snapshotPolicy ?? DEFAULT_SNAPSHOT_POLICY
    return {
      integrations,
      defaultId,
      setDefaultId,
      defaultIntegration,
      snapshotPolicy,
      setSnapshotPolicy: (policy: SnapshotPolicy) => {
        const id = defaultId
        setIntegrations((list) => list.map((i) => (i.id === id ? { ...i, snapshotPolicy: policy } : i)))
      },
      sync,
      testConnection,
      saveIntegration,
      addIntegration,
      removeIntegration,
    }
  }, [integrations, defaultId, sync, testConnection, saveIntegration, addIntegration, removeIntegration])

  return <IntegrationsContext.Provider value={value}>{children}</IntegrationsContext.Provider>
}

export function useIntegrations() {
  const ctx = useContext(IntegrationsContext)
  if (!ctx) throw new Error('useIntegrations must be used within IntegrationsProvider')
  return ctx
}
