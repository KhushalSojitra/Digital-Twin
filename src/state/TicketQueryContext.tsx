import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { EMPTY_FILTERS, type TicketFilterState, type TicketPinSize, type TicketTab } from '../modules/tickets/ticketFilters'

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

const EARTH_VIEW_KEY = 'oe.earth.ticketView'
const EARTH_PREVIEW_KEY = 'oe.earth.ticketPreview'

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(key)
    return stored === null ? fallback : stored === 'true'
  } catch {
    return fallback
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    window.localStorage.setItem(key, String(on))
  } catch {
    // Storage can be unavailable (private mode); the toggle still works for this session.
  }
}

export function TicketQueryProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<TicketTab>('all')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<TicketFilterState>(EMPTY_FILTERS)
  const [assignedToMe, setAssignedToMe] = useState(false)
  const [earthTicketView, setEarthTicketViewState] = useState(() => readFlag(EARTH_VIEW_KEY, true))
  const setEarthTicketView = useCallback((on: boolean) => {
    setEarthTicketViewState(on)
    writeFlag(EARTH_VIEW_KEY, on)
  }, [])
  const [liveTicketView, setLiveTicketView] = useState<Record<string, boolean>>({})
  const [earthTicketPreview, setEarthTicketPreviewState] = useState(() => readFlag(EARTH_PREVIEW_KEY, true))
  const setEarthTicketPreview = useCallback((on: boolean) => {
    setEarthTicketPreviewState(on)
    writeFlag(EARTH_PREVIEW_KEY, on)
  }, [])
  const [ticketSize, setTicketSize] = useState<TicketPinSize>('medium')

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
