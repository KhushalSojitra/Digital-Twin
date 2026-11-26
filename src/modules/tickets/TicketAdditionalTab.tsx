import { useId, useState, type ReactNode } from 'react'
import { themeColors } from '../../theme/theme'
import { glassCardSx } from '../../components/ui/figma'
import {
  alpha,
  Box,
  Button,
  Checkbox,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Popover,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
  type SxProps,
  type Theme,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import BlockRoundedIcon from '@mui/icons-material/BlockRounded'
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined'
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded'
import LinkRoundedIcon from '@mui/icons-material/LinkRounded'
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded'
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded'
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import SupervisorAccountRoundedIcon from '@mui/icons-material/SupervisorAccountRounded'
import { useTickets } from '../../state/TicketsContext'

export type BreachAction = 'fail' | 'escalate_reporter' | 'escalate_assignee' | 'notify_custom' | 'follow_up' | 'none'
export type DependencyRelation = 'blocks' | 'blocked_by'

export interface LinkedTicket {
  id: string
  title: string
  relation: DependencyRelation | ''
}

export const BREACH_OPTIONS: { value: BreachAction; label: string; icon: ReactNode }[] = [
  { value: 'fail', label: 'Mark ticket as Failed', icon: <NotificationsNoneRoundedIcon /> },
  { value: 'escalate_reporter', label: 'Escalate to Reporter', icon: <PersonOutlineRoundedIcon /> },
  { value: 'escalate_assignee', label: 'Escalate to Assignee', icon: <SupervisorAccountRoundedIcon /> },
  { value: 'notify_custom', label: 'Notify Custom Users', icon: <GroupsRoundedIcon /> },
  { value: 'follow_up', label: 'Create Follow-up Ticket', icon: <DescriptionOutlinedIcon /> },
  { value: 'none', label: 'No Action', icon: <BlockRoundedIcon /> },
]

const RELATION_OPTIONS: { value: DependencyRelation; label: string }[] = [
  { value: 'blocks', label: 'Blocks this ticket' },
  { value: 'blocked_by', label: 'Blocked by this ticket' },
]

const DEFAULT_DUE_TIME = '18:00'
export const BREACH_NEEDS_DEADLINE = 'Set a deadline before selecting an SLA breach action.'
export const RELATION_REQUIRED = 'Select a relationship for all linked tickets.'
export const SELF_LINK = 'A ticket cannot be linked to itself.'

const sameTitle = (a: string, b: string) => {
  const left = a.trim().toLowerCase()
  return left !== '' && left === b.trim().toLowerCase()
}

/** Local form state for the Additional tab. Lives in the layout so it survives tab switches. */
export function useTicketAdditional(title: string) {
  const [dueDate, setDueDateRaw] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [onBreach, setOnBreach] = useState<BreachAction | ''>('')
  const [links, setLinks] = useState<LinkedTicket[]>([])
  const [attempted, setAttempted] = useState(false)

  const setDueDate = (value: string) => {
    setDueDateRaw(value)
    if (!value) setDueTime('')
    else if (!dueTime) setDueTime(DEFAULT_DUE_TIME)
  }

  const clearDeadline = () => {
    setDueDateRaw('')
    setDueTime('')
  }

  const addLinks = (items: { id: string; title: string }[]) =>
    setLinks((current) => {
      const known = new Set(current.map((l) => l.id))
      const fresh = items.filter((i) => !known.has(i.id) && !sameTitle(title, i.title)).map((i) => ({ id: i.id, title: i.title, relation: '' as const }))
      return fresh.length ? [...current, ...fresh] : current
    })

  const setRelation = (id: string, relation: DependencyRelation) =>
    setLinks((current) => current.map((l) => (l.id === id ? { ...l, relation } : l)))

  const removeLink = (id: string) => setLinks((current) => current.filter((l) => l.id !== id))

  const breachError = onBreach && onBreach !== 'none' && !dueDate ? BREACH_NEEDS_DEADLINE : ''
  const missingRelation = links.some((l) => !l.relation)
  const relationError = attempted && missingRelation ? RELATION_REQUIRED : ''
  const selfLinked = (linkTitle: string) => sameTitle(title, linkTitle)
  const hasSelfLink = links.some((l) => selfLinked(l.title))

  const validate = () => {
    setAttempted(true)
    return !breachError && !missingRelation && !hasSelfLink
  }

  return {
    dueDate,
    dueTime,
    setDueDate,
    setDueTime,
    clearDeadline,
    onBreach,
    setOnBreach,
    links,
    addLinks,
    setRelation,
    removeLink,
    breachError,
    relationError,
    selfLinked,
    validate,
  }
}

export type TicketAdditionalState = ReturnType<typeof useTicketAdditional>

const cardSx: SxProps<Theme> = (t: Theme) => ({
  ...glassCardSx(t),
  minWidth: 0,
  p: 2,
  display: 'flex',
  flexDirection: 'column',
})

function SectionHeading({ icon, children, action }: { icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 32 }}>
      <Box aria-hidden sx={{ display: 'grid', placeItems: 'center', color: 'text.secondary', '& .MuiSvgIcon-root': { fontSize: 20 } }}>
        {icon}
      </Box>
      <Typography component="h3" sx={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600 }}>
        {children}
      </Typography>
      {action}
    </Box>
  )
}

