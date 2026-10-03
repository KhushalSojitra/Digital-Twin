import type { Ticket, TicketPlatform, TicketStatus } from './tickets'

export type PlatformType = 'jira' | 'servicenow' | 'openproject' | 'custom_api' | 'client_internal'
export type AuthMethod = 'oauth' | 'api_key' | 'basic'
export type ConnectionStatus = 'connected' | 'degraded' | 'disconnected'
export type SnapshotPolicy = 'always' | 'creator_chooses' | 'disabled'
export type HttpMethod = 'POST' | 'PUT' | 'PATCH'

export interface HeaderPair {
  key: string
  value: string
}

export interface StatusMapRow {
  internal: TicketStatus
  field: string
  value: string
}

export interface FieldMapRow {
  local: string
  remote: string
  value: string
}

export interface Integration {
  id: string
  name: string
  platformType: PlatformType
  /** Built-in Jira cannot be deleted. */
  locked?: boolean
  baseUrl: string
  host: string
  username: string
  password: string
  authMethod: AuthMethod
  apiKey: string
  webhookUrl: string
  syncEndpoint: string
  status: ConnectionStatus
  lastSyncAt: string
  syncedTickets: number
  platform: TicketPlatform
  platformName: string
  headers: HeaderPair[]
  oauthClientId: string
  oauthClientSecret: string
  oauthAuthUrl: string
  oauthTokenUrl: string
  oauthScopes: string
  httpMethod: HttpMethod
  bodyTemplate: string
  responseIdPath: string
  statusMappings: StatusMapRow[]
  fieldMappings: FieldMapRow[]
  usesTransitionEndpoint: boolean
  webhookListenerId: string
  webhookSecret: string
  incomingIdPath: string
  incomingStatusPath: string
  incomingEventPath: string
  fetchRecordPath: string
  maxRequestsPerMinute: number
  requestCooldownMs: number
  liveViewTicketDays: number
  storeTicketDays: number
  snapshotPolicy: SnapshotPolicy
}

export const PLATFORM_TYPE_LABEL: Record<PlatformType, string> = {
  jira: 'Jira',
  servicenow: 'ServiceNow',
  openproject: 'OpenProject',
  custom_api: 'Custom API',
  client_internal: 'Client Internal System',
}

export const ADDABLE_PLATFORM_TYPES: PlatformType[] = ['servicenow', 'openproject', 'custom_api', 'client_internal']

export const AUTH_METHOD_LABEL: Record<AuthMethod, string> = {
  oauth: 'OAuth 2.0',
  api_key: 'API Key / Header',
  basic: 'Basic Auth',
}

export const SNAPSHOT_POLICY_LABEL: Record<SnapshotPolicy, string> = {
  always: 'Always Capture Snapshot',
  creator_chooses: 'Ticket Creator Chooses',
  disabled: 'Disable Snapshot Feature',
}

export const STATUS_TONE: Record<ConnectionStatus, { label: string; color: string }> = {
  connected: { label: 'Connected', color: '#30D158' },
  degraded: { label: 'Degraded', color: '#FF9F0A' },
  disconnected: { label: 'Disconnected', color: '#8E8E93' },
}

export function platformForType(type: PlatformType): { platform: TicketPlatform; platformName: string } {
  if (type === 'jira') return { platform: 'client', platformName: 'Jira' }
  if (type === 'servicenow') return { platform: 'client', platformName: 'ServiceNow' }
  if (type === 'openproject') return { platform: 'default', platformName: 'OpenProject' }
  if (type === 'client_internal') return { platform: 'custom', platformName: 'Client Internal System' }
  return { platform: 'custom', platformName: 'Custom API' }
}

export function webhookListenerUrl(listenerId: string) {
  return `https://oomnieye.io/webhooks/tickets/${listenerId}`
}

const DEFAULT_STATUS_MAPPINGS: StatusMapRow[] = [
  { internal: 'open', field: 'status', value: 'to_do' },
  { internal: 'in_progress', field: 'status', value: 'in_progress' },
  { internal: 'done', field: 'status', value: 'done' },
  { internal: 'accepted', field: 'status', value: 'accepted' },
  { internal: 'failed', field: 'status', value: 'failed' },
]

const DEFAULT_FIELD_MAPPINGS: FieldMapRow[] = [
  { local: 'priority', remote: 'priority', value: 'medium' },
  { local: 'category', remote: 'issuetype', value: 'Incident' },
]

