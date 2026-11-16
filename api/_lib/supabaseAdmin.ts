import { APPLICATION_PROJECT_REF, FORBIDDEN_PROJECT_REFS, jwtClaims, projectRefFromUrl } from './projectRef.js'

export class SupabaseAdminError extends Error {
  readonly status: number
  readonly code: string | undefined
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export type AdminConfig =
  | { ok: true; url: string; key: string; projectRef: string; problem?: string }
  | { ok: false; problem: string }

const REQUEST_TIMEOUT_MS = 15000

/**
 * Server-only credentials for the Supabase project that owns public.tickets. They are deliberately
 * separate from the VITE_* variables, which are shipped to the browser, and from the SUPABASE_* variables
 * of the connected integration, which belong to a different project.
 *
 * The configuration is refused (never silently used) unless every check passes:
 *  - APP_SUPABASE_URL is https://okkgnwiqcupflocoobes.supabase.co,
 *  - no forbidden project ref appears,
 *  - APP_SUPABASE_SERVICE_ROLE_KEY is a service-role key for that same project,
 *  - VITE_SUPABASE_URL (the browser connection), when present, points at the same project.
 * The returned `problem` never contains a secret.
 */
export function readAdminConfig(env: NodeJS.ProcessEnv = process.env): AdminConfig {
  const rawUrl = env.APP_SUPABASE_URL?.trim().replace(/\/+$/, '')
  const key = env.APP_SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!rawUrl || !key) return { ok: false, problem: 'APP_SUPABASE_URL and APP_SUPABASE_SERVICE_ROLE_KEY must both be set.' }

  const ref = projectRefFromUrl(rawUrl)
  if (!ref || new URL(rawUrl).pathname !== '/') {
    return { ok: false, problem: 'APP_SUPABASE_URL must look like https://<project-ref>.supabase.co.' }
  }
  if (FORBIDDEN_PROJECT_REFS.includes(ref)) return { ok: false, problem: 'APP_SUPABASE_URL points at a project this application must never use.' }
  if (ref !== APPLICATION_PROJECT_REF) return { ok: false, problem: 'APP_SUPABASE_URL is not the application project.' }

  if (key.startsWith('sb_publishable_')) return { ok: false, problem: 'APP_SUPABASE_SERVICE_ROLE_KEY is a publishable key, not a service-role key.' }
  if (!key.startsWith('sb_secret_')) {
    const claims = jwtClaims(key)
    if (!claims) return { ok: false, problem: 'APP_SUPABASE_SERVICE_ROLE_KEY is not a recognised Supabase key.' }
    if (claims.role !== 'service_role') return { ok: false, problem: 'APP_SUPABASE_SERVICE_ROLE_KEY is not a service-role key.' }
    if (typeof claims.ref !== 'string' || claims.ref !== APPLICATION_PROJECT_REF) {
      return { ok: false, problem: 'APP_SUPABASE_SERVICE_ROLE_KEY belongs to a different project.' }
    }
  }

  const browserUrl = env.VITE_SUPABASE_URL?.trim()
  if (browserUrl && projectRefFromUrl(browserUrl) !== ref) {
    return { ok: false, problem: 'VITE_SUPABASE_URL and APP_SUPABASE_URL point at different projects.' }
  }

  return { ok: true, url: `https://${ref}.supabase.co`, key, projectRef: ref }
}

export function isAdminConfigured(): boolean {
  return readAdminConfig().ok
}

/** What the status action may reveal: whether the server is configured and for which project, never a key. */
export function describeAdminConfig(): { configured: boolean; projectRef: string | null; problem: string | null } {
  const config = readAdminConfig()
  return config.ok
    ? { configured: true, projectRef: config.projectRef, problem: null }
    : { configured: false, projectRef: null, problem: config.problem }
}

