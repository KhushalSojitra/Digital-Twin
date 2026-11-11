import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { usePreference } from '../../state/PreferencesContext'
import {
  Badge,
  Box,
  ButtonBase,
  Checkbox,
  Dialog,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Pagination,
  Popover,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
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
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded'
import ViewColumnRoundedIcon from '@mui/icons-material/ViewColumnRounded'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded'
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded'
import TicketFilters from './TicketFilters'
import TicketUpdateDot from './TicketUpdateDot'
import { TicketDeleteDialog } from './TicketMarkerMenu'
import {
  PRIORITY_RANK,
  SCOPES,
  activeFilterCount,
  applyTicketQuery,
  matchesScope,
  type TicketFilterState,
  type TicketScope,
} from './ticketFilters'
import {
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_COLOR,
  UNASSIGNED,
  isUnassigned,
  ticketContextLabel,
  type Ticket,
} from '../../data/tickets'
import { formatDateTime } from '../../utils/format'
import { useWorkflow } from '../../state/WorkflowContext'
import { useTicketActions } from './WorkflowActions'
import { dialogPaperSx } from '../../theme/hud'

type ColumnId =
  | 'title'
  | 'description'
  | 'status'
  | 'priority'
  | 'nextAction'
  | 'assignee'
  | 'reporter'
  | 'location'
  | 'createdOn'
  | 'completedOn'

interface ColumnDef {
  id: ColumnId
  label: string
  defaultVisible: boolean
  /** Always shown; cannot be hidden from the column selector. */
  locked?: boolean
  width?: number
}

const COLUMNS: ColumnDef[] = [
  { id: 'title', label: 'Title', defaultVisible: true, locked: true, width: 150 },
  { id: 'description', label: 'Description', defaultVisible: false, width: 260 },
  { id: 'status', label: 'Status', defaultVisible: true, width: 130 },
  { id: 'priority', label: 'Priority', defaultVisible: true, width: 110 },
  { id: 'nextAction', label: 'Next Action', defaultVisible: true, width: 140 },
  { id: 'assignee', label: 'Assignee', defaultVisible: true, width: 120 },
  { id: 'reporter', label: 'Reporter', defaultVisible: true, width: 110 },
  { id: 'location', label: 'Location / Camera', defaultVisible: true, width: 140 },
  { id: 'createdOn', label: 'Created On', defaultVisible: false, width: 140 },
  { id: 'completedOn', label: 'Completed On', defaultVisible: false, width: 140 },
]

const DEFAULT_VISIBLE = COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id)
const PAGE_SIZES = [5, 10, 25, 50]

interface SortState {
  id: ColumnId
  direction: 'asc' | 'desc'
}

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