function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <Typography id={id} role="alert" variant="caption" color="error" component="p" sx={{ mt: 0.5, mx: 0.5, lineHeight: 1.35 }}>
      {children}
    </Typography>
  )
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const HOURS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, m) => String(m).padStart(2, '0'))

const pad = (n: number) => String(n).padStart(2, '0')
const toKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

/** Small square selectable cell used by the calendar and the time columns. */
function pickCellSx(selected: boolean, today = false): SxProps<Theme> {
  return (t: Theme) => ({
    minWidth: 0,
    width: '100%',
    height: 32,
    p: 0,
    borderRadius: '8px',
    fontSize: 13,
    fontWeight: selected ? 600 : 400,
    color: selected ? t.palette.primary.contrastText : t.palette.text.primary,
    bgcolor: selected ? t.palette.primary.main : 'transparent',
    border: today && !selected ? `1px solid ${alpha(t.palette.secondary.main, 0.7)}` : '1px solid transparent',
    '&:hover': { bgcolor: selected ? t.palette.primary.dark : alpha(t.palette.primary.main, 0.1) },
    '&.Mui-disabled': { color: t.palette.text.disabled },
  })
}

/** Inline, always-open date + time picker in the app theme (replaces the browser's native pickers). */
function DeadlinePicker({ state, labelId }: { state: TicketAdditionalState; labelId: string }) {
  const { dueDate, dueTime, setDueDate, setDueTime, clearDeadline } = state
  const now = new Date()
  const todayKey = toKey(now.getFullYear(), now.getMonth(), now.getDate())
  const initial = dueDate ? new Date(`${dueDate}T00:00:00`) : now
  const [view, setView] = useState({ y: initial.getFullYear(), m: initial.getMonth() })
  const [hh, mm] = (dueTime || '').split(':')

  const first = new Date(view.y, view.m, 1).getDay()
  const days = new Date(view.y, view.m + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const shift = (delta: number) => setView((v) => {
    const d = new Date(v.y, v.m + delta, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const monthLabel = new Date(view.y, view.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const minutes = mm && !MINUTES.includes(mm) ? [...MINUTES, mm].sort() : MINUTES
  const pickTime = (h: string, m: string) => {
    if (!dueDate) setDueDate(todayKey)
    setDueTime(`${h}:${m}`)
  }
  const summary = dueDate
    ? `${new Date(`${dueDate}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}${dueTime ? `, ${dueTime}` : ''}`
    : 'No deadline set'

  return (
    <Box role="group" aria-labelledby={labelId}>
      <Stack direction="row" sx={{ alignItems: 'center', mb: 1, gap: 1 }}>
        <Typography id={labelId} component="span" sx={{ fontSize: 13, fontWeight: 500, color: 'text.secondary' }}>
          Due Date &amp; Time
        </Typography>
        <Typography component="span" sx={{ flex: 1, fontSize: 13, fontWeight: 600, textAlign: 'right' }}>
          {summary}
        </Typography>
        <Tooltip title="Clear deadline">
          <span>
            <IconButton size="small" onClick={clearDeadline} aria-label="Clear deadline" disabled={!dueDate && !dueTime} sx={{ color: 'text.secondary' }}>
              <CloseRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      <Box
        sx={(t) => ({
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 112px',
          gap: 1.5,
          p: 1.25,
          borderRadius: '12px',
          bgcolor: themeColors(t.palette.mode).inputBg,
        })}
      >
        {/* calendar */}
        <Box>
          <Stack direction="row" sx={{ alignItems: 'center', mb: 0.75 }}>
            <IconButton size="small" onClick={() => shift(-1)} aria-label="Previous month">
              <ChevronLeftRoundedIcon fontSize="small" />
            </IconButton>
            <Typography sx={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 600 }} aria-live="polite">
              {monthLabel}
            </Typography>
            <IconButton size="small" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRightRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Box role="grid" aria-label={monthLabel} sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.25 }}>
            {WEEKDAYS.map((d) => (
              <Typography key={d} role="columnheader" sx={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'text.secondary', py: 0.5 }}>
                {d}
              </Typography>
            ))}
            {cells.map((day, i) => {
              if (!day) return <Box key={`e${i}`} />
              const key = toKey(view.y, view.m, day)
              return (
                <Button
                  key={key}
                  role="gridcell"
                  aria-selected={key === dueDate}
                  aria-label={new Date(view.y, view.m, day).toDateString()}
                  disabled={key < todayKey}
                  onClick={() => setDueDate(key)}
                  sx={pickCellSx(key === dueDate, key === todayKey)}
                >
                  {day}
                </Button>
              )
            })}
          </Box>
        </Box>

        {/* time */}
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Typography sx={{ textAlign: 'center', fontSize: 14, fontWeight: 600, mb: 0.75, lineHeight: '30px' }}>Time</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, flex: 1, minHeight: 0 }}>
            <Box role="listbox" aria-label="Hour" sx={{ overflowY: 'auto', maxHeight: 236, pr: 0.25 }}>
              {HOURS.map((h) => (
                <Button key={h} role="option" aria-selected={h === hh} onClick={() => pickTime(h, mm || '00')} sx={[pickCellSx(h === hh), { mb: 0.25 }] as SxProps<Theme>}>
                  {h}
                </Button>
              ))}
            </Box>
            <Box role="listbox" aria-label="Minute" sx={{ overflowY: 'auto', maxHeight: 236 }}>
              {minutes.map((m) => (
                <Button key={m} role="option" aria-selected={m === mm} onClick={() => pickTime(hh || '17', m)} sx={[pickCellSx(m === mm), { mb: 0.25 }] as SxProps<Theme>}>
                  {m}
                </Button>
              ))}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

function LinkPanelBody({
  candidates,
  isSelf,
  onLink,
  onClose,
}: {
  candidates: { id: string; title: string }[]
  isSelf: (title: string) => boolean
  onLink: (items: { id: string; title: string }[]) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const needle = query.trim().toLowerCase()
  const visible = candidates.filter((c) => c.title.toLowerCase().includes(needle))

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const confirm = () => {
    onLink(candidates.filter((c) => selected.has(c.id)))
    onClose()
  }

  return (
    <Box sx={{ width: 'min(380px, calc(100vw - 32px))', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pt: 1.5, pb: 1 }}>
        <LinkRoundedIcon aria-hidden sx={{ color: 'primary.main', fontSize: 22 }} />
        <Typography component="h4" sx={{ flex: 1, fontSize: 15, fontWeight: 800 }}>
          Link Tickets
        </Typography>
        <IconButton size="small" onClick={onClose} aria-label="Close link tickets panel">
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ px: 2, pb: 1 }}>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder="Search tickets by title..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          slotProps={{
            htmlInput: { 'aria-label': 'Search tickets by title' },
            input: { startAdornment: <SearchRoundedIcon aria-hidden sx={{ mr: 1, fontSize: 20, color: 'text.secondary' }} /> },
          }}
          sx={{
            '& .MuiInputBase-root': { borderRadius: '10px', fontSize: 14 },
            '& .MuiOutlinedInput-notchedOutline': { borderWidth: 1, borderColor: 'transparent' },
            '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.main' },
          }}
        />
      </Box>

      <Box role="group" aria-label="Tickets available to link" sx={{ maxHeight: 232, overflowY: 'auto', px: 1, pb: 0.5 }}>
        {visible.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 1.5, py: 2, textAlign: 'center' }}>
            {candidates.length === 0 ? 'No tickets available to link.' : 'No tickets match your search.'}
          </Typography>
        ) : (
          visible.map((item) => {
            const self = isSelf(item.title)
            return (
              <Box key={item.id}>
                <Box
                  component="label"
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 0.75,
                    py: 0.25,
                    borderRadius: '8px',
                    cursor: self ? 'not-allowed' : 'pointer',
                    opacity: self ? 0.55 : 1,
                    '&:hover': { bgcolor: (t: Theme) => alpha(t.palette.text.primary, 0.05) },
                  }}
                >
                  <Checkbox size="small" checked={selected.has(item.id)} disabled={self} onChange={() => toggle(item.id)} />
                  <Typography noWrap component="span" sx={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                    {item.title}
                  </Typography>
                </Box>
                {self && <FieldError>{SELF_LINK}</FieldError>}
              </Box>
            )
          })
        )}
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 2, py: 1.25, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary" aria-live="polite">
          {selected.size} {selected.size === 1 ? 'ticket' : 'tickets'} selected
        </Typography>
        <Button variant="contained" size="small" onClick={confirm} disabled={selected.size === 0} sx={{ borderRadius: 999, px: 2.25, fontWeight: 700 }}>
          Link Selected
        </Button>
      </Box>
    </Box>
  )
}

function DependencyRow({
  link,
  self,
  fieldSx,
  menuProps,
  onRelation,
  onRemove,
}: {
  link: LinkedTicket
  self: boolean
  fieldSx: SxProps<Theme>
  menuProps: { sx: SxProps<Theme> }
  onRelation: (value: DependencyRelation) => void
  onRemove: () => void
}) {
  const uid = useId()
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          alignItems: { xs: 'stretch', sm: 'center' },
          gap: { xs: 1, sm: 1.25 },
          py: 0.75,
          pl: 1.25,
          pr: { xs: 1.25, sm: 0.5 },
          borderRadius: '12px',
          border: 1,
          borderColor: self ? 'error.main' : 'divider',
          bgcolor: (t: Theme) => alpha(t.palette.text.primary, 0.03),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flex: 1, minWidth: 0 }}>
          <DescriptionOutlinedIcon aria-hidden sx={{ fontSize: 22, color: 'text.secondary', flexShrink: 0 }} />
          <Typography noWrap title={link.title} sx={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700 }}>
            {link.title}
          </Typography>
          <IconButton size="small" onClick={onRemove} aria-label={`Remove linked ticket ${link.title}`} sx={{ display: { xs: 'inline-flex', sm: 'none' }, color: 'text.secondary' }}>
            <CloseRoundedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
        <FormControl size="small" sx={{ ...(fieldSx as object), width: { xs: '100%', sm: 190 }, flexShrink: 0, mt: { xs: 0.5, sm: 0 } }}>
          <InputLabel shrink id={`${uid}-label`} sx={{ fontSize: 13 }}>
            Relationship
          </InputLabel>
          <Select
            notched
            displayEmpty
            labelId={`${uid}-label`}
            label="Relationship"
            value={link.relation}
            onChange={(e) => onRelation(e.target.value as DependencyRelation)}
            MenuProps={menuProps}
            renderValue={(value) =>
              value ? (
                RELATION_OPTIONS.find((o) => o.value === value)?.label
              ) : (
                <Typography component="span" color="text.secondary" sx={{ fontSize: 14 }}>
                  Select relationship
                </Typography>
              )
            }
            sx={{ height: 38, '& .MuiSelect-select': { fontSize: 14, py: '8px' }, '& .MuiInputBase-root, &.MuiInputBase-root': { fontSize: 14 } }}
          >
            {RELATION_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <IconButton size="small" onClick={onRemove} aria-label={`Remove linked ticket ${link.title}`} sx={{ display: { xs: 'none', sm: 'inline-flex' }, color: 'text.secondary' }}>
          <CloseRoundedIcon sx={{ fontSize: 20 }} />
        </IconButton>
      </Box>
      {self && <FieldError>{SELF_LINK}</FieldError>}
    </Box>
  )
}

interface Props {
  state: TicketAdditionalState
  fieldSx: SxProps<Theme>
  menuProps: { sx: SxProps<Theme> }
}

export default function TicketAdditionalTab({ state, fieldSx, menuProps }: Props) {
  const uid = useId()
  const { tickets } = useTickets()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const linkedIds = new Set(state.links.map((l) => l.id))
  const candidates = tickets.filter((t) => !linkedIds.has(t.id)).map((t) => ({ id: t.id, title: t.title }))
  const breachId = `${uid}-breach-error`

  return (
    <Stack spacing={1.5} sx={{ height: '100%' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 5fr) minmax(0, 7fr)' }, gap: 2, alignItems: 'stretch', flex: 1, minHeight: 0 }}>
      <Box component="section" aria-labelledby={`${uid}-deadline-heading`} sx={cardSx}>
        <Box id={`${uid}-deadline-heading`}>
          <SectionHeading icon={<ScheduleRoundedIcon />}>Deadline &amp; Action</SectionHeading>
        </Box>
        <Stack spacing={2.5} sx={{ mt: 2 }}>
          <Box>
            <FormControl fullWidth sx={fieldSx} error={Boolean(state.breachError)}>
              <InputLabel shrink id={`${uid}-breach-label`}>
                On Breach
              </InputLabel>
              <Select
                notched
                displayEmpty
                labelId={`${uid}-breach-label`}
                label="On Breach"
                value={state.onBreach}
                onChange={(e) => state.setOnBreach(e.target.value as BreachAction | '')}
                MenuProps={menuProps}
                aria-describedby={state.breachError ? breachId : undefined}
                renderValue={(value) => {
                  const option = BREACH_OPTIONS.find((o) => o.value === value)
                  if (!option) {
                    return (
                      <Typography component="span" color="text.secondary" sx={{ fontSize: 13 }}>
                        Select action
                      </Typography>
                    )
                  }
                  return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                      <Box aria-hidden sx={{ display: 'grid', placeItems: 'center', color: 'text.secondary', '& .MuiSvgIcon-root': { fontSize: 20 } }}>
                        {option.icon}
                      </Box>
                      <Typography noWrap component="span" sx={{ fontSize: 13 }}>
                        {option.label}
                      </Typography>
                    </Box>
                  )
                }}
                sx={{ height: 40, '& .MuiSelect-select': { display: 'flex', alignItems: 'center', py: 0 } }}
              >
                {BREACH_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value} sx={{ gap: 1.25, '& .MuiSvgIcon-root': { fontSize: 20, color: 'text.secondary' } }}>
                    {o.icon}
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {state.breachError && <FieldError id={breachId}>{state.breachError}</FieldError>}
          </Box>
          <DeadlinePicker state={state} labelId={`${uid}-due-label`} />
        </Stack>
      </Box>

      <Box component="section" aria-labelledby={`${uid}-deps-heading`} sx={cardSx}>
        <Box id={`${uid}-deps-heading`}>
          <SectionHeading
            icon={<LinkRoundedIcon />}
            action={
              <Tooltip title="Link Ticket">
                <IconButton
                  onClick={(e) => setAnchor(e.currentTarget)}
                  aria-haspopup="dialog"
                  aria-label="Link Ticket"
                  sx={(t) => ({ width: 32, height: 32, borderRadius: '8px', bgcolor: t.palette.primary.main, color: t.palette.primary.contrastText, '&:hover': { bgcolor: t.palette.primary.dark } })}
                >
                  <AddRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            }
          >
            Ticket Dependencies
          </SectionHeading>
        </Box>

        {state.links.length === 0 ? (
          <Box
            sx={{
              mt: 1.5,
              flex: 1,
              justifyContent: 'center',
              px: 2,
              py: 1.5,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 0.25,
              textAlign: 'center',
              borderRadius: '12px',
              border: '1px dashed',
              borderColor: (t: Theme) => alpha(t.palette.text.primary, 0.22),
              color: 'text.secondary',
            }}
          >
            <LinkRoundedIcon aria-hidden sx={{ fontSize: 28, opacity: 0.7 }} />
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary' }}>No linked tickets yet</Typography>
            <Typography variant="caption">Link related tickets to show dependencies.</Typography>
          </Box>
        ) : (
          <Stack spacing={0.75} sx={{ mt: 1.25 }}>
            {state.links.map((link) => (
              <DependencyRow
                key={link.id}
                link={link}
                self={state.selfLinked(link.title)}
                fieldSx={fieldSx}
                menuProps={menuProps}
                onRelation={(value) => state.setRelation(link.id, value)}
                onRemove={() => state.removeLink(link.id)}
              />
            ))}
          </Stack>
        )}
        {state.relationError && <FieldError>{state.relationError}</FieldError>}
      </Box>
      </Box>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={menuProps.sx}
        slotProps={{ paper: { sx: { mt: 0.75, borderRadius: '16px', border: 1, borderColor: 'divider', backgroundImage: 'none' } } }}
      >
        <LinkPanelBody candidates={candidates} isSelf={state.selfLinked} onLink={state.addLinks} onClose={() => setAnchor(null)} />
      </Popover>
    </Stack>
  )
}