/** Reads only the stored comment attachment URLs for one ticket, before its permanent deletion. */
export async function getTicketAttachmentObjectPaths(ticketId: string): Promise<string[]> {
  const config = readAdminConfig()
  if (!config.ok) {
    console.error('Supabase admin configuration refused:', config.problem)
    throw new SupabaseAdminError('Ticket management is not configured on the server.', 503, 'not_configured')
  }

  const endpoint = new URL('/rest/v1/tickets', config.url)
  endpoint.searchParams.set('id', `eq.${ticketId}`)
  endpoint.searchParams.set('select', 'replies')

  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: 'application/json', apikey: config.key, Authorization: `Bearer ${config.key}` },
    })
  } catch {
    throw new SupabaseAdminError('The ticket attachments could not be checked. Please try again.', 502, 'unreachable')
  }
  if (!response.ok) {
    console.error('Supabase attachment lookup failed:', response.status)
    throw new SupabaseAdminError('The ticket attachments could not be checked. Please try again.', 502, 'attachment_lookup_failed')
  }

  const rows: unknown = await response.json()
  if (!Array.isArray(rows) || rows.length === 0) return []
  const replies = (rows[0] as { replies?: unknown } | null)?.replies
  if (!Array.isArray(replies)) return []

  const paths = new Set<string>()
  for (const reply of replies) {
    if (typeof reply !== 'object' || reply === null) continue
    const attachments = (reply as { attachments?: unknown }).attachments
    if (!Array.isArray(attachments)) continue
    for (const attachment of attachments) {
      const storedUrl = (attachment as { url?: unknown } | null)?.url
      if (typeof storedUrl !== 'string') continue
      try {
        const parsed = new URL(storedUrl)
        // Never interpret an arbitrary/external URL as an object in this project's bucket.
        if (parsed.origin !== config.url) continue
        const marker = '/storage/v1/object/'
        const markerIndex = parsed.pathname.indexOf(marker)
        if (markerIndex < 0) continue
        const segments = parsed.pathname.slice(markerIndex + marker.length).split('/')
        if (['public', 'sign', 'authenticated'].includes(segments[0])) segments.shift()
        const bucket = segments.shift()
        if (bucket !== 'ticket-attachments' || segments.length === 0) continue
        const path = segments.map((part) => decodeURIComponent(part)).join('/')
        if (!path.startsWith(`${ticketId}/`) || path.split('/').some((part) => part === '.' || part === '..')) continue
        paths.add(path)
      } catch {
        // Ignore malformed or external URLs; only known objects inside this ticket's folder are eligible.
      }
    }
  }
  return [...paths]
}

/** Removes only the attachment objects found in that ticket's own stored replies. */
export async function removeTicketAttachmentObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const config = readAdminConfig()
  if (!config.ok) {
    console.error('Supabase admin configuration refused:', config.problem)
    throw new SupabaseAdminError('Ticket management is not configured on the server.', 503, 'not_configured')
  }

  let response: Response
  try {
    response = await fetch(`${config.url}/storage/v1/object/ticket-attachments`, {
      method: 'DELETE',
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify({ prefixes: paths }),
    })
  } catch {
    throw new SupabaseAdminError('The ticket was deleted, but its stored attachments could not be cleaned up.', 502, 'storage_cleanup_failed')
  }
  if (!response.ok) {
    console.error('Supabase ticket attachment cleanup failed:', response.status)
    throw new SupabaseAdminError('The ticket was deleted, but its stored attachments could not be cleaned up.', 502, 'storage_cleanup_failed')
  }
}

/** Calls a PostgREST function with the service role. Only ever used with identities taken from the signed session. */
export async function callAdminRpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const config = readAdminConfig()
  if (!config.ok) {
    console.error('Supabase admin configuration refused:', config.problem)
    throw new SupabaseAdminError('Ticket management is not configured on the server.', 503, 'not_configured')
  }

  let response: Response
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
      },
      body: JSON.stringify(args),
    })
  } catch {
    console.error('Supabase admin RPC unreachable:', fn)
    throw new SupabaseAdminError('The database could not be reached. Please try again.', 502, 'unreachable')
  }

  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text) as unknown
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const body = data && typeof data === 'object' ? (data as { message?: unknown; code?: unknown }) : {}
    const detail = typeof body.message === 'string' ? body.message : undefined
    // PGRST202: the function does not exist (the database update has not been applied yet).
    if (response.status === 404 && body.code === 'PGRST202') {
      throw new SupabaseAdminError('The database function is not installed.', 404, 'function_missing')
    }
    // P0001 is a RAISE EXCEPTION from our own functions: its message is written for the user.
    if (body.code === 'P0001' && detail) throw new SupabaseAdminError(detail, 400, 'rejected')
    console.error('Supabase admin RPC failed:', fn, response.status, detail ?? 'no detail')
    throw new SupabaseAdminError('The change could not be saved. Please try again.', 502, 'failed')
  }
  return data
}
