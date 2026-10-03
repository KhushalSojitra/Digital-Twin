import { useState } from 'react'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Radio,
  RadioGroup,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import SyncRoundedIcon from '@mui/icons-material/SyncRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import WifiTetheringRoundedIcon from '@mui/icons-material/WifiTetheringRounded'
import {
  PLATFORM_TYPE_LABEL,
  SNAPSHOT_POLICY_LABEL,
  STATUS_TONE,
  emptyIntegrationDraft,
  type Integration,
  type SnapshotPolicy,
} from '../../data/integrations'
import { useIntegrations } from '../../state/IntegrationsContext'
import { formatDateTime, formatRelative } from '../../utils/format'
import IntegrationEditorDialog, { type IntegrationDraft } from './IntegrationEditorDialog'

function validateIntegration(value: IntegrationDraft): string | null {
  if (!value.name.trim()) return 'Platform name is required.'
  if (!value.baseUrl.trim()) return 'Base endpoint URL is required.'
  if (value.authMethod === 'oauth' && (!value.oauthClientId.trim() || !value.oauthTokenUrl.trim())) {
    return 'OAuth Client ID and Token URL are required.'
  }
  if (value.authMethod === 'basic' && !value.username.trim()) return 'Username is required for Basic Auth.'
  if (value.liveViewTicketDays < 1 || value.storeTicketDays < 1) return 'Ticket age windows must be at least 1 day.'
  return null
}

