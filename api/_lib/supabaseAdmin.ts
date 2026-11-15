export class SupabaseAdminError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

interface AdminConfig {
  url: string
  key: string
}

/**
 * Server-only credentials for the Supabase project that owns public.tickets. They are deliberately
 * separate from the VITE_* variables, which are shipped to the browser.
 */
function getAdminConfig(): AdminConfig | null {
  const url = process.env.APP_SUPABASE_URL?.trim().replace(/\/+$/, '')
  const key = process.env.APP_SUPABASE_SERVICE_ROLE_KEY?.trim()
  return url && key ? { url, key } : null
}

export function isAdminConfigured(): boolean {
  return getAdminConfig() !== null
}

/** Calls a PostgREST function with the service role. Only ever used with identities taken from the signed session. */
export async function callAdminRpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const config = getAdminConfig()
  if (!config) throw new SupabaseAdminError('Ticket type management is not configured on the server.', 503)

  const response = await fetch(`${config.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
    },
    body: JSON.stringify(args),
  })

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
    const detail = data && typeof data === 'object' ? (data as { message?: unknown }).message : undefined
    // P0001 is a RAISE EXCEPTION from our own functions: its message is written for the user.
    const code = data && typeof data === 'object' ? (data as { code?: unknown }).code : undefined
    if (code === 'P0001' && typeof detail === 'string') throw new SupabaseAdminError(detail, 400)
    console.error('Supabase admin RPC failed:', fn, response.status, typeof detail === 'string' ? detail : 'no detail')
    throw new SupabaseAdminError('The change could not be saved. Please try again.', 502)
  }
  return data
}
