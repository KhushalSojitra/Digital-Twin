import type { ReactNode } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import { dialogPaperSx } from '../../theme/hud'
import {
  ADDABLE_PLATFORM_TYPES,
  AUTH_METHOD_LABEL,
  PLATFORM_TYPE_LABEL,
  SNAPSHOT_POLICY_LABEL,
  webhookListenerUrl,
  type AuthMethod,
  type FieldMapRow,
  type HeaderPair,
  type HttpMethod,
  type Integration,
  type PlatformType,
  type SnapshotPolicy,
  type StatusMapRow,
} from '../../data/integrations'
import { STATUS_LABEL, type TicketStatus } from '../../data/tickets'

export type IntegrationDraft = Omit<Integration, 'id' | 'status' | 'lastSyncAt' | 'syncedTickets' | 'platform' | 'platformName'> & {
  id?: string
}

interface Props {
  open: boolean
  title: string
  value: IntegrationDraft
  lockType?: boolean
  onChange: (patch: Partial<Integration>) => void
  onClose: () => void
  onSave: () => void
  onTest?: () => void
  onSync?: () => void
  onSetDefault?: () => void
  error?: string | null
}

export default function IntegrationEditorDialog({
  open,
  title,
  value,
  lockType = false,
  onChange,
  onClose,
  onSave,
  onTest,
  onSync,
  onSetDefault,
  error,
}: Props) {
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))
  const types = lockType ? (['jira', ...ADDABLE_PLATFORM_TYPES] as PlatformType[]) : ADDABLE_PLATFORM_TYPES
  const listenerId = value.webhookListenerId || value.id || 'new'

  const setHeaders = (headers: HeaderPair[]) => onChange({ headers })
  const setStatusMappings = (statusMappings: StatusMapRow[]) => onChange({ statusMappings })
  const setFieldMappings = (fieldMappings: FieldMapRow[]) => onChange({ fieldMappings })

  return (
    <Dialog open={open} onClose={onClose} fullWidth fullScreen={isXs} maxWidth="md" slotProps={{ paper: { sx: dialogPaperSx } }}>
      <DialogTitle>
        <Typography variant="h6">{title}</Typography>
      </DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Section title="General">
          <TextField size="small" label="Platform Name" value={value.name} onChange={(e) => onChange({ name: e.target.value })} required />
          <FormControl size="small">
            <InputLabel>Platform Type</InputLabel>
            <Select label="Platform Type" value={value.platformType} onChange={(e) => onChange({ platformType: e.target.value as PlatformType })} disabled={lockType}>
              {types.map((type) => (
                <MenuItem key={type} value={type}>
                  {PLATFORM_TYPE_LABEL[type]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Section>

        <Section title="1. Connection & Authentication Matrix">
          <FormControl size="small">
            <InputLabel>Authentication Strategy</InputLabel>
            <Select label="Authentication Strategy" value={value.authMethod} onChange={(e) => onChange({ authMethod: e.target.value as AuthMethod })}>
              {(Object.keys(AUTH_METHOD_LABEL) as AuthMethod[]).map((method) => (
                <MenuItem key={method} value={method}>
                  {AUTH_METHOD_LABEL[method]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField size="small" label="Base Endpoint URL" value={value.baseUrl} onChange={(e) => onChange({ baseUrl: e.target.value })} placeholder="https://{subdomain}.example.com" />
          <TextField size="small" label="IP / DNS" value={value.host} onChange={(e) => onChange({ host: e.target.value })} />

          <Typography variant="caption" color="text.secondary">
            Header Configurations
          </Typography>
          {(value.headers ?? []).map((header, index) => (
            <Stack key={index} direction="row" spacing={1}>
              <TextField size="small" label="Header" value={header.key} onChange={(e) => setHeaders(value.headers.map((row, i) => (i === index ? { ...row, key: e.target.value } : row)))} />
              <TextField size="small" label="Value" value={header.value} onChange={(e) => setHeaders(value.headers.map((row, i) => (i === index ? { ...row, value: e.target.value } : row)))} />
              <IconButton size="small" aria-label="Remove header" onClick={() => setHeaders(value.headers.filter((_, i) => i !== index))}>
                <DeleteOutlineRoundedIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => setHeaders([...(value.headers ?? []), { key: '', value: '' }])}>
            Add header
          </Button>

          {value.authMethod === 'oauth' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
              <TextField size="small" label="Client ID" value={value.oauthClientId} onChange={(e) => onChange({ oauthClientId: e.target.value })} />
              <TextField size="small" type="password" label="Client Secret" value={value.oauthClientSecret} onChange={(e) => onChange({ oauthClientSecret: e.target.value })} />
              <TextField size="small" label="Auth URL" value={value.oauthAuthUrl} onChange={(e) => onChange({ oauthAuthUrl: e.target.value })} />
              <TextField size="small" label="Token URL" value={value.oauthTokenUrl} onChange={(e) => onChange({ oauthTokenUrl: e.target.value })} />
              <TextField size="small" label="Scopes" value={value.oauthScopes} onChange={(e) => onChange({ oauthScopes: e.target.value })} sx={{ gridColumn: { sm: '1 / -1' } }} />
            </Box>
          )}
          {value.authMethod === 'basic' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
              <TextField size="small" label="Username" value={value.username} onChange={(e) => onChange({ username: e.target.value })} />
              <TextField size="small" type="password" label="Password / Token" value={value.password} onChange={(e) => onChange({ password: e.target.value })} />
            </Box>
          )}
          {value.authMethod === 'api_key' && (
            <TextField size="small" label="API Key" value={value.apiKey} onChange={(e) => onChange({ apiKey: e.target.value })} />
          )}
        </Section>

        <Section title="2. Payload Configuration">
          <FormControl size="small">
            <InputLabel>HTTP Method</InputLabel>
            <Select label="HTTP Method" value={value.httpMethod} onChange={(e) => onChange({ httpMethod: e.target.value as HttpMethod })}>
              {(['POST', 'PUT', 'PATCH'] as HttpMethod[]).map((method) => (
                <MenuItem key={method} value={method}>
                  {method}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            size="small"
            label="Dynamic Body Template"
            value={value.bodyTemplate}
            onChange={(e) => onChange({ bodyTemplate: e.target.value })}
            multiline
            minRows={4}
            helperText='Template variables such as {{my_ticket.title}} and {{my_ticket.body}}'
          />
          <TextField size="small" label="Response Mapping Key" value={value.responseIdPath} onChange={(e) => onChange({ responseIdPath: e.target.value })} placeholder="$.id or $.issue.key" />
        </Section>

        <Section title="3. Dynamic Field & Status Mapping">
          <Typography variant="caption" color="text.secondary">
            Status Value Mappings
          </Typography>
          {(value.statusMappings ?? []).map((row, index) => (
            <Stack key={index} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Internal</InputLabel>
                <Select
                  label="Internal"
                  value={row.internal}
                  onChange={(e) => setStatusMappings(value.statusMappings.map((item, i) => (i === index ? { ...item, internal: e.target.value as TicketStatus } : item)))}
                >
                  {(Object.keys(STATUS_LABEL) as TicketStatus[]).map((status) => (
                    <MenuItem key={status} value={status}>
                      {STATUS_LABEL[status]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField size="small" label="Target field" value={row.field} onChange={(e) => setStatusMappings(value.statusMappings.map((item, i) => (i === index ? { ...item, field: e.target.value } : item)))} />
              <TextField size="small" label="Target value" value={row.value} onChange={(e) => setStatusMappings(value.statusMappings.map((item, i) => (i === index ? { ...item, value: e.target.value } : item)))} />
              <IconButton size="small" aria-label="Remove status mapping" onClick={() => setStatusMappings(value.statusMappings.filter((_, i) => i !== index))}>
                <DeleteOutlineRoundedIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => setStatusMappings([...(value.statusMappings ?? []), { internal: 'open', field: 'status', value: '' }])}>
            Add status mapping
          </Button>

          <Typography variant="caption" color="text.secondary">
            Required System Fields
          </Typography>
          {(value.fieldMappings ?? []).map((row, index) => (
            <Stack key={index} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField size="small" label="Local field" value={row.local} onChange={(e) => setFieldMappings(value.fieldMappings.map((item, i) => (i === index ? { ...item, local: e.target.value } : item)))} />
              <TextField size="small" label="Vendor key" value={row.remote} onChange={(e) => setFieldMappings(value.fieldMappings.map((item, i) => (i === index ? { ...item, remote: e.target.value } : item)))} />
              <TextField size="small" label="Value" value={row.value} onChange={(e) => setFieldMappings(value.fieldMappings.map((item, i) => (i === index ? { ...item, value: e.target.value } : item)))} />
              <IconButton size="small" aria-label="Remove field mapping" onClick={() => setFieldMappings(value.fieldMappings.filter((_, i) => i !== index))}>
                <DeleteOutlineRoundedIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => setFieldMappings([...(value.fieldMappings ?? []), { local: '', remote: '', value: '' }])}>
            Add field mapping
          </Button>
          <FormControlLabel
            control={<Switch checked={Boolean(value.usesTransitionEndpoint)} onChange={(_, checked) => onChange({ usesTransitionEndpoint: checked })} />}
            label="State Transition Flag — target requires a transition endpoint"
          />
        </Section>

        <Section title="4. Webhook Receiver Framework">
          <TextField size="small" label="Webhook Endpoint" value={webhookListenerUrl(listenerId)} slotProps={{ htmlInput: { readOnly: true } }} helperText="Paste this listener URL into the third-party system" />
          <TextField size="small" label="Secret Token Verification Key" value={value.webhookSecret} onChange={(e) => onChange({ webhookSecret: e.target.value })} />
          <TextField size="small" label="External Ticket ID Path" value={value.incomingIdPath} onChange={(e) => onChange({ incomingIdPath: e.target.value })} placeholder="$.payload.ticket_id" />
          <TextField size="small" label="New Status Path" value={value.incomingStatusPath} onChange={(e) => onChange({ incomingStatusPath: e.target.value })} placeholder="$.payload.current_status" />
          <TextField size="small" label="Event Type Path" value={value.incomingEventPath} onChange={(e) => onChange({ incomingEventPath: e.target.value })} placeholder="$.event_name" />
        </Section>

        <Section title="5. Fetch & Polling Fallback">
          <TextField size="small" label="Fetch Single Record Path" value={value.fetchRecordPath} onChange={(e) => onChange({ fetchRecordPath: e.target.value })} placeholder="/tickets/{{external_id}}" />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
            <TextField size="small" type="number" label="Max requests per minute" value={value.maxRequestsPerMinute} onChange={(e) => onChange({ maxRequestsPerMinute: Number(e.target.value) || 0 })} />
            <TextField size="small" type="number" label="Request cooldown (ms)" value={value.requestCooldownMs} onChange={(e) => onChange({ requestCooldownMs: Number(e.target.value) || 0 })} />
          </Box>
        </Section>

        <Section title="Ticket retention">
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
            <TextField
              size="small"
              type="number"
              label="Days of tickets on Live View"
              value={value.liveViewTicketDays}
              onChange={(e) => onChange({ liveViewTicketDays: Math.max(1, Number(e.target.value) || 1) })}
            />
            <TextField
              size="small"
              type="number"
              label="Days of ticket data to store"
              value={value.storeTicketDays}
              onChange={(e) => onChange({ storeTicketDays: Math.max(1, Number(e.target.value) || 1) })}
            />
          </Box>
        </Section>

        <Section title="Snapshot Configuration">
          <RadioGroup value={value.snapshotPolicy} onChange={(_, next) => onChange({ snapshotPolicy: next as SnapshotPolicy })}>
            {(Object.keys(SNAPSHOT_POLICY_LABEL) as SnapshotPolicy[]).map((policy) => (
              <FormControlLabel key={policy} value={policy} control={<Radio size="small" />} label={SNAPSHOT_POLICY_LABEL[policy]} />
            ))}
          </RadioGroup>
        </Section>
        {error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 0.75 }}>
        {onTest && (
          <Button size="small" onClick={onTest}>
            Test connection
          </Button>
        )}
        {onSync && (
          <Button size="small" onClick={onSync}>
            Sync now
          </Button>
        )}
        {onSetDefault && (
          <Button size="small" onClick={onSetDefault}>
            Set default
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={onSave} disabled={!value.name.trim()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        {title}
      </Typography>
      <Stack spacing={1.25} sx={{ mt: 1 }}>
        {children}
      </Stack>
    </Box>
  )
}
