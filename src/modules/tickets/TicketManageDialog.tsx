import { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Popover,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import MyLocationRoundedIcon from '@mui/icons-material/MyLocationRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded'
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined'
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import TicketGlyph from '../../components/TicketGlyph'
import TicketFilters from './TicketFilters'
import TicketUpdateDot from './TicketUpdateDot'
import { TicketDeleteDialog } from './TicketMarkerMenu'
import { SCOPES, applyTicketQuery, matchesScope, type TicketFilterState, type TicketScope } from './ticketFilters'
import {
  LIFECYCLE_LABEL,
  NEXT_STATES,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_NEEDS_DARK_TEXT,
  UNASSIGNED,
  isUnassigned,
  lastStateChangeAt,
  ticketContextLabel,
  type LifecycleState,
  type Ticket,
} from '../../data/tickets'
import { formatDateTime, formatRelative } from '../../utils/format'
import { useTickets } from '../../state/TicketsContext'
import { dialogPaperSx } from '../../theme/hud'

interface Props {
  open: boolean
  tickets: Ticket[]
  filters: TicketFilterState
  onFiltersChange: (next: TicketFilterState) => void
  hideFilters?: Array<keyof TicketFilterState>
  me: string
  canEdit: boolean
  onClose: () => void
  onOpen: (ticket: Ticket) => void
  onEdit: (ticket: Ticket) => void
  onHistory: (ticket: Ticket) => void
  onGoToLocation?: (ticket: Ticket) => void
  /** Opens the camera a ticket was raised on; only offered for camera-associated tickets. */
  onGoToCamera?: (ticket: Ticket) => void
}

export default function TicketManageDialog({
  open,
  tickets,
  filters,
  onFiltersChange,
  hideFilters,
  me,
  canEdit,
  onClose,
  onOpen,
  onEdit,
  onHistory,
  onGoToLocation,
  onGoToCamera,
}: Props) {
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))
  const { transition } = useTickets()
  const [deleting, setDeleting] = useState<Ticket | null>(null)
  const [search, setSearch] = useState('')
  const [filterEl, setFilterEl] = useState<HTMLElement | null>(null)
  const [scope, setScope] = useState<TicketScope>('all')
  const queried = useMemo(
    () => applyTicketQuery(tickets, { tab: 'all', search, filters, me, assignedToMe: false }),
    [tickets, search, filters, me],
  )
  const scopeCounts = useMemo(
    () => Object.fromEntries(SCOPES.map((s) => [s.id, queried.filter((t) => matchesScope(t, s.id, me)).length])) as Record<TicketScope, number>,
    [queried, me],
  )
  const visible = useMemo(() => queried.filter((t) => matchesScope(t, scope, me)), [queried, scope, me])

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      fullScreen={isXs}
      maxWidth="md"
      slotProps={{ paper: { sx: { ...dialogPaperSx, height: isXs ? '100%' : 'min(720px, 86dvh)' } } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1.5, pr: 1 }}>
        <Typography variant="h6" sx={{ flex: 1, minWidth: 0 }}>
          Manage Tickets
        </Typography>
        <Tooltip title="Filters">
          <IconButton
            size="small"
            onClick={(e) => setFilterEl(filterEl ? null : e.currentTarget)}
            color={filterEl ? 'primary' : 'default'}
            aria-label="Filters"
          >
            <FilterListRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, pb: 2, px: { xs: 1.5, sm: 2 } }}>
        <TextField
          size="small"
          placeholder="Search ID or title"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }}
        />
        <Stack
          direction="row"
          spacing={0.75}
          role="tablist"
          aria-label="Ticket views"
          sx={{ overflowX: 'auto', flexShrink: 0, pb: 0.25, '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}
        >
          {SCOPES.map((s) => {
            const active = scope === s.id
            return (
              <Chip
                key={s.id}
                role="tab"
                aria-selected={active}
                clickable
                onClick={() => setScope(s.id)}
                color={active ? 'primary' : 'default'}
                variant={active ? 'filled' : 'outlined'}
                label={`${s.label} · ${scopeCounts[s.id]}`}
                sx={{ height: 30, fontSize: 13, flexShrink: 0 }}
              />
            )
          })}
        </Stack>
        <Popover
          open={Boolean(filterEl)}
          anchorEl={filterEl}
          onClose={() => setFilterEl(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          sx={{ zIndex: (t) => t.zIndex.modal + 6 }}
          slotProps={{ paper: { sx: { p: 1.25, mt: 0.75, width: { xs: 'min(360px, calc(100vw - 20px))', sm: 360 }, borderRadius: '14px' } } }}
        >
          <TicketFilters value={filters} onChange={onFiltersChange} hide={hideFilters} />
        </Popover>

        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {visible.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No tickets match these filters.
            </Typography>
          )}
          <Stack spacing={0.75}>
            {visible.map((t) => (
              <Box
                key={t.id}
                sx={(th) => ({
                  px: 1.25,
                  py: 1,
                  borderRadius: '12px',
                  border: `1px solid ${th.palette.divider}`,
                  transition: 'border-color 120ms, background-color 120ms',
                  '&:hover': { bgcolor: 'action.hover', borderColor: th.palette.primary.main },
                })}
              >
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0, flex: 1 }}>
                    <TicketGlyph color={STATUS_COLOR[t.status]} size={20} critical={t.priority === 'critical'} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
                        <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, minWidth: 0 }} noWrap title={t.title}>
                          {t.title}
                        </Typography>
                        <TicketUpdateDot ticket={t} />
                      </Stack>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, mt: 0.5 }}>
                        <Chip
                          size="small"
                          label={STATUS_LABEL[t.status]}
                          sx={{
                            height: 22,
                            fontSize: 12,
                            color: STATUS_NEEDS_DARK_TEXT.includes(t.status) ? '#1C1C1E' : '#fff',
                            bgcolor: STATUS_COLOR[t.status],
                          }}
                        />
                        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                          <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: PRIORITY_COLOR[t.priority] }} />
                          <Typography variant="caption" sx={{ fontWeight: 600 }}>
                            {PRIORITY_LABEL[t.priority]}
                          </Typography>
                        </Stack>
                        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
                          <VideocamOutlinedIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {ticketContextLabel(t)}
                          </Typography>
                        </Stack>
                      </Stack>
                      {t.description && (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.5, fontSize: 13, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                        >
                          {t.description}
                        </Typography>
                      )}
                      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.25, mt: 0.5 }}>
                        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                          <PersonOutlineRoundedIcon sx={{ fontSize: 15, color: isUnassigned(t.assignee) ? 'warning.main' : 'text.secondary' }} />
                          <Typography
                            variant="caption"
                            sx={{ fontWeight: 600, color: isUnassigned(t.assignee) ? 'warning.main' : 'text.primary' }}
                          >
                            {isUnassigned(t.assignee) ? UNASSIGNED : t.assignee}
                          </Typography>
                        </Stack>
                        <Tooltip title={formatDateTime(lastStateChangeAt(t))}>
                          <Typography variant="caption" color="text.secondary">
                            State changed {formatRelative(lastStateChangeAt(t))}
                          </Typography>
                        </Tooltip>
                        <Typography
                          variant="caption"
                          color="text.disabled"
                          sx={{ fontFamily: '"SF Mono", ui-monospace, Menlo, monospace', fontSize: 11 }}
                        >
                          {t.id}
                        </Typography>
                      </Stack>
                    </Box>
                  </Stack>
                  <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center', flexWrap: 'wrap', justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
                    <Tooltip title="Open ticket">
                      <IconButton size="small" aria-label={`Open ${t.id}`} onClick={() => onOpen(t)}>
                        <VisibilityRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {canEdit && (
                      <Tooltip title="Edit ticket">
                        <IconButton size="small" aria-label={`Edit ${t.id}`} onClick={() => onEdit(t)}>
                          <EditRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {onGoToLocation && (
                      <Tooltip title="Go to Location">
                        <IconButton size="small" aria-label={`Go to location ${t.id}`} onClick={() => onGoToLocation(t)}>
                          <MyLocationRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {canEdit && (
                      <Tooltip title="Delete ticket">
                        <IconButton
                          size="small"
                          color="error"
                          aria-label={`Delete ${t.id}`}
                          onClick={() => setDeleting(t)}
                        >
                          <DeleteOutlineRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {onGoToCamera && t.cameraId && (
                      <Tooltip title="Go to Camera">
                        <IconButton size="small" aria-label={`Go to camera ${t.id}`} onClick={() => onGoToCamera(t)}>
                          <VideocamRoundedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="History">
                      <IconButton size="small" aria-label={`History ${t.id}`} onClick={() => onHistory(t)}>
                        <HistoryRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {canEdit &&
                      (NEXT_STATES[t.status] ?? []).slice(0, 2).map((state) => (
                        <Button key={state} size="small" variant="outlined" onClick={() => transition(t.id, state, { by: me })}>
                          {LIFECYCLE_LABEL[state as LifecycleState]}
                        </Button>
                      ))}
                  </Stack>
                </Stack>
              </Box>
            ))}
          </Stack>
        </Box>

      </DialogContent>
      <TicketDeleteDialog ticket={deleting} onClose={() => setDeleting(null)} />
    </Dialog>
  )
}
