import { Buffer } from 'buffer'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { getPublicUser } from './config.js'

export interface SessionEntry {
  /** user id */
  u: string
  /** issued at (ms) */
  iat: number
  /** expires at (ms) */
  exp: number
}

export interface SessionPayload {
  v: 1
  /** active user id */
  a: string | null
  s: SessionEntry[]
}

export const EMPTY_PAYLOAD: SessionPayload = { v: 1, a: null, s: [] }

function mac(secret: string, purpose: string, value: string): Buffer {
  return createHmac('sha256', secret).update(`${purpose}.${value}`).digest()
}

function equalBuffers(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}

export function safeEqualStrings(a: string, b: string): boolean {
  const left = createHmac('sha256', 'compare').update(a).digest()
  const right = createHmac('sha256', 'compare').update(b).digest()
  return timingSafeEqual(left, right)
}

export function signSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${body}.${mac(secret, 'session', body).toString('base64url')}`
}

function isEntry(value: unknown): value is SessionEntry {
  if (!value || typeof value !== 'object') return false
  const e = value as Record<string, unknown>
  return typeof e.u === 'string' && typeof e.iat === 'number' && typeof e.exp === 'number'
}

/** Drops expired entries, unknown users and duplicates, and repairs the active account. */
export function normalizeSession(payload: SessionPayload, now: number): SessionPayload {
  const seen = new Set<string>()
  const sessions: SessionEntry[] = []
  for (const entry of payload.s) {
    if (entry.exp <= now || seen.has(entry.u) || !getPublicUser(entry.u)) continue
    seen.add(entry.u)
    sessions.push(entry)
  }
  const active = payload.a && seen.has(payload.a) ? payload.a : (sessions.at(-1)?.u ?? null)
  return { v: 1, a: active, s: sessions }
}

export function verifySession(token: string | undefined, secret: string, now: number): SessionPayload {
  if (!token) return EMPTY_PAYLOAD
  const [body, signature, ...rest] = token.split('.')
  if (!body || !signature || rest.length > 0) return EMPTY_PAYLOAD
  let provided: Buffer
  try {
    provided = Buffer.from(signature, 'base64url')
  } catch {
    return EMPTY_PAYLOAD
  }
  if (!equalBuffers(provided, mac(secret, 'session', body))) return EMPTY_PAYLOAD
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<SessionPayload>
    if (parsed.v !== 1 || !Array.isArray(parsed.s) || !parsed.s.every(isEntry)) return EMPTY_PAYLOAD
    return normalizeSession({ v: 1, a: typeof parsed.a === 'string' ? parsed.a : null, s: parsed.s }, now)
  } catch {
    return EMPTY_PAYLOAD
  }
}

export function createCsrfToken(secret: string): string {
  const nonce = randomBytes(24).toString('base64url')
  return `${nonce}.${mac(secret, 'csrf', nonce).toString('base64url')}`
}

export function isValidCsrfToken(token: string | undefined, secret: string): token is string {
  if (!token) return false
  const [nonce, signature, ...rest] = token.split('.')
  if (!nonce || !signature || rest.length > 0) return false
  try {
    return equalBuffers(Buffer.from(signature, 'base64url'), mac(secret, 'csrf', nonce))
  } catch {
    return false
  }
}
