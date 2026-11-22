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
  /** Ticket preview inside a camera — stored per camera (site). */
  isLiveTicketPreview: (siteId: string) => boolean
  setLiveTicketPreview: (siteId: string, on: boolean) => void
  /** Ticket size on the Earth view. */
  ticketSize: TicketPinSize
  setTicketSize: (size: TicketPinSize) => void
  /** Ticket size inside a camera — stored per camera (site). */
  liveTicketSize: (siteId: string) => TicketPinSize
  setLiveTicketSize: (siteId: string, size: TicketPinSize) => void
}

const TicketQueryContext = createContext<TicketQueryValue | null>(null)

const EMPTY_FLAGS: Record<string, boolean> = {}

const isBoolean = (v: unknown): v is boolean => typeof v === 'boolean'
const isFlagMap = (v: unknown): v is Record<string, boolean> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(isBoolean)
const isSizeMap = (v: unknown): v is Record<string, number> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every((n) => clampTicketSize(n) === n)
const EMPTY_SIZES: Record<string, number> = {}

export function TicketQueryProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<TicketTab>('all')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<TicketFilterState>(EMPTY_FILTERS)
  const [assignedToMe, setAssignedToMe] = useState(false)
  const [earthTicketView, setEarthTicketView] = usePreference<boolean>('earth.ticketView', true, isBoolean)
  const [liveTicketView, setLiveTicketView] = usePreference<Record<string, boolean>>('live.ticketView', EMPTY_FLAGS, isFlagMap)
  // Earth and each camera keep their own view / preview / size, per user (user_preferences).
  const [earthTicketPreview, setEarthTicketPreview] = usePreference<boolean>('earth.ticketPreview', true, isBoolean)
  const [livePreviewBySite, setLivePreviewBySite] = usePreference<Record<string, boolean>>('live.ticketPreviewBySite', EMPTY_FLAGS, isFlagMap)
  const [ticketSize, setTicketSizeValue] = usePreference<TicketPinSize>(
    'earth.ticketSize',
    TICKET_SIZE_DEFAULT,
    (v) => clampTicketSize(v) === v,
  )
  const [liveSizeBySite, setLiveSizeBySite] = usePreference<Record<string, number>>('live.ticketSizeBySite', EMPTY_SIZES, isSizeMap)
  const setTicketSize = useCallback((size: TicketPinSize) => setTicketSizeValue(clampTicketSize(size)), [setTicketSizeValue])

  const isLiveTicketView = useCallback((siteId: string) => liveTicketView[siteId] !== false, [liveTicketView])
  const toggleLiveTicketView = useCallback(
    (siteId: string) => setLiveTicketView((prev) => ({ ...prev, [siteId]: prev[siteId] === false })),
    [setLiveTicketView],
  )
  const isLiveTicketPreview = useCallback((siteId: string) => livePreviewBySite[siteId] !== false, [livePreviewBySite])
  const setLiveTicketPreview = useCallback(
    (siteId: string, on: boolean) => setLivePreviewBySite((prev) => ({ ...prev, [siteId]: on })),
    [setLivePreviewBySite],
  )
  const liveTicketSize = useCallback((siteId: string) => liveSizeBySite[siteId] ?? TICKET_SIZE_DEFAULT, [liveSizeBySite])
  const setLiveTicketSize = useCallback(
    (siteId: string, size: TicketPinSize) => setLiveSizeBySite((prev) => ({ ...prev, [siteId]: clampTicketSize(size) })),
    [setLiveSizeBySite],
  )

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
      isLiveTicketPreview,
      setLiveTicketPreview,
      ticketSize,
      setTicketSize,
      liveTicketSize,
      setLiveTicketSize,
    }),
    // The setters must be listed: they change when the signed-in user changes, and a stale setter would
    // write for the previous (or no) user, so the toggles silently did nothing after sign-in.
    [
      tab, search, filters, assignedToMe,
      earthTicketView, setEarthTicketView, liveTicketView, isLiveTicketView, toggleLiveTicketView,
      earthTicketPreview, setEarthTicketPreview, isLiveTicketPreview, setLiveTicketPreview,
      ticketSize, setTicketSize, liveTicketSize, setLiveTicketSize,
    ],
  )
  return <TicketQueryContext.Provider value={value}>{children}</TicketQueryContext.Provider>
}

export function useTicketQuery() {
  const ctx = useContext(TicketQueryContext)
  if (!ctx) throw new Error('useTicketQuery must be used within TicketQueryProvider')
  return ctx
}
