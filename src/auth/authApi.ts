import type { User } from './users'

export interface Session {
  user: User
  signedInAt: string
}

export interface SessionState {
  csrfToken: string
  sessions: Session[]
  activeUserId: string | null
}

export type AuthResult = { ok: true; state: SessionState } | { ok: false; error: string; status: number }

const NETWORK_ERROR = 'Unable to reach the server. Check your connection and try again.'

let csrfToken: string | null = null

async function parse(response: Response): Promise<{ state?: SessionState; error?: string; code?: string }> {
  try {
    const data = (await response.json()) as Partial<SessionState> & { error?: string; code?: string }
    if (response.ok && Array.isArray(data.sessions) && typeof data.csrfToken === 'string') {
      return { state: data as SessionState }
    }
    return { error: data.error, code: data.code }
  } catch {
    return {}
  }
}

export async function fetchSession(): Promise<AuthResult> {
  try {
    const response = await fetch('/api/session', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    const { state, error } = await parse(response)
    if (!state) return { ok: false, error: error ?? 'Unable to verify your session.', status: response.status }
    csrfToken = state.csrfToken
    return { ok: true, state }
  } catch {
    return { ok: false, error: NETWORK_ERROR, status: 0 }
  }
}

export type TicketTypeAction =
  | { action: 'create'; label: string; description: string; config: Record<string, boolean> }
  | { action: 'update'; key: string; label: string; description: string; config: Record<string, boolean> }
  | { action: 'delete'; key: string }
  | { action: 'apply'; ticketId: string; typeKey: string }
  | { action: 'change'; ticketId: string; typeKey: string; reason: string }

/** Sends a ticket type mutation with the session cookie and CSRF token; the server decides who is acting. */
export async function postTicketTypeAction(body: TicketTypeAction): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!csrfToken) {
      const refreshed = await fetchSession()
      if (!refreshed.ok) throw new Error(refreshed.error)
    }
    let response: Response
    try {
      response = await fetch('/api/ticket-types', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrfToken ?? '' },
        body: JSON.stringify(body),
      })
    } catch {
      throw new Error(NETWORK_ERROR)
    }
    const data = (await response.json().catch(() => ({}))) as { data?: unknown; error?: string; code?: string }
    if (response.ok) return data.data
    if (data.code === 'csrf_invalid' && attempt === 0) {
      csrfToken = null
      continue
    }
    throw new Error(data.error ?? 'Something went wrong. Please try again.')
  }
  throw new Error('Something went wrong. Please try again.')
}

export async function postAuth(path: '/api/login' | '/api/logout' | '/api/switch', body: unknown): Promise<AuthResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!csrfToken) {
      const refreshed = await fetchSession()
      if (!refreshed.ok) return refreshed
    }
    try {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrfToken ?? '' },
        body: JSON.stringify(body),
      })
      const { state, error, code } = await parse(response)
      if (state) {
        csrfToken = state.csrfToken
        return { ok: true, state }
      }
      if (code === 'csrf_invalid' && attempt === 0) {
        csrfToken = null
        continue
      }
      return { ok: false, error: error ?? 'Something went wrong. Please try again.', status: response.status }
    } catch {
      return { ok: false, error: NETWORK_ERROR, status: 0 }
    }
  }
  return { ok: false, error: 'Something went wrong. Please try again.', status: 0 }
}