export default function TicketingIntegrations() {
  const {
    integrations,
    defaultId,
    setDefaultId,
    defaultIntegration,
    sync,
    testConnection,
    saveIntegration,
    addIntegration,
    removeIntegration,
  } = useIntegrations()
  const [editing, setEditing] = useState<Integration | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<IntegrationDraft>(emptyIntegrationDraft)
  const [testing, setTesting] = useState<string | null>(null)
  const [testNote, setTestNote] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Integration | null>(null)
  const [pendingDefault, setPendingDefault] = useState<Integration | null>(null)

  const openCreate = () => {
    setDraft(emptyIntegrationDraft())
    setCreating(true)
  }

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 0.5 }}>
        <Typography variant="subtitle1" sx={{ flex: 1 }}>
          Third-party ticketing
        </Typography>
        <Button size="small" variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate}>
          Add Integration
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Jira is provided by default and cannot be deleted. Snapshot and ticket-age settings are per provider. New tickets default to{' '}
        <Box component="span" sx={{ fontWeight: 700 }}>
          {defaultIntegration.name}
        </Box>
        .
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 1.5 }}>
        {integrations.map((integration) => {
          const tone = STATUS_TONE[integration.status]
          const isDefault = integration.id === defaultId
          return (
            <Paper
              key={integration.id}
              elevation={0}
              sx={(t) => ({
                p: 1.75,
                borderRadius: '16px',
                border: `1px solid ${isDefault ? t.palette.primary.main : t.palette.divider}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.25,
              })}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                    <Typography variant="subtitle1">{integration.name}</Typography>
                    {isDefault && <Chip size="small" color="primary" label="Default" />}
                    {integration.locked && <Chip size="small" label="Built-in" />}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {PLATFORM_TYPE_LABEL[integration.platformType]}
                  </Typography>
                </Box>
                <Chip size="small" label={tone.label} sx={{ bgcolor: `${tone.color}22`, color: tone.color, border: `1px solid ${tone.color}55` }} />
              </Stack>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
                <TextField
                  size="small"
                  type="number"
                  label="Days on Live View"
                  value={integration.liveViewTicketDays}
                  onChange={(e) => saveIntegration({ ...integration, liveViewTicketDays: Math.max(1, Number(e.target.value) || 1) })}
                />
                <TextField
                  size="small"
                  type="number"
                  label="Days of data to store"
                  value={integration.storeTicketDays}
                  onChange={(e) => saveIntegration({ ...integration, storeTicketDays: Math.max(1, Number(e.target.value) || 1) })}
                />
              </Box>

              <Typography variant="caption" color="text.secondary">
                Snapshot Configuration
              </Typography>
              <RadioGroup
                value={integration.snapshotPolicy}
                onChange={(_, next) => saveIntegration({ ...integration, snapshotPolicy: next as SnapshotPolicy })}
              >
                {(Object.keys(SNAPSHOT_POLICY_LABEL) as SnapshotPolicy[]).map((policy) => (
                  <FormControlLabel key={policy} value={policy} control={<Radio size="small" />} label={SNAPSHOT_POLICY_LABEL[policy]} />
                ))}
              </RadioGroup>

              <Typography variant="caption" color="text.secondary">
                Last sync{' '}
                {integration.status === 'disconnected'
                  ? 'never completed'
                  : `${formatRelative(integration.lastSyncAt)} · ${formatDateTime(integration.lastSyncAt)}`}
              </Typography>

              <Divider />
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Tooltip title="Test connection">
                  <IconButton
                    size="small"
                    aria-label={`Test connection for ${integration.name}`}
                    onClick={async () => {
                      setTesting(integration.id)
                      const ok = await testConnection(integration.id)
                      setTesting(null)
                      setTestNote(ok ? `${integration.name} connected` : `${integration.name} failed`)
                    }}
                  >
                    <WifiTetheringRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Sync now">
                  <IconButton size="small" aria-label={`Sync ${integration.name}`} onClick={() => sync(integration.id)}>
                    <SyncRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Edit">
                  <IconButton size="small" aria-label={`Edit ${integration.name}`} onClick={() => setEditing({ ...integration })}>
                    <EditRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={isDefault ? 'Already the default' : 'Set default'}>
                  <span>
                    <IconButton size="small" aria-label={`Set ${integration.name} as default`} onClick={() => setPendingDefault(integration)} disabled={isDefault} color={isDefault ? 'primary' : 'default'}>
                      <CheckCircleRoundedIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={integration.locked ? 'Jira cannot be deleted' : 'Delete integration'}>
                  <span>
                    <IconButton size="small" aria-label={`Delete ${integration.name}`} onClick={() => setPendingDelete(integration)} disabled={Boolean(integration.locked)}>
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                {testing === integration.id && (
                  <Typography variant="caption" color="text.secondary">
                    Testing…
                  </Typography>
                )}
                {testNote && testing === null && (
                  <Typography variant="caption" color="success.main">
                    {testNote}
                  </Typography>
                )}
              </Stack>
            </Paper>
          )
        })}
      </Box>

      <IntegrationEditorDialog
        open={creating}
        title="Add Integration"
        value={draft}
        error={formError}
        onChange={(patch) => {
          setFormError(null)
          setDraft((prev) => ({ ...prev, ...patch }))
        }}
        onClose={() => {
          setCreating(false)
          setFormError(null)
        }}
        onSave={() => {
          const message = validateIntegration(draft)
          if (message) {
            setFormError(message)
            return
          }
          addIntegration(draft)
          setCreating(false)
          setFormError(null)
          setNote(`${draft.name.trim()} added.`)
        }}
      />
      <IntegrationEditorDialog
        open={Boolean(editing)}
        title="Edit Integration"
        value={editing ?? draft}
        lockType={Boolean(editing?.locked)}
        error={formError}
        onChange={(patch) => {
          setFormError(null)
          setEditing((prev) => (prev ? { ...prev, ...patch } : prev))
        }}
        onClose={() => {
          setEditing(null)
          setFormError(null)
        }}
        onSave={() => {
          if (!editing) return
          const message = validateIntegration(editing)
          if (message) {
            setFormError(message)
            return
          }
          saveIntegration(editing)
          setEditing(null)
          setFormError(null)
          setNote(`${editing.name.trim()} saved.`)
        }}
        onTest={editing ? () => testConnection(editing.id) : undefined}
        onSync={
          editing
            ? () => {
                sync(editing.id)
                setNote(`${editing.name} synced.`)
              }
            : undefined
        }
        onSetDefault={editing ? () => setPendingDefault(editing) : undefined}
      />

      <Dialog open={Boolean(pendingDelete)} onClose={() => setPendingDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete integration</DialogTitle>
        <DialogContent>
          <Typography variant="body2">Delete {pendingDelete?.name}? Existing tickets stay in OominiEye.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (!pendingDelete) return
              removeIntegration(pendingDelete.id)
              setNote(`${pendingDelete.name} deleted.`)
              setPendingDelete(null)
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(pendingDefault)} onClose={() => setPendingDefault(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Set default platform</DialogTitle>
        <DialogContent>
          <Typography variant="body2">Use {pendingDefault?.name} as the default ticketing platform for new tickets?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDefault(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              if (!pendingDefault) return
              setDefaultId(pendingDefault.id)
              setNote(`${pendingDefault.name} is now the default platform.`)
              setPendingDefault(null)
            }}
          >
            Set default
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(note)} autoHideDuration={3000} onClose={() => setNote(null)} message={note ?? ''} />
    </Box>
  )
}
