export type Role = 'Administrator' | 'Operator' | 'Viewer'

export interface PublicUser {
  id: string
  username: string
  displayName: string
  role: Role
  email: string
  avatarColor: string
}

interface Account extends PublicUser {
  passwordEnv: string
}

// Profile data is not secret. Passwords are only ever read from environment variables.
const ACCOUNTS: readonly Account[] = [
  {
    id: 'u-admin',
    username: 'admin',
    displayName: 'Ava Sharma',
    role: 'Administrator',
    email: 'ava.sharma@oomnieye.io',
    avatarColor: '#0A84FF',
    passwordEnv: 'AUTH_ADMIN_PASSWORD',
  },
  {
    id: 'u-operator',
    username: 'operator',
    displayName: 'Michael Reed',
    role: 'Operator',
    email: 'michael.reed@oomnieye.io',
    avatarColor: '#30D158',
    passwordEnv: 'AUTH_OPERATOR_PASSWORD',
  },
  {
    id: 'u-viewer',
    username: 'viewer',
    displayName: 'Sarah Wilson',
    role: 'Viewer',
    email: 'sarah.wilson@oomnieye.io',
    avatarColor: '#FF9F0A',
    passwordEnv: 'AUTH_VIEWER_PASSWORD',
  },
]

function toPublic({ passwordEnv: _passwordEnv, ...user }: Account): PublicUser {
  return user
}

export function findAccountByUsername(username: string): Account | undefined {
  const needle = username.trim().toLowerCase()
  return ACCOUNTS.find((a) => a.username === needle)
}

export function getPublicUser(id: string): PublicUser | null {
  const account = ACCOUNTS.find((a) => a.id === id)
  return account ? toPublic(account) : null
}

export function toPublicUser(account: Account): PublicUser {
  return toPublic(account)
}

export function getAccountPassword(account: Account): string | null {
  const value = process.env[account.passwordEnv]
  return value ? value : null
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
