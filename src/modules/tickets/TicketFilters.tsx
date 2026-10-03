import { Box, Button, FormControl, InputLabel, MenuItem, Select, Stack, TextField } from '@mui/material'
import { ALL_DEVICES } from '../../data/cameras'
import { ASSIGNEES, CREATORS, STATUS_LABEL, type TicketStatus } from '../../data/tickets'
import { EMPTY_FILTERS, type TicketFilterState } from './ticketFilters'

interface Props {
  value: TicketFilterState
  onChange: (next: TicketFilterState) => void
  hide?: Array<keyof TicketFilterState>
}

const ANY = '__any__'

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  const id = `ticket-filter-${label.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <FormControl size="small" fullWidth>
      <InputLabel id={id} shrink>
        {label}
      </InputLabel>
      <Select
        labelId={id}
        label={label}
        displayEmpty
        value={value === '' ? ANY : value}
        onChange={(e) => onChange(e.target.value === ANY ? '' : e.target.value)}
        MenuProps={{ sx: { zIndex: (t) => t.zIndex.modal + 12 } }}
      >
        <MenuItem value={ANY}>Any</MenuItem>
        {options.map((o) => (
          <MenuItem key={o.value} value={o.value}>
            {o.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}

export default function TicketFilters({ value, onChange, hide = [] }: Props) {
  const show = (k: keyof TicketFilterState) => !hide.includes(k)
  const set = <K extends keyof TicketFilterState>(key: K, v: TicketFilterState[K]) => onChange({ ...value, [key]: v })

  return (
    <Stack spacing={1.25}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
        {show('from') && (
          <TextField
            label="From"
            type="date"
            size="small"
            value={value.from}
            onChange={(e) => set('from', e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: value.to || undefined } }}
          />
        )}
        {show('to') && (
          <TextField
            label="To"
            type="date"
            size="small"
            value={value.to}
            onChange={(e) => set('to', e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: value.from || undefined } }}
          />
        )}
        {show('status') && (
          <FilterSelect
            label="Status"
            value={value.status}
            options={(Object.keys(STATUS_LABEL) as TicketStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
            onChange={(v) => set('status', v as TicketStatus | '')}
          />
        )}
        {show('cameraId') && (
          <FilterSelect
            label="Camera"
            value={value.cameraId}
            options={ALL_DEVICES.map((d) => ({ value: d.id, label: d.name }))}
            onChange={(v) => set('cameraId', v)}
          />
        )}
        {show('creator') && (
          <FilterSelect label="Creator" value={value.creator} options={CREATORS.map((c) => ({ value: c, label: c }))} onChange={(v) => set('creator', v)} />
        )}
        {show('assignee') && (
          <FilterSelect
            label="Assignee"
            value={value.assignee}
            options={ASSIGNEES.map((a) => ({ value: a, label: a }))}
            onChange={(v) => set('assignee', v)}
          />
        )}
      </Box>
      <Button size="small" variant="text" onClick={() => onChange(EMPTY_FILTERS)} sx={{ alignSelf: 'flex-end' }}>
        Clear
      </Button>
    </Stack>
  )
}
