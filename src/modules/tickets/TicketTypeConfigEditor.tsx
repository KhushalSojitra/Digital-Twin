import { useMemo, useState } from 'react'
import { Alert, Box, Button, Chip, DialogActions, DialogContent, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material'
import { CONFIG_OPTIONS, DEFAULT_CONFIG, previewDefinition, type TicketTypeConfig } from '../../data/ticketTypes'
import { fieldSx } from './TicketCreateLayout'

interface Props {
  initialName: string
  initialDescription: string
  initialConfig: TicketTypeConfig | null
  /** Built-in, legacy or non-administrator views cannot change anything. */
  readOnly: boolean
  saving: boolean
  error: string | null
  onCancel: () => void
  onSave: (name: string, description: string, config: TicketTypeConfig) => void
}

export default function TicketTypeConfigEditor({ initialName, initialDescription, initialConfig, readOnly, saving, error, onCancel, onSave }: Props) {
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [config, setConfig] = useState<TicketTypeConfig>(initialConfig ?? DEFAULT_CONFIG)
  const preview = useMemo(() => previewDefinition(config), [config])
  const dirty =
    name !== initialName || description !== initialDescription || CONFIG_OPTIONS.some(({ key }) => config[key] !== (initialConfig ?? DEFAULT_CONFIG)[key])
  const ready = name.trim() !== '' && dirty

  return (
    <>
      <DialogContent sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Ticket type name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={readOnly}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { maxLength: 60 } }}
            sx={fieldSx}
          />
          <TextField
            label="Description"
            multiline
            minRows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={readOnly}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={fieldSx}
          />
          {initialConfig === null && readOnly && (
            <Alert severity="info" variant="outlined">
              This ticket type was created before configurable options existed. Its tickets keep their current workflow.
            </Alert>
          )}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
              Workflow options
            </Typography>
            <Typography variant="caption" color="text.secondary">
              To Do, In Progress and Done are always part of the workflow.
            </Typography>
            <Stack sx={{ mt: 1 }}>
              {CONFIG_OPTIONS.map(({ key, label, description: hint }) => (
                <FormControlLabel
                  key={key}
                  sx={{ alignItems: 'flex-start', ml: 0, mr: 0, py: 0.5, justifyContent: 'space-between', flexDirection: 'row-reverse' }}
                  control={
                    <Switch
                      checked={config[key]}
                      disabled={readOnly}
                      onChange={(e) => setConfig((prev) => ({ ...prev, [key]: e.target.checked }))}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {hint}
                      </Typography>
                    </Box>
                  }
                />
              ))}
            </Stack>
          </Box>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Workflow preview
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
              {preview.states.map((state) => (
                <Chip key={state.key} size="small" variant="outlined" label={state.label} />
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary">
              Actions: {Array.from(new Set(preview.transitions.map((transition) => transition.label))).join(', ')}
            </Typography>
          </Box>
          {error && (
            <Typography role="alert" variant="body2" color="error" sx={{ wordBreak: 'break-word' }}>
              {error}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      {!readOnly && (
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={onCancel} disabled={saving || !dirty}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => onSave(name.trim(), description.trim(), config)} disabled={!ready || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      )}
    </>
  )
}
