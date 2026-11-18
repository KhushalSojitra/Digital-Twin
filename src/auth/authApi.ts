import { clearDbToken } from '../dbToken'
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
  | { action: 'change'; ticketId: string; typeKey: string; reason: string }
  | { action: 'workflow'; ticketId: string; actionId: string; assignee?: string | null; note?: string | null }
  | { action: 'history'; ticketId: string }
  | { action: 'status' }

export interface TicketTypeServerStatus {
  configured: boolean
  projectRef: string | null
  problem: string | null
  migrated: boolean
  revision: number | null
}

export type TicketAction =
  | { action: 'create'; typeKey: string; ticket: Record<string, unknown> }
  | { action: 'details'; ticketId: string; title: string; description: string; priority: string; additional: unknown; creationSnapshot: unknown }
  | { action: 'comment'; ticketId: string; text: string; attachments: unknown[]; commentId?: string; replyTo?: string }
  | { action: 'followers'; ticketId: string; op: 'toggle' | 'add' | 'remove' | 'share'; people: string[] }
  | { action: 'snapshot'; ticketId: string; slot: 'before' | 'after'; snapshot: unknown }
  | { action: 'delete'; ticketId: string }

/** Sends a ticket type mutation with the session cookie and CSRF token; the server decides who is acting. */
export function postTicketTypeAction(body: TicketTypeAction): Promise<unknown> {
  return postSigned('/api/ticket-types', body)
}

/** Sends a ticket change (create, edit, comment, watchers, snapshot, delete); the server decides who is acting. */
export function postTicketAction(body: TicketAction): Promise<unknown> {
  return postSigned('/api/tickets', body)
}

async function postSigned(path: '/api/ticket-types' | '/api/tickets', body: unknown): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!csrfToken) {
      const refreshed = await fetchSession()
      if (!refreshed.ok) throw new Error(refreshed.error)
    }
    let response: Response
    try {
      response = await fetch(path, {
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
        clearDbToken()
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
