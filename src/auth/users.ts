export type Role = 'Administrator' | 'Operator' | 'Viewer'

export interface User {
  id: string
  username: string
  displayName: string
  role: Role
  email: string
  avatarColor: string
  team?: string | null
  /** Id of this user's manager; null for the top of the hierarchy. */
  reportsTo?: string | null
  phone?: string | null
  /** https URL of the profile picture; initials are shown when empty. */
  avatarUrl?: string | null
}

/**
 * Live user directory (public.app_users), sent by the server with the session. Arrays are replaced in place,
 * so modules that imported them keep seeing the current list. Credentials never reach the browser.
 */
export const DIRECTORY: User[] = []
/** Display names of every active user, in directory order: pickers, filters and @mentions use this. */
export const PEOPLE_NAMES: string[] = []

export function setDirectory(users: User[]): void {
  DIRECTORY.splice(0, DIRECTORY.length, ...users)
  PEOPLE_NAMES.splice(0, PEOPLE_NAMES.length, ...users.map((u) => u.displayName))
}

/** Display name for a stored user id; anything else (e.g. 'Unassigned', 'System') is returned unchanged. */
export function userName(ref: string): string {
  return DIRECTORY.find((u) => u.id === ref)?.displayName ?? ref
}

export function userByName(name: string): User | undefined {
  return DIRECTORY.find((u) => u.displayName === name)
}

/** The manager of a user given by display name, or null for the top of the hierarchy. */
export function managerName(name: string): string | null {
  const user = userByName(name)
  if (!user?.reportsTo) return null
  return DIRECTORY.find((u) => u.id === user.reportsTo)?.displayName ?? null
}

/** Kept for the admin user list. */
export const DEMO_USERS = DIRECTORY

/** Demo sign-in accounts shown on the login page (before any directory is loaded). */
export const DEMO_ACCOUNTS: { username: string; role: Role }[] = [
  { username: 'director', role: 'Administrator' },
  { username: 'ava', role: 'Administrator' },
  { username: 'michael', role: 'Operator' },
  { username: 'sarah', role: 'Viewer' },
  { username: 'general2', role: 'Operator' },
  { username: 'finance1', role: 'Operator' },
  { username: 'finance2', role: 'Operator' },
]