const popoverZ = (t: { zIndex: { modal: number } }) => t.zIndex.modal + 6

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
  const { stateLabel, actionsFor: workflowActionsFor } = useWorkflow()
  const ticketActions = useTicketActions(me)
  const [deleting, setDeleting] = useState<Ticket | null>(null)
  const [search, setSearch] = useState('')
  const [filterEl, setFilterEl] = useState<HTMLElement | null>(null)
  const [columnsEl, setColumnsEl] = useState<HTMLElement | null>(null)
  const [menu, setMenu] = useState<{ anchor: HTMLElement; ticket: Ticket } | null>(null)
  const [scope, setScope] = usePreference<TicketScope>('manage.scope', 'all', (v) =>
    SCOPES.some((s) => s.id === v),
  )
  const [visibleColumns, setVisibleColumns] = usePreference<ColumnId[]>(
    'manage.columns',
    DEFAULT_VISIBLE,
    (v) => Array.isArray(v) && v.length > 0 && v.every((id) => COLUMNS.some((c) => c.id === id)),
  )
  const [sort, setSort] = usePreference<SortState | null>(
    'manage.sort',
    null,
    (v) => v === null || (!!v && COLUMNS.some((c) => c.id === v.id) && (v.direction === 'asc' || v.direction === 'desc')),
  )
  const [pageSize, setPageSize] = usePreference<number>('manage.pageSize', 10, (v) => PAGE_SIZES.includes(v))
  const [page, setPage] = useState(1)

  const nextActionLabel = (t: Ticket) => {
    const actions = workflowActionsFor(t)
    if (actions.length === 0) return ''
    return actions.length > 1 ? `${actions[0].label} +${actions.length - 1}` : actions[0].label
  }

  const queried = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = applyTicketQuery(tickets, { tab: 'all', search: '', filters, me, assignedToMe: false })
    if (!q) return base
    return base.filter((t) =>
      [t.title, t.description, t.assignee, t.creator, ticketContextLabel(t), t.zone, stateLabel(t)].some((value) =>
        (value ?? '').toLowerCase().includes(q),
      ),
    )
  }, [tickets, search, filters, me, stateLabel])

  const scopeCounts = useMemo(
    () => Object.fromEntries(SCOPES.map((s) => [s.id, queried.filter((t) => matchesScope(t, s.id, me)).length])) as Record<TicketScope, number>,
    [queried, me],
  )

  const sortValue = (t: Ticket, id: ColumnId): string | number => {
    switch (id) {
      case 'title':
        return t.title.toLowerCase()
      case 'description':
        return (t.description ?? '').toLowerCase()
      case 'status':
        return stateLabel(t).toLowerCase()
      case 'priority':
        return PRIORITY_RANK[t.priority]
      case 'nextAction':
        return nextActionLabel(t).toLowerCase()
      case 'assignee':
        return isUnassigned(t.assignee) ? '' : t.assignee.toLowerCase()
      case 'reporter':
        return (t.creator ?? '').toLowerCase()
      case 'location':
        return ticketContextLabel(t).toLowerCase()
      case 'createdOn':
        return t.createdAt
      case 'completedOn':
        return t.completedAt ?? ''
    }
  }

  const rows = useMemo(() => {
    const scoped = queried.filter((t) => matchesScope(t, scope, me))
    if (!sort) return scoped
    const sign = sort.direction === 'asc' ? 1 : -1
    return [...scoped].sort((a, b) => {
      const av = sortValue(a, sort.id)
      const bv = sortValue(b, sort.id)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sign
      return String(av).localeCompare(String(bv)) * sign
    })
    // sortValue reads workflow labels, which change with the workflow context
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queried, scope, me, sort, stateLabel, workflowActionsFor])

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const from = rows.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const to = Math.min(currentPage * pageSize, rows.length)

  const shownColumns = COLUMNS.filter((c) => visibleColumns.includes(c.id))
  const filterCount = activeFilterCount(filters)

  const toggleSort = (id: ColumnId) => {
    setPage(1)
    setSort((current) => {
      if (!current || current.id !== id) return { id, direction: 'asc' }
      if (current.direction === 'asc') return { id, direction: 'desc' }
      return null
    })
  }

  const toggleColumn = (id: ColumnId) => {
    setVisibleColumns((current) => (current.includes(id) ? current.filter((c) => c !== id) : [...current, id]))
    setSort((current) => (current?.id === id ? null : current))
  }

  const dot = (color: string) => (
    <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
  )

  const cell = (t: Ticket, id: ColumnId): ReactNode => {
    switch (id) {
      case 'title':
        return (
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
            <ButtonBase
              onClick={() => onOpen(t)}
              sx={{ minWidth: 0, textAlign: 'left', fontSize: 13.5, fontWeight: 600, borderRadius: '4px', '&:hover': { color: 'primary.main' } }}
              title={t.title}
            >
              <Typography noWrap sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: 'inherit' }}>
                {t.title}
              </Typography>
            </ButtonBase>
            <TicketUpdateDot ticket={t} />
          </Stack>
        )
      case 'description':
        return (
          <Typography noWrap color="text.secondary" sx={{ fontSize: 13 }} title={t.description}>
            {t.description || '—'}
          </Typography>
        )
      case 'status':
        return (
          <Stack direction="row" spacing={0.875} sx={{ alignItems: 'center' }}>
            {dot(STATUS_COLOR[t.status])}
            <Typography noWrap sx={{ fontSize: 13 }}>
              {stateLabel(t)}
            </Typography>
          </Stack>
        )
      case 'priority':
        return (
          <Stack direction="row" spacing={0.875} sx={{ alignItems: 'center' }}>
            {dot(PRIORITY_COLOR[t.priority])}
            <Typography noWrap sx={{ fontSize: 13 }}>
              {PRIORITY_LABEL[t.priority]}
            </Typography>
          </Stack>
        )
      case 'nextAction': {
        const label = nextActionLabel(t)
        return (
          <Typography noWrap color={label ? 'text.primary' : 'text.secondary'} sx={{ fontSize: 13 }}>
            {label || '—'}
          </Typography>
        )
      }
      case 'assignee':
        return (
          <Typography noWrap sx={{ fontSize: 13, color: isUnassigned(t.assignee) ? 'warning.main' : 'text.primary' }}>
            {isUnassigned(t.assignee) ? UNASSIGNED : t.assignee}
          </Typography>
        )
      case 'reporter':
        return (
          <Typography noWrap sx={{ fontSize: 13 }}>
            {t.creator || '—'}
          </Typography>
        )
      case 'location':
        return (
          <Typography noWrap sx={{ fontSize: 13 }} title={ticketContextLabel(t)}>
            {ticketContextLabel(t)}
          </Typography>
        )
      case 'createdOn':
        return (
          <Typography noWrap color="text.secondary" sx={{ fontSize: 13 }}>
            {formatDateTime(t.createdAt)}
          </Typography>
        )
      case 'completedOn':
        return (
          <Typography noWrap color="text.secondary" sx={{ fontSize: 13 }}>
            {t.completedAt ? formatDateTime(t.completedAt) : '—'}
          </Typography>
        )
    }
  }

  const menuTicket = menu?.ticket ?? null
  const closeMenu = () => setMenu(null)
  const menuItems = menuTicket
    ? [
        { key: 'open', label: 'Open', icon: <VisibilityRoundedIcon fontSize="small" />, run: () => onOpen(menuTicket) },
        canEdit && { key: 'edit', label: 'Edit', icon: <EditRoundedIcon fontSize="small" />, run: () => onEdit(menuTicket) },
        onGoToLocation && {
          key: 'location',
          label: 'Go to Location',
          icon: <MyLocationRoundedIcon fontSize="small" />,
          run: () => onGoToLocation(menuTicket),
        },
        onGoToCamera &&
          menuTicket.cameraId && {
            key: 'camera',
            label: 'Go to Camera',
            icon: <VideocamRoundedIcon fontSize="small" />,
            run: () => onGoToCamera(menuTicket),
          },
        { key: 'history', label: 'History', icon: <HistoryRoundedIcon fontSize="small" />, run: () => onHistory(menuTicket) },
      ].filter(Boolean) as Array<{ key: string; label: string; icon: ReactNode; run: () => void }>
    : []
  const menuWorkflow = menuTicket && canEdit ? ticketActions.actionsFor(menuTicket) : []

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      fullScreen={isXs}
      maxWidth="lg"
      slotProps={{ paper: { sx: { ...dialogPaperSx, height: isXs ? '100%' : 'min(720px, 88dvh)' } } }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1, px: { xs: 1.5, sm: 2.5 }, pt: 2, pb: 1.5 }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexShrink: 0 }}>
          <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>
            Ticket Management
          </Typography>
          <Box
            sx={(th) => ({
              px: 1,
              py: 0.25,
              borderRadius: '999px',
              fontSize: 12,
              fontWeight: 600,
              color: 'primary.main',
              bgcolor: th.palette.mode === 'dark' ? 'rgba(10,132,255,0.16)' : 'rgba(10,132,255,0.1)',
              border: `1px solid ${th.palette.primary.main}55`,
            })}
          >
            Total {tickets.length}
          </Box>
        </Stack>
        <TextField
          size="small"
          placeholder="Search by title or details"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          sx={{ flex: '1 1 220px', order: { xs: 3, sm: 0 }, minWidth: 0, width: { xs: '100%', sm: 'auto' } }}
          slotProps={{
            htmlInput: { 'aria-label': 'Search tickets' },
            input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> },
          }}
        />
        <Box sx={{ flex: { xs: 1, sm: 0 } }} />
        <Tooltip title="Filters">
          <IconButton
            size="small"
            onClick={(e) => setFilterEl(filterEl ? null : e.currentTarget)}
            color={filterEl || filterCount ? 'primary' : 'default'}
            aria-label="Filters"
            sx={{ border: 1, borderColor: 'divider', borderRadius: '10px', p: 0.875 }}
          >
            <Badge color="primary" badgeContent={filterCount} invisible={filterCount === 0}>
              <FilterListRoundedIcon fontSize="small" />
            </Badge>
          </IconButton>
        </Tooltip>
        <Tooltip title="Columns">
          <IconButton
            size="small"
            onClick={(e) => setColumnsEl(columnsEl ? null : e.currentTarget)}
            color={columnsEl ? 'primary' : 'default'}
            aria-label="Choose columns"
            sx={{ border: 1, borderColor: columnsEl ? 'primary.main' : 'divider', borderRadius: '10px', p: 0.875 }}
          >
            <ViewColumnRoundedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <IconButton size="small" onClick={onClose} aria-label="Close">
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Stack
        direction="row"
        spacing={0.75}
        role="tablist"
        aria-label="Ticket views"
        sx={{ px: { xs: 1.5, sm: 2.5 }, pb: 1.5, overflowX: 'auto', flexShrink: 0, '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}
      >
        {SCOPES.map((s) => {
          const active = scope === s.id
          return (
            <ButtonBase
              key={s.id}
              role="tab"
              aria-selected={active}
              onClick={() => {
                setScope(s.id)
                setPage(1)
              }}
              sx={(th) => ({
                flexShrink: 0,
                gap: 0.75,
                px: 1.5,
                height: 30,
                borderRadius: '999px',
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: 'nowrap',
                color: active ? '#fff' : 'text.primary',
                bgcolor: active ? 'primary.main' : 'transparent',
                border: `1px solid ${active ? th.palette.primary.main : th.palette.divider}`,
                '&:hover': { bgcolor: active ? 'primary.main' : 'action.hover' },
                '&:focus-visible': { outline: `2px solid ${th.palette.primary.main}`, outlineOffset: 2 },
              })}
            >
              {s.label}
              <Box
                component="span"
                sx={{
                  minWidth: 20,
                  px: 0.5,
                  borderRadius: '999px',
                  fontSize: 11.5,
                  fontWeight: 600,
                  lineHeight: '18px',
                  textAlign: 'center',
                  bgcolor: active ? 'rgba(255,255,255,0.22)' : 'action.selected',
                }}
              >
                {scopeCounts[s.id]}
              </Box>
            </ButtonBase>
          )
        })}
      </Stack>

      <Popover
        open={Boolean(filterEl)}
        anchorEl={filterEl}
        onClose={() => setFilterEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ zIndex: popoverZ }}
        slotProps={{ paper: { sx: { p: 1.25, mt: 0.75, width: { xs: 'min(360px, calc(100vw - 20px))', sm: 360 }, borderRadius: '14px' } } }}
      >
        <TicketFilters
          value={filters}
          onChange={(next) => {
            onFiltersChange(next)
            setPage(1)
          }}
          hide={hideFilters}
        />
      </Popover>

      <Popover
        open={Boolean(columnsEl)}
        anchorEl={columnsEl}
        onClose={() => setColumnsEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ zIndex: popoverZ }}
        slotProps={{ paper: { sx: { mt: 0.75, width: 240, borderRadius: '14px' } } }}
      >
        <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700 }}>Columns</Typography>
          <Typography variant="caption" color="text.secondary">
            Select columns to display
          </Typography>
        </Box>
        <Stack sx={{ px: 1.5, py: 0.5 }}>
          {COLUMNS.map((c) => (
            <FormControlLabel
              key={c.id}
              disabled={c.locked}
              control={<Checkbox size="small" checked={visibleColumns.includes(c.id)} onChange={() => toggleColumn(c.id)} />}
              label={<Typography sx={{ fontSize: 13.5 }}>{c.label}</Typography>}
              sx={{ mx: 0 }}
            />
          ))}
        </Stack>
        <Divider />
        <ButtonBase
          onClick={() => setVisibleColumns(DEFAULT_VISIBLE)}
          sx={{ width: '100%', justifyContent: 'flex-start', gap: 1, px: 2, py: 1.25, fontSize: 13.5, color: 'primary.main' }}
        >
          <RestartAltRoundedIcon fontSize="small" />
          Reset to Default
        </ButtonBase>
      </Popover>

      <TableContainer sx={{ flex: 1, minHeight: 0, borderTop: 1, borderColor: 'divider' }}>
        <Table stickyHeader size="small" sx={{ minWidth: 'max-content', width: '100%', tableLayout: 'auto' }}>
          <TableHead>
            <TableRow>
              {shownColumns.map((c, index) => (
                <TableCell
                  key={c.id}
                  sortDirection={sort?.id === c.id ? sort.direction : false}
                  sx={{
                    minWidth: c.width,
                    pl: index === 0 ? { xs: 1.5, sm: 2.5 } : 1.5,
                    py: 1,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: 'text.secondary',
                    whiteSpace: 'nowrap',
                    bgcolor: 'background.paper',
                  }}
                >
                  <TableSortLabel
                    active={sort?.id === c.id}
                    direction={sort?.id === c.id ? sort.direction : 'asc'}
                    onClick={() => toggleSort(c.id)}
                    sx={{ '&.Mui-active': { color: 'text.primary' } }}
                  >
                    {c.label}
                  </TableSortLabel>
                </TableCell>
              ))}
              <TableCell
                align="right"
                sx={{
                  position: 'sticky',
                  right: 0,
                  zIndex: 3,
                  pr: { xs: 1.5, sm: 2.5 },
                  py: 1,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'text.secondary',
                  whiteSpace: 'nowrap',
                  bgcolor: 'background.paper',
                  width: 84,
                  boxShadow: (th) => `-1px 0 0 ${th.palette.divider}`,
                }}
              >
                Actions
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pageRows.map((t) => (
              <TableRow key={t.id} hover>
                {shownColumns.map((c, index) => (
                  <TableCell
                    key={c.id}
                    sx={{ py: 1.125, pl: index === 0 ? { xs: 1.5, sm: 2.5 } : 1.5, maxWidth: c.width ? c.width + 80 : undefined }}
                  >
                    {cell(t, c.id)}
                  </TableCell>
                ))}
                <TableCell
                  align="right"
                  sx={{
                    position: 'sticky',
                    right: 0,
                    py: 0.5,
                    pr: { xs: 1, sm: 2 },
                    bgcolor: 'background.paper',
                    boxShadow: (th) => `-1px 0 0 ${th.palette.divider}`,
                    '.MuiTableRow-hover:hover > &': { bgcolor: 'background.paper', backgroundImage: 'linear-gradient(rgba(128,128,128,0.08),rgba(128,128,128,0.08))' },
                  }}
                >
                  <IconButton
                    size="small"
                    aria-label={`Actions for ${t.title}`}
                    aria-haspopup="menu"
                    onClick={(e) => setMenu({ anchor: e.currentTarget, ticket: t })}
                  >
                    <MoreHorizRoundedIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 5, textAlign: 'center' }}>
            No tickets match these filters.
          </Typography>
        )}
      </TableContainer>

      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 1, px: { xs: 1.5, sm: 2.5 }, py: 1.25, borderTop: 1, borderColor: 'divider' }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
          Showing {from}–{to} of {rows.length} tickets
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Select
            size="small"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value))
              setPage(1)
            }}
            inputProps={{ 'aria-label': 'Tickets per page' }}
            MenuProps={{ sx: { zIndex: popoverZ } }}
            sx={{ fontSize: 13, '& .MuiSelect-select': { py: 0.625 } }}
          >
            {PAGE_SIZES.map((size) => (
              <MenuItem key={size} value={size} sx={{ fontSize: 13 }}>
                {size} per page
              </MenuItem>
            ))}
          </Select>
          <Pagination
            size="small"
            color="primary"
            shape="rounded"
            count={pageCount}
            page={currentPage}
            onChange={(_, value) => setPage(value)}
            siblingCount={0}
          />
        </Stack>
      </Stack>

      <Menu
        open={Boolean(menu)}
        anchorEl={menu?.anchor}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ zIndex: popoverZ }}
        slotProps={{ paper: { sx: { minWidth: 190, borderRadius: '12px' } } }}
      >
        {menuItems.map((item) => (
          <MenuItem
            key={item.key}
            dense
            onClick={() => {
              closeMenu()
              item.run()
            }}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText>{item.label}</ListItemText>
          </MenuItem>
        ))}
        {menuWorkflow.length > 0 && <Divider component="li" />}
        {menuWorkflow.map((action) => (
          <MenuItem
            key={action.id}
            dense
            onClick={() => {
              closeMenu()
              if (menuTicket) ticketActions.run(menuTicket, action)
            }}
          >
            <ListItemText inset>{action.label}</ListItemText>
          </MenuItem>
        ))}
        {canEdit && menuTicket && <Divider component="li" />}
        {canEdit && menuTicket && (
          <MenuItem
            dense
            onClick={() => {
              closeMenu()
              setDeleting(menuTicket)
            }}
            sx={{ color: 'error.main' }}
          >
            <ListItemIcon sx={{ color: 'inherit' }}>
              <DeleteOutlineRoundedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        )}
      </Menu>

      <TicketDeleteDialog ticket={deleting} onClose={() => setDeleting(null)} />
      {ticketActions.dialog}
    </Dialog>
  )
}