export function defaultIntegrationFields(id = `int-${Date.now()}`): Pick<
  Integration,
  | 'headers'
  | 'oauthClientId'
  | 'oauthClientSecret'
  | 'oauthAuthUrl'
  | 'oauthTokenUrl'
  | 'oauthScopes'
  | 'httpMethod'
  | 'bodyTemplate'
  | 'responseIdPath'
  | 'statusMappings'
  | 'fieldMappings'
  | 'usesTransitionEndpoint'
  | 'webhookListenerId'
  | 'webhookSecret'
  | 'incomingIdPath'
  | 'incomingStatusPath'
  | 'incomingEventPath'
  | 'fetchRecordPath'
  | 'maxRequestsPerMinute'
  | 'requestCooldownMs'
  | 'liveViewTicketDays'
  | 'storeTicketDays'
  | 'snapshotPolicy'
> {
  return {
    headers: [{ key: 'X-API-Key', value: '' }],
    oauthClientId: '',
    oauthClientSecret: '',
    oauthAuthUrl: '',
    oauthTokenUrl: '',
    oauthScopes: 'read write',
    httpMethod: 'POST',
    bodyTemplate: '{\n  "title": "{{my_ticket.title}}",\n  "desc": "{{my_ticket.body}}"\n}',
    responseIdPath: '$.id',
    statusMappings: DEFAULT_STATUS_MAPPINGS.map((row) => ({ ...row })),
    fieldMappings: DEFAULT_FIELD_MAPPINGS.map((row) => ({ ...row })),
    usesTransitionEndpoint: false,
    webhookListenerId: id,
    webhookSecret: '',
    incomingIdPath: '$.payload.ticket_id',
    incomingStatusPath: '$.payload.current_status',
    incomingEventPath: '$.event_name',
    fetchRecordPath: '/tickets/{{external_id}}',
    maxRequestsPerMinute: 60,
    requestCooldownMs: 200,
    liveViewTicketDays: 30,
    storeTicketDays: 90,
    snapshotPolicy: 'creator_chooses',
  }
}

export function emptyIntegrationDraft(): Omit<Integration, 'id' | 'status' | 'lastSyncAt' | 'syncedTickets' | 'platform' | 'platformName'> {
  return {
    name: '',
    platformType: 'servicenow',
    baseUrl: '',
    host: '',
    username: '',
    password: '',
    authMethod: 'api_key',
    apiKey: '',
    webhookUrl: '',
    syncEndpoint: '',
    ...defaultIntegrationFields(),
  }
}

export function matchIntegration(ticket: Pick<Ticket, 'platform' | 'platformName'>, integrations: Integration[]) {
  return (
    integrations.find((i) => ticket.platformName && i.platformName === ticket.platformName) ??
    integrations.find((i) => i.platform === ticket.platform) ??
    integrations.find((i) => i.locked)
  )
}

export function ticketAgeDays(ticket: Pick<Ticket, 'createdAt'>) {
  return (Date.now() - new Date(ticket.createdAt).getTime()) / 86_400_000
}

export function isWithinStoreWindow(ticket: Ticket, integrations: Integration[]) {
  const days = matchIntegration(ticket, integrations)?.storeTicketDays ?? 90
  return ticketAgeDays(ticket) <= days
}

export function isWithinLiveWindow(ticket: Ticket, integrations: Integration[]) {
  const days = matchIntegration(ticket, integrations)?.liveViewTicketDays ?? 30
  return ticketAgeDays(ticket) <= days
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

export const INTEGRATIONS: Integration[] = [
  {
    id: 'jira',
    name: 'Jira',
    platformType: 'jira',
    locked: true,
    baseUrl: 'https://harbourauth.atlassian.net',
    host: 'harbourauth.atlassian.net',
    username: 'jira-bot',
    password: '••••••••',
    authMethod: 'api_key',
    apiKey: 'ATATT3xFfGF0-demo',
    webhookUrl: 'https://harbourauth.atlassian.net/rest/webhooks/1.0',
    syncEndpoint: 'https://harbourauth.atlassian.net/rest/api/3/issue',
    status: 'connected',
    lastSyncAt: minutesAgo(17),
    syncedTickets: 48,
    platform: 'client',
    platformName: 'Jira',
    ...defaultIntegrationFields('jira'),
    headers: [{ key: 'X-API-Key', value: 'ATATT3xFfGF0-demo' }],
    oauthAuthUrl: 'https://auth.atlassian.com/authorize',
    oauthTokenUrl: 'https://auth.atlassian.com/oauth/token',
    responseIdPath: '$.issue.key',
    usesTransitionEndpoint: true,
    fetchRecordPath: '/rest/api/3/issue/{{external_id}}',
    snapshotPolicy: 'creator_chooses',
    liveViewTicketDays: 30,
    storeTicketDays: 90,
  },
]

export const DEFAULT_SNAPSHOT_POLICY: SnapshotPolicy = 'creator_chooses'
