import { callAdminRpc, readAdminConfig } from './supabaseAdmin.js'

export type Role = 'Administrator' | 'Operator' | 'Viewer'

export interface PublicUser {
  id: string
  username: string
  displayName: string
  role: Role
  email: string
  avatarColor: string
  team: string | null
  /** Id of this user's manager; null for the top of the hierarchy. */
  reportsTo: string | null
}

interface UserRow {
  id: string
  username: string
  display_name: string
  role: Role
  team: string | null
  reports_to: string | null
  email: string | null
  avatar_color: string | null
}

const USERS_TTL_MS = 30_000
const REQUEST_TIMEOUT_MS = 15_000

let cache: { at: number; users: PublicUser[] } | null = null

function toPublic(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    email: row.email ?? '',
    avatarColor: row.avatar_color ?? '#0A84FF',
    team: row.team,
    reportsTo: row.reports_to,
  }
}

/**
 * Loads the active user directory from public.app_users (service role; the password hash is never selected).
 * Cached briefly per function instance. Throws when the database cannot be reached and nothing is cached.
 */
export async function loadUsers(force = false): Promise<PublicUser[]> {
  const now = Date.now()
  if (!force && cache && now - cache.at < USERS_TTL_MS) return cache.users
  const config = readAdminConfig()
  if (!config.ok) {
    if (cache) return cache.users
    throw new Error(`User directory unavailable: ${config.problem}`)
  }
  const endpoint = new URL('/rest/v1/app_users', config.url)
  endpoint.searchParams.set('select', 'id,username,display_name,role,team,reports_to,email,avatar_color')
  endpoint.searchParams.set('active', 'eq.true')
  endpoint.searchParams.set('order', 'created_at.asc')
  try {
    const response = await fetch(endpoint, {
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { Accept: 'application/json', apikey: config.key, Authorization: `Bearer ${config.key}` },
    })
    if (!response.ok) throw new Error(`status ${response.status}`)
    const rows = (await response.json()) as UserRow[]
    cache = { at: now, users: rows.map(toPublic) }
    return cache.users
  } catch (error) {
    if (cache) return cache.users
    throw new Error(`User directory unavailable: ${error instanceof Error ? error.message : 'unknown error'}`)
  }
}

/** Synchronous lookup against the directory loaded for this request (see route()). */
export function getPublicUser(id: string): PublicUser | null {
  return cache?.users.find((u) => u.id === id) ?? null
}

export function listUsers(): PublicUser[] {
  return cache?.users ?? []
}

/**
 * Turns whatever the browser sent for a person (id, display name or username) into the stored user id.
 * 'Unassigned' stays as is; anything unknown is returned unchanged so the database can reject it.
 */
export function resolveUserRef(value: string): string {
  const needle = value.trim()
  if (!needle || needle.toLowerCase() === 'unassigned') return needle
  const lower = needle.toLowerCase()
  const user = listUsers().find((u) => u.id === needle || u.displayName.toLowerCase() === lower || u.username === lower)
  return user ? user.id : needle
}

/** Checks a password in the database (bcrypt via pgcrypto). Returns the user, or null for any failure. */
export async function verifyPassword(username: string, password: string): Promise<PublicUser | null> {
  try {
    const rows = (await callAdminRpc('verify_app_user_password', { p_username: username, p_password: password })) as UserRow[] | null
    return Array.isArray(rows) && rows.length === 1 ? toPublic(rows[0]) : null
  } catch (error) {
    console.error('Password check failed:', error instanceof Error ? error.message : 'unknown error')
    return null
  }
}

const MIN_SECRET_LENGTH = 32

export function getSessionSecret(): string | null {
  const value = process.env.AUTH_SESSION_SECRET
  return value && value.length >= MIN_SECRET_LENGTH ? value : null
}

const DEFAULT_TTL_HOURS = 12
const MAX_TTL_HOURS = 168

export function getSessionTtlMs(): number {
  const hours = Number(process.env.AUTH_SESSION_TTL_HOURS)
  const clamped = Number.isFinite(hours) && hours > 0 ? Math.min(hours, MAX_TTL_HOURS) : DEFAULT_TTL_HOURS
  return Math.round(clamped * 60 * 60 * 1000)
}
