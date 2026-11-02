import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  DialogActions,
  DialogContent,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Radio,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import {
  ASSIGN_LABEL,
  STATE_GROUPS,
  STATE_GROUP_LABEL,
  slug,
  type AssignBehavior,
  type StateGroup,
  type WorkflowDefinition,
  type WorkflowState,
  type WorkflowTransition,
} from '../../data/workflows'

interface Props {
  initialName: string
  initialDescription: string
  initialDefinition: WorkflowDefinition
  readOnly: boolean
  saving: boolean
  error: string | null
  onSave: (name: string, description: string, definition: WorkflowDefinition) => void
  onCancel: () => void
}

const ASSIGN_OPTIONS = Object.keys(ASSIGN_LABEL) as AssignBehavior[]

function validate(name: string, definition: WorkflowDefinition): string | null {
  if (!name.trim()) return 'Give the workflow a name.'
  if (definition.states.length < 2) return 'A workflow needs at least two states.'
  const labels = definition.states.map((state) => state.label.trim().toLowerCase())
  if (labels.some((label) => !label)) return 'Every state needs a name.'
  if (new Set(labels).size !== labels.length) return 'State names must be different from each other.'
  if (!definition.states.some((state) => state.key === definition.initial)) return 'Choose the state new tickets start in.'
  for (const transition of definition.transitions) {
    if (!transition.label.trim()) return 'Every action needs a name.'
    if (transition.from.length === 0) return `Choose at least one "From" state for "${transition.label}".`
    if (!definition.states.some((state) => state.key === transition.to)) return `Choose a "To" state for "${transition.label}".`
  }
  return null
}

