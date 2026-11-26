import { useId, useState, type ReactNode } from 'react'
import { Box, Button, Checkbox, IconButton, MenuItem, Popover, TextField, Tooltip, Typography } from '@mui/material'
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
  // Flow step settings open in a small window attached to the gear button.
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null)
  const showSettings = Boolean(settingsAnchor)

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

      {!readOnly && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) minmax(0, 2fr)' }, gap: 1.5, pt: 0.5 }}>
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
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={fieldSx}
          />
        </Box>
      )}

      {error && (
        <Typography role="alert" variant="body2" color="error" sx={{ wordBreak: 'break-word' }}>
          {error}
        </Typography>
      )}

      <Box sx={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto' }}>
        <WorkflowPreview
          config={config}
          currentState={currentState}
          headerAction={
            <Tooltip title={showSettings ? '' : 'Flow step settings'}>
              <IconButton
                size="small"
                aria-label="Flow step settings"
                aria-haspopup="dialog"
                aria-expanded={showSettings}
                onClick={(e) => setSettingsAnchor(showSettings ? null : e.currentTarget)}
                sx={(t) => ({ ...toolButtonSx(t), ...(showSettings && { bgcolor: 'primary.main', color: 'primary.contrastText', borderColor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }) })}
              >
                <TuneRoundedIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          }
        />
      </Box>

      <Popover
        open={showSettings}
        anchorEl={settingsAnchor}
        onClose={() => setSettingsAnchor(null)}
        sx={{ zIndex: (t) => t.zIndex.modal + 40 }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-label': 'Flow step settings',
            sx: (t) => ({
              ...glassCardSx(t),
              mt: 1,
              width: 260,
              p: 1.5,
              overflow: 'visible',
              boxShadow: t.shadows[8],
              // Small pointer joining the window to the gear button.
              '&::before': {
                content: '""',
                position: 'absolute',
                top: -6,
                right: 10,
                width: 12,
                height: 12,
                bgcolor: 'background.paper',
                borderLeft: 1,
                borderTop: 1,
                borderColor: 'divider',
                transform: 'rotate(45deg)',
              },
            }),
          },
        }}
      >
        <Typography variant="subtitle2" component="h4" sx={{ mb: 0.5 }}>
          Flow step settings
        </Typography>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {CONFIG_OPTIONS.map(({ key, label, description: hint }) => {
            const id = `${idPrefix}-${key}`
            return (
              <Box
                component="li"
                key={key}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 36, '& + &': { borderTop: 1, borderColor: 'divider' } }}
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
                  sx={{ p: 0.5 }}
                />
              </Box>
            )
          })}
        </Box>

        {config.preApproval && (
          <TextField
            select
            fullWidth
            size="small"
            label="Pre-approver"
            value={config.preApprover ?? ''}
            disabled={readOnly}
            onChange={(e) => setConfig((prev) => ({ ...prev, preApprover: e.target.value || null }))}
            slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true, MenuProps: { sx: { zIndex: (t) => t.zIndex.modal + 50 } } } }}
            sx={{ ...fieldSx, mt: 1.5 }}
          >
            <MenuItem value="">Top of hierarchy (default)</MenuItem>
            {DIRECTORY.map((user) => (
              <MenuItem key={user.id} value={user.id}>
                {user.displayName}
              </MenuItem>
            ))}
          </TextField>
        )}

        {readOnly && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            View only: these steps can't be changed here.
          </Typography>
        )}
      </Popover>
    </Box>
  )
}
