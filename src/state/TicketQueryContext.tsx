import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { EMPTY_FILTERS, TICKET_SIZE_DEFAULT, clampTicketSize, type TicketFilterState, type TicketPinSize, type TicketTab } from '../modules/tickets/ticketFilters'

import { usePreference } from './PreferencesContext'

/**
 * The ticket query lives above Earth and Live View so the operator's tab, search, filters and
 * Assigned-to-me choice survive moving between them.
 */
interface TicketQueryValue {
  tab: TicketTab
  setTab: (tab: TicketTab) => void
  search: string
  setSearch: (search: string) => void
  filters: TicketFilterState
  setFilters: (filters: TicketFilterState) => void
  assignedToMe: boolean
  setAssignedToMe: (on: boolean) => void
  earthTicketView: boolean
  setEarthTicketView: (on: boolean) => void
  liveTicketView: Record<string, boolean>
  isLiveTicketView: (siteId: string) => boolean
  toggleLiveTicketView: (siteId: string) => void
  earthTicketPreview: boolean
  setEarthTicketPreview: (on: boolean) => void
  ticketSize: TicketPinSize
  setTicketSize: (size: TicketPinSize) => void
}

const TicketQueryContext = createContext<TicketQueryValue | null>(null)

const EMPTY_FLAGS: Record<string, boolean> = {}

const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean'
const isFlagMap = (v: unknown): v is Record<string, boolean> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(isBoolean)

export function TicketQueryProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<TicketTab>('all')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<TicketFilterState>(EMPTY_FILTERS)
  const [assignedToMe, setAssignedToMe] = useState(false)
  const [earthTicketView, setEarthTicketView] = usePreference<boolean>('earth.ticketView', true, isBoolean)
  const [liveTicketView, setLiveTicketView] = usePreference<Record<string, boolean>>('live.ticketView', EMPTY_FLAGS, isFlagMap)
  const [earthTicketPreview, setEarthTicketPreview] = usePreference<boolean>('earth.ticketPreview', true, isBoolean)
  const [ticketSize, setTicketSizeValue] = usePreference<TicketPinSize>(
    'tickets.size',
    TICKET_SIZE_DEFAULT,
    (v) => clampTicketSize(v) === v,
  )
  const setTicketSize = useCallback((size: TicketPinSize) => setTicketSizeValue(clampTicketSize(size)), [setTicketSizeValue])

  const isLiveTicketView = (siteId: string) => liveTicketView[siteId] !== false
  const toggleLiveTicketView = (siteId: string) =>
    setLiveTicketView((prev) => ({ ...prev, [siteId]: prev[siteId] === false }))

  const value = useMemo(
    () => ({
      tab,
      setTab,
      search,
      setSearch,
      filters,
      setFilters,
      assignedToMe,
      setAssignedToMe,
      earthTicketView,
      setEarthTicketView,
      liveTicketView,
      isLiveTicketView,
      toggleLiveTicketView,
      earthTicketPreview,
      setEarthTicketPreview,
      ticketSize,
      setTicketSize,
    }),
    [tab, search, filters, assignedToMe, earthTicketView, liveTicketView, earthTicketPreview, ticketSize],
  )
  return <TicketQueryContext.Provider value={value}>{children}</TicketQueryContext.Provider>
}

export function useTicketQuery() {
  const ctx = useContext(TicketQueryContext)
  if (!ctx) throw new Error('useTicketQuery must be used within TicketQueryProvider')
  return ctx
}
