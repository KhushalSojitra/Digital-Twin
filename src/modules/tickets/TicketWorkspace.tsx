import { useMemo, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Chip,
  Collapse,
  IconButton,
  InputAdornment,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import ConfirmationNumberRoundedIcon from '@mui/icons-material/ConfirmationNumberRounded'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import ClearRoundedIcon from '@mui/icons-material/ClearRounded'
import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import AssignmentIndRoundedIcon from '@mui/icons-material/AssignmentIndRounded'
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded'
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded'
import type { NewTicketInput, Ticket } from '../../data/tickets'
import TicketCard from './TicketCard'
import TicketFilters from './TicketFilters'
import TicketDetailsDrawer from './TicketDetailsDrawer'
import NewTicketPanel, { type TicketDraft } from './NewTicketPanel'
import ImprovementSummary from './ImprovementSummary'
import { useTicketQuery } from '../../state/TicketQueryContext'
import { TABS, activeFilterCount, applyTicketQuery, type TicketTab } from './ticketFilters'

export const TICKET_RAIL_WIDTH = 44

interface Props {
  expanded: boolean
  onToggle: () => void
  /** Tickets already scoped to the surrounding camera context. */
  tickets: Ticket[]
  contextLabel: string
  selectedId: string | null
  onSelect: (id: string | null) => void
  onGoToLocation: (ticket: Ticket) => void
  /** Create flow: the parent captures a location on the video, then hands over a draft. */
  placing: boolean
  onStartPlacing: () => void
  onCancelPlacing: () => void
  draft: TicketDraft | null
  creator: string
  onCreate: (input: NewTicketInput) => void
}

export default function TicketWorkspace({
  expanded,
  onToggle,
  tickets,
  contextLabel,
  selectedId,
  onSelect,
  onGoToLocation,
  placing,
  onStartPlacing,
  onCancelPlacing,
  draft,
  creator,
  onCreate,
}: Props) {
  const theme = useTheme()
  const isSmall = useMediaQuery(theme.breakpoints.down('sm'))

  // Query state is shared with Earth view so it survives switching between them.
  const { tab, setTab, search, setSearch, filters, setFilters, assignedToMe, setAssignedToMe } = useTicketQuery()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)

  const openCount = useMemo(() => tickets.filter((t) => t.status === 'open').length, [tickets])
  const query = useMemo(() => ({ tab, search, filters, me: creator, assignedToMe }), [tab, search, filters, creator, assignedToMe])
  const counts = useMemo(
    () =>
      Object.fromEntries(TABS.map((t) => [t.id, applyTicketQuery(tickets, { ...query, tab: t.id }).length])) as Record<TicketTab, number>,
    [tickets, query],
  )
  const visible = useMemo(() => applyTicketQuery(tickets, query), [tickets, query])
  const selected = tickets.find((t) => t.id === selectedId) ?? null
  const filterCount = activeFilterCount(filters)

  const surface = theme.palette.mode === 'dark' ? 'rgba(15,18,25,0.92)' : 'rgba(255,255,255,0.94)'
  const panelWidth = isSmall ? '100vw' : 'clamp(300px, 25vw, 480px)'
  const width = expanded ? (isSmall ? '100%' : panelWidth) : TICKET_RAIL_WIDTH

  return (
    <Box
      component="aside"
      aria-label="Ticket workspace"
      sx={{
        position: isSmall && expanded ? 'absolute' : 'relative',
        inset: isSmall && expanded ? 0 : undefined,
        zIndex: 3,
        width,
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: `1px solid ${theme.palette.divider}`,
        bgcolor: surface,
        backdropFilter: 'saturate(180%) blur(20px)',
        transition: 'width 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        overflow: 'hidden',
      }}
    >
      {!expanded ? (
        <Stack sx={{ alignItems: 'center', pt: 0.75, gap: 0.5 }}>
          <Tooltip title="Open ticket workspace" placement="left">
            <IconButton size="small" onClick={onToggle} aria-label="Open ticket workspace" aria-expanded={false} color="primary">
              <Badge
                badgeContent={openCount}
                color="error"
                max={99}
                slotProps={{ badge: { sx: { fontSize: 9, height: 15, minWidth: 15 } } }}
              >
                <ConfirmationNumberRoundedIcon fontSize="small" />
              </Badge>
            </IconButton>
          </Tooltip>
          <Typography
            variant="caption"
            sx={{
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              fontWeight: 700,
              fontSize: 10,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
              color: 'text.secondary',
              mt: 0.5,
            }}
          >
            Tickets
          </Typography>
        </Stack>
      ) : (
        // Content is laid out at its final width immediately so the tab scroller never measures a mid-transition size.
        <Box sx={{ position: 'relative', width: panelWidth, height: '100%', display: 'flex', flexDirection: 'column' }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', px: 1, py: 0.75 }}>
            <Chip
              size="small"
              icon={<VideocamRoundedIcon />}
              label={contextLabel}
              color="primary"
              variant="outlined"
              sx={{ height: 24, fontSize: 11, fontWeight: 700, maxWidth: '100%' }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
              {openCount} open
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Tooltip title={summaryOpen ? 'Hide improvement summary' : 'Improvement summary'}>
              <IconButton
                size="small"
                onClick={() => setSummaryOpen((v) => !v)}
                aria-label="Improvement summary"
                aria-expanded={summaryOpen}
                color={summaryOpen ? 'primary' : 'default'}
              >
                <TrendingUpRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={placing ? 'Cancel placing' : 'New ticket — click on the video to place it'}>
              <IconButton
                size="small"
                color={placing ? 'error' : 'primary'}
                onClick={placing ? onCancelPlacing : onStartPlacing}
                aria-label={placing ? 'Cancel new ticket placement' : 'New ticket'}
              >
                {placing ? <ClearRoundedIcon fontSize="small" /> : <AddRoundedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Collapse ticket workspace">
              <IconButton size="small" onClick={onToggle} aria-label="Collapse ticket workspace" aria-expanded>
                <ChevronRightRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>

          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v as TicketTab)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              minHeight: 34,
              borderBottom: `1px solid ${theme.palette.divider}`,
              '& .MuiTab-root': { minHeight: 34, minWidth: 0, px: 1.1, fontSize: 12, textTransform: 'none', fontWeight: 600 },
              '& .MuiTabs-scrollButtons': { width: 22 },
            }}
          >
            {TABS.map((t) => (
              <Tab
                key={t.id}
                value={t.id}
                label={
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                    <span>{t.label}</span>
                    <Typography component="span" variant="caption" sx={{ opacity: 0.7 }}>
                      {counts[t.id]}
                    </Typography>
                  </Stack>
                }
              />
            ))}
          </Tabs>

          <Stack direction="row" spacing={0.75} sx={{ px: 1, pt: 1, pb: 0.75, alignItems: 'center' }}>
            <TextField
              size="small"
              variant="outlined"
              placeholder="Search ID or title"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: 1, '& .MuiInputBase-root': { height: 34 } }}
              slotProps={{
                input: {
                  'aria-label': 'Search tickets',
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                  endAdornment: search ? (
                    <InputAdornment position="end">
                      <IconButton size="small" edge="end" onClick={() => setSearch('')} aria-label="Clear search">
                        <ClearRoundedIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : undefined,
                },
              }}
            />
            <Tooltip title={assignedToMe ? 'Showing tickets assigned to you' : 'Show only tickets assigned to you'}>
              <IconButton
                size="small"
                onClick={() => setAssignedToMe(!assignedToMe)}
                aria-label="Assigned to me"
                aria-pressed={assignedToMe}
                color={assignedToMe ? 'primary' : 'default'}
                sx={{
                  border: `1px solid ${assignedToMe ? theme.palette.primary.main : theme.palette.divider}`,
                  height: 34,
                  width: 34,
                  bgcolor: assignedToMe ? 'action.selected' : undefined,
                }}
              >
                <AssignmentIndRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Filters">
              <IconButton
                size="small"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-label="Toggle filters"
                aria-expanded={filtersOpen}
                color={filtersOpen || filterCount > 0 ? 'primary' : 'default'}
                sx={{ border: `1px solid ${theme.palette.divider}`, height: 34, width: 34 }}
              >
                <Badge badgeContent={filterCount} color="primary" slotProps={{ badge: { sx: { fontSize: 9, height: 15, minWidth: 15 } } }}>
                  <FilterListRoundedIcon fontSize="small" />
                </Badge>
              </IconButton>
            </Tooltip>
          </Stack>
          <Collapse in={summaryOpen} unmountOnExit>
            <Box sx={(t) => ({ borderBottom: `1px solid ${t.palette.divider}` })}>
              <ImprovementSummary tickets={tickets} scopeLabel={contextLabel} dense />
            </Box>
          </Collapse>
          <Collapse in={filtersOpen} unmountOnExit>
            <Box sx={{ px: 1, pb: 1 }}>
              <TicketFilters value={filters} onChange={setFilters} hide={['cameraId']} />
            </Box>
          </Collapse>

          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 1, pb: 1 }}>
            {visible.length === 0 ? (
              <Box sx={{ py: 4, textAlign: 'center' }}>
                <ConfirmationNumberRoundedIcon sx={{ fontSize: 28, color: 'text.disabled' }} />
                <Typography sx={{ fontWeight: 600, mt: 0.5, fontSize: 14 }}>No tickets here</Typography>
                <Typography variant="caption" color="text.secondary">
                  {search || filterCount > 0 || assignedToMe
                    ? 'Try a different search or clear the filters.'
                    : `No ${TABS.find((t) => t.id === tab)?.label.toLowerCase()} tickets for this camera.`}
                </Typography>
                {!search && filterCount === 0 && tab === 'open' && (
                  <Box sx={{ mt: 1 }}>
                    <Button size="small" startIcon={<AddRoundedIcon />} onClick={onStartPlacing}>
                      New ticket
                    </Button>
                  </Box>
                )}
              </Box>
            ) : (
              <Stack spacing={0.75}>
                {visible.map((t) => (
                  <TicketCard
                    key={t.id}
                    ticket={t}
                    me={creator}
                    selected={t.id === selectedId}
                    onOpen={(ticket) => onSelect(ticket.id)}
                    onGoToLocation={onGoToLocation}
                  />
                ))}
              </Stack>
            )}
          </Box>

          <TicketDetailsDrawer ticket={selected} onClose={() => onSelect(null)} onGoToLocation={onGoToLocation} />
          <NewTicketPanel draft={draft} creator={creator} onSubmit={onCreate} onCancel={onCancelPlacing} />
        </Box>
      )}
    </Box>
  )
}
