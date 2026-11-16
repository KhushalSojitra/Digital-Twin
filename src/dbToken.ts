interface CachedToken {
  token: string
  expiresAt: number
}

const REFRESH_MARGIN_MS = 60_000

let cached: CachedToken | null = null
let inflight: Promise<string | null> | null = null
let lastFailure: string | null = null

async function requestToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/db-token', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    if (!response.ok) {
      const failure = (await response.json().catch(() => ({}))) as { error?: unknown }
      lastFailure = typeof failure.error === 'string' ? failure.error : `Database access was refused (${response.status}).`
      return null
    }
    const body = (await response.json()) as { data?: { token?: unknown; expiresAt?: unknown } }
    const token = body.data?.token
    const expiresAt = body.data?.expiresAt
    if (typeof token !== 'string' || typeof expiresAt !== 'number') {
      lastFailure = 'The server returned an unreadable database access token.'
      return null
    }
    cached = { token, expiresAt }
    lastFailure = null
    return token
  } catch {
    lastFailure = 'The server could not be reached to authorise database access.'
    return null
  }
}

/** Why the most recent token request failed, or null when it succeeded. */
export function getDbTokenFailure(): string | null {
  return lastFailure
}

/** Short-lived read-only database token for the signed-in user, or null when signed out. Shared across callers. */
export function getDbToken(): Promise<string | null> {
  if (cached && cached.expiresAt - Date.now() > REFRESH_MARGIN_MS) return Promise.resolve(cached.token)
  inflight ??= requestToken().finally(() => {
    inflight = null
  })
  return inflight
}

/** Forget the token when the signed-in user changes so the next read uses the new session. */
export function clearDbToken(): void {
  cached = null
}
