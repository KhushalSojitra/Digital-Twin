import { useId, useState, type ReactNode } from 'react'
import { Box, Button, Checkbox, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material'
import TuneRoundedIcon from '@mui/icons-material/TuneRounded'
import { glassCardSx, toolButtonSx } from '../../components/ui/figma'
import { DIRECTORY } from '../../auth/users'
import { CONFIG_OPTIONS, DEFAULT_CONFIG, type TicketTypeConfig } from '../../data/ticketTypes'
import { fieldSx } from './TicketCreateLayout'
import InfoTip from './InfoTip'
import WorkflowPreview from './WorkflowPreview'

interface Props {
  /** Workflow state of the ticket the dialog was opened from (highlighted in the preview). */
  currentState?: string
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
  currentState,
}: Props) {
  const idPrefix = useId()
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [config, setConfig] = useState<TicketTypeConfig>(initialConfig ?? DEFAULT_CONFIG)
  const dirty =
    name !== initialName || description !== initialDescription || (CONFIG_OPTIONS.some(({ key }) => config[key] !== (initialConfig ?? DEFAULT_CONFIG)[key])
      || (config.preApprover ?? null) !== ((initialConfig ?? DEFAULT_CONFIG).preApprover ?? null))
  const ready = name.trim() !== '' && dirty
  // Settings start open when building a new type; otherwise behind the gear in the preview.
  const [showSettings, setShowSettings] = useState(!readOnly && initialName === '')

  return (
    <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', p: { xs: 1.5, sm: 2 }, gap: 1.5, boxSizing: 'border-box' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 32, flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>
          {title}
        </Typography>
        <InfoTip label="About this ticket type">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {info.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </Box>
        </InfoTip>
        <Box sx={{ flex: 1 }} />
        {actions}
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', gap: 2, flexWrap: { xs: 'wrap', md: 'nowrap' }, alignItems: 'stretch' }}>
      <Box sx={{ flex: '1 1 320px', minWidth: 0, overflowY: 'auto' }}>
        <WorkflowPreview
          config={config}
          currentState={currentState}
          headerAction={
            <Tooltip title={showSettings ? 'Hide flow step settings' : 'Flow step settings'}>
              <IconButton
                size="small"
                aria-label="Flow step settings"
                aria-pressed={showSettings}
                onClick={() => setShowSettings((v) => !v)}
                sx={(t) => ({ ...toolButtonSx(t), ...(showSettings && { bgcolor: 'primary.main', color: 'primary.contrastText', borderColor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }) })}
              >
                <TuneRoundedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          }
        />
      </Box>

      {showSettings && (
      <Box
        component="section"
        aria-label="Flow step settings"
        sx={(t) => ({
          ...glassCardSx(t),
          flex: '0 1 300px',
          minWidth: { xs: '100%', md: 280 },
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          p: 1.75,
          boxSizing: 'border-box',
          overflowY: 'auto',
        })}
      >
        <Typography variant="subtitle2" component="h4">
          Flow step settings
        </Typography>

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

        {config.preApproval && (
          <TextField
            select
            size="small"
            label="Pre-approver"
            value={config.preApprover ?? ''}
            disabled={readOnly}
            onChange={(e) => setConfig((prev) => ({ ...prev, preApprover: e.target.value || null }))}
            slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }}
            sx={fieldSx}
          >
            <MenuItem value="">Top of hierarchy (default)</MenuItem>
            {DIRECTORY.map((user) => (
              <MenuItem key={user.id} value={user.id}>
                {user.displayName}
              </MenuItem>
            ))}
          </TextField>
        )}

        {error && (
          <Typography role="alert" variant="body2" color="error" sx={{ wordBreak: 'break-word' }}>
            {error}
          </Typography>
        )}

        {!readOnly && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mt: 'auto', pt: 0.5 }}>
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
      )}
      </Box>
    </Box>
  )
}