export default function WorkflowTemplateEditor({
  initialName,
  initialDescription,
  initialDefinition,
  readOnly,
  saving,
  error,
  onSave,
  onCancel,
}: Props) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [definition, setDefinition] = useState<WorkflowDefinition>(initialDefinition)
  const [touched, setTouched] = useState(false)
  const problem = validate(name, definition)
  const locked = readOnly || saving

  const labelOf = (key: string) => definition.states.find((state) => state.key === key)?.label ?? key

  const updateState = (key: string, patch: Partial<WorkflowState>) =>
    setDefinition((current) => ({
      ...current,
      states: current.states.map((state) => (state.key === key ? { ...state, ...patch } : state)),
    }))

  const addState = () =>
    setDefinition((current) => {
      const key = slug('new state', current.states.map((state) => state.key))
      return { ...current, states: [...current.states, { key, label: '', group: 'in_progress' }] }
    })

  const removeState = (key: string) =>
    setDefinition((current) => ({
      ...current,
      states: current.states.filter((state) => state.key !== key),
      transitions: current.transitions
        .map((transition) => ({ ...transition, from: transition.from.filter((from) => from !== key) }))
        .filter((transition) => transition.to !== key && transition.from.length > 0),
    }))

  const updateTransition = (id: string, patch: Partial<WorkflowTransition>) =>
    setDefinition((current) => ({
      ...current,
      transitions: current.transitions.map((transition) => (transition.id === id ? { ...transition, ...patch } : transition)),
    }))

  const addTransition = () =>
    setDefinition((current) => {
      const id = slug('action', current.transitions.map((transition) => transition.id))
      const from = current.states[0]?.key ?? ''
      const to = current.states[1]?.key ?? from
      return {
        ...current,
        transitions: [...current.transitions, { id, label: '', from: from ? [from] : [], to, assign: 'none', requireNote: false }],
      }
    })

  const removeTransition = (id: string) =>
    setDefinition((current) => ({ ...current, transitions: current.transitions.filter((transition) => transition.id !== id) }))

  const submit = () => {
    setTouched(true)
    if (problem) return
    onSave(name.trim(), description.trim(), {
      ...definition,
      states: definition.states.map((state) => ({ ...state, label: state.label.trim() })),
      transitions: definition.transitions.map((transition) => ({ ...transition, label: transition.label.trim() })),
    })
  }

  return (
    <>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pb: 2, px: { xs: 1.5, sm: 2 } }}>
        {readOnly && (
          <Alert severity="info" variant="outlined">
            This is a system template and cannot be edited. Clone it to create a customer template you can change.
          </Alert>
        )}

        <Stack spacing={1.5}>
          <TextField
            label="Workflow name"
            size="small"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={locked}
            required
          />
          <TextField
            label="Description"
            size="small"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={locked}
            multiline
            minRows={2}
          />
        </Stack>

        <Box component="section" aria-labelledby="workflow-states-heading">
          <Typography id="workflow-states-heading" variant="subtitle2" sx={{ fontWeight: 700 }}>
            States
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.25 }}>
            The stages a ticket moves through. &ldquo;Counts as&rdquo; decides which status colour and filter a state uses on pins.
          </Typography>
          <Stack spacing={1.25}>
            {definition.states.map((state) => {
              const isInitial = state.key === definition.initial
              const canRemove = !isInitial && definition.states.length > 2
              return (
                <Box
                  key={state.key}
                  sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr auto', sm: 'minmax(0, 1fr) 180px auto auto' }, gap: 1, alignItems: 'center' }}
                >
                  <TextField
                    label="State name"
                    size="small"
                    value={state.label}
                    onChange={(event) => updateState(state.key, { label: event.target.value })}
                    disabled={locked}
                    error={touched && !state.label.trim()}
                  />
                  <FormControl size="small" disabled={locked} sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' }, order: { xs: 3, sm: 0 } }}>
                    <InputLabel id={`group-${state.key}`}>Counts as</InputLabel>
                    <Select
                      labelId={`group-${state.key}`}
                      label="Counts as"
                      value={state.group}
                      onChange={(event) => updateState(state.key, { group: event.target.value as StateGroup })}
                    >
                      {STATE_GROUPS.map((group) => (
                        <MenuItem key={group} value={group}>
                          {STATE_GROUP_LABEL[group]}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Tooltip title="New tickets start in this state">
                    <FormControlLabel
                      sx={{ mr: 0, order: { xs: 1, sm: 0 } }}
                      disabled={locked}
                      control={
                        <Radio
                          size="small"
                          checked={isInitial}
                          onChange={() => setDefinition((current) => ({ ...current, initial: state.key }))}
                          slotProps={{ input: { 'aria-label': `Start in ${state.label || 'this state'}` } }}
                        />
                      }
                      label={<Typography variant="caption">Start</Typography>}
                    />
                  </Tooltip>
                  <Tooltip title={isInitial ? 'The start state cannot be removed' : definition.states.length <= 2 ? 'A workflow needs at least two states' : 'Remove state and the actions that use it'}>
                    <span style={{ order: 2 }}>
                      <IconButton size="small" onClick={() => removeState(state.key)} disabled={locked || !canRemove} aria-label={`Remove ${state.label || 'state'}`}>
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              )
            })}
          </Stack>
          {!readOnly && (
            <Button size="small" startIcon={<AddRoundedIcon />} onClick={addState} disabled={saving} sx={{ mt: 1.25 }}>
              Add state
            </Button>
          )}
        </Box>

        <Box component="section" aria-labelledby="workflow-actions-heading">
          <Typography id="workflow-actions-heading" variant="subtitle2" sx={{ fontWeight: 700 }}>
            Actions
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.25 }}>
            From state → action → to state. A state can offer several actions; tickets show exactly the actions configured here.
          </Typography>
          <Stack spacing={1.25}>
            {definition.transitions.map((transition) => (
              <Box
                key={transition.id}
                sx={{ border: 1, borderColor: 'divider', borderRadius: '12px', p: 1.25, display: 'flex', flexDirection: 'column', gap: 1.25 }}
              >
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
                  <FormControl size="small" disabled={locked}>
                    <InputLabel id={`from-${transition.id}`}>From state</InputLabel>
                    <Select
                      labelId={`from-${transition.id}`}
                      label="From state"
                      multiple
                      value={transition.from}
                      onChange={(event) => {
                        const value = event.target.value
                        updateTransition(transition.id, { from: typeof value === 'string' ? value.split(',') : value })
                      }}
                      renderValue={(selected) => selected.map(labelOf).join(', ')}
                    >
                      {definition.states.map((state) => (
                        <MenuItem key={state.key} value={state.key}>
                          {state.label || state.key}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    label="Action"
                    size="small"
                    value={transition.label}
                    onChange={(event) => updateTransition(transition.id, { label: event.target.value })}
                    disabled={locked}
                    error={touched && !transition.label.trim()}
                  />
                  <FormControl size="small" disabled={locked}>
                    <InputLabel id={`to-${transition.id}`}>To state</InputLabel>
                    <Select
                      labelId={`to-${transition.id}`}
                      label="To state"
                      value={transition.to}
                      onChange={(event) => updateTransition(transition.id, { to: event.target.value })}
                    >
                      {definition.states.map((state) => (
                        <MenuItem key={state.key} value={state.key}>
                          {state.label || state.key}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
                  <FormControl size="small" disabled={locked} sx={{ minWidth: 220, flex: { xs: '1 1 100%', sm: '0 1 auto' } }}>
                    <InputLabel id={`assign-${transition.id}`}>Assignment</InputLabel>
                    <Select
                      labelId={`assign-${transition.id}`}
                      label="Assignment"
                      value={transition.assign}
                      onChange={(event) => updateTransition(transition.id, { assign: event.target.value as AssignBehavior })}
                    >
                      {ASSIGN_OPTIONS.map((option) => (
                        <MenuItem key={option} value={option}>
                          {ASSIGN_LABEL[option]}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControlLabel
                    disabled={locked}
                    sx={{ flex: 1, minWidth: 0 }}
                    control={
                      <Switch
                        size="small"
                        checked={transition.requireNote}
                        onChange={(event) => updateTransition(transition.id, { requireNote: event.target.checked })}
                      />
                    }
                    label={<Typography variant="body2">Require a reason</Typography>}
                  />
                  <Tooltip title="Remove action">
                    <span>
                      <IconButton size="small" onClick={() => removeTransition(transition.id)} disabled={locked} aria-label={`Remove action ${transition.label || ''}`}>
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              </Box>
            ))}
            {definition.transitions.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No actions yet. Tickets in this workflow cannot change state.
              </Typography>
            )}
          </Stack>
          {!readOnly && (
            <Button size="small" startIcon={<AddRoundedIcon />} onClick={addTransition} disabled={saving} sx={{ mt: 1.25 }}>
              Add action
            </Button>
          )}
        </Box>

        {!readOnly && (
          <Typography variant="caption" color="text.secondary">
            Tickets already using this workflow keep the version they started with. Saving changes to a workflow in use publishes a new version for new tickets.
          </Typography>
        )}
        {touched && problem && (
          <Alert severity="warning" role="alert">
            {problem}
          </Alert>
        )}
        {error && (
          <Alert severity="error" role="alert">
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: { xs: 1.5, sm: 2 }, py: 1.25 }}>
        <Button onClick={onCancel} disabled={saving}>
          {readOnly ? 'Back' : 'Cancel'}
        </Button>
        {!readOnly && (
          <Button variant="contained" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Save workflow'}
          </Button>
        )}
      </DialogActions>
    </>
  )
}
