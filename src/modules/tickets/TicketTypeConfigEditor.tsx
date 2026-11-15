import { useId, useState, type ReactNode } from 'react'
import { Box, Button, Checkbox, TextField, Typography } from '@mui/material'
import { CONFIG_OPTIONS, DEFAULT_CONFIG, type TicketTypeConfig } from '../../data/ticketTypes'
import { fieldSx } from './TicketCreateLayout'
import InfoTip from './InfoTip'
import WorkflowPreview from './WorkflowPreview'

interface Props {
  /** Heading of the configuration column. */
  title: string
  /** Explanations shown in the tooltip next to the heading. */
  info: string[]
  initialName: string
  initialDescription: string
  initialConfig: TicketTypeConfig | null
  /** Built-in, legacy or non-administrator views cannot change anything. */
  readOnly: boolean
  saving: boolean
  error: string | null
  /** Extra actions such as "Use for this ticket" or Delete. */
  actions?: ReactNode
  onCancel: () => void
  onSave: (name: string, description: string, config: TicketTypeConfig) => void
}

export default function TicketTypeConfigEditor({
  title,
  info,
  initialName,
  initialDescription,
  initialConfig,
  readOnly,
  saving,
  error,
  actions,
  onCancel,
  onSave,
}: Props) {
  const idPrefix = useId()
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [config, setConfig] = useState<TicketTypeConfig>(initialConfig ?? DEFAULT_CONFIG)
  const dirty =
    name !== initialName || description !== initialDescription || CONFIG_OPTIONS.some(({ key }) => config[key] !== (initialConfig ?? DEFAULT_CONFIG)[key])
  const ready = name.trim() !== '' && dirty

  return (
    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'stretch' }}>
      <Box
        sx={{
          flex: '1 1 250px',
          maxWidth: { sm: 290 },
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          p: { xs: 1.5, sm: 2 },
          boxSizing: 'border-box',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 28 }}>
          <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700, minWidth: 0, overflowWrap: 'anywhere' }}>
            {title}
          </Typography>
          <InfoTip label="About this ticket type">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {info.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </Box>
          </InfoTip>
        </Box>

        {!readOnly && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, pt: 0.5, pb: 0.5 }}>
            <TextField
              size="small"
              label="Ticket type name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { maxLength: 60 } }}
              sx={fieldSx}
            />
            <TextField
              size="small"
              label="Description"
              multiline
              minRows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={fieldSx}
            />
          </Box>
        )}

        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {CONFIG_OPTIONS.map(({ key, label, description: hint }) => {
            const id = `${idPrefix}-${key}`
            return (
              <Box
                component="li"
                key={key}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 40, '& + &': { borderTop: 1, borderColor: 'divider' } }}
              >
                <Typography component="label" htmlFor={id} variant="body2" sx={{ fontWeight: 600, cursor: readOnly ? 'default' : 'pointer' }}>
                  {label}
                </Typography>
                <InfoTip label={`About ${label}`}>{hint}</InfoTip>
                <Box sx={{ flex: 1 }} />
                <Checkbox
                  id={id}
                  size="small"
                  checked={config[key]}
                  disabled={readOnly}
                  onChange={(e) => setConfig((prev) => ({ ...prev, [key]: e.target.checked }))}
                  sx={{ p: 0.75 }}
                />
              </Box>
            )
          })}
        </Box>

        {error && (
          <Typography role="alert" variant="body2" color="error" sx={{ wordBreak: 'break-word' }}>
            {error}
          </Typography>
        )}

        {(actions || !readOnly) && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 'auto', pt: 0.5 }}>
            {actions}
            <Box sx={{ flex: 1 }} />
            {!readOnly && (
              <>
                <Button size="small" onClick={onCancel} disabled={saving || !dirty}>
                  Cancel
                </Button>
                <Button size="small" variant="contained" onClick={() => onSave(name.trim(), description.trim(), config)} disabled={!ready || saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </>
            )}
          </Box>
        )}
      </Box>

      <Box sx={{ flex: '1 1 240px', minWidth: 0, p: { xs: 1.5, sm: 2 }, pl: { sm: 0 }, boxSizing: 'border-box' }}>
        <WorkflowPreview config={config} />
      </Box>
    </Box>
  )
}
