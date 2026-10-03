export type Role = 'Administrator' | 'Operator' | 'Viewer'

export interface User {
  id: string
  username: string
  displayName: string
  role: Role
  email: string
  avatarColor: string
}

interface Credential extends User {
  password: string
}

const DIRECTORY: Credential[] = [
  {
    id: 'u-admin',
    username: 'admin',
    password: 'Admin@123',
    displayName: 'Ava Sharma',
    role: 'Administrator',
    email: 'ava.sharma@oomnieye.io',
    avatarColor: '#0A84FF',
  },
  {
    id: 'u-operator',
    username: 'operator',
    password: 'Operator@123',
    displayName: 'Michael Reed',
    role: 'Operator',
    email: 'michael.reed@oomnieye.io',
    avatarColor: '#30D158',
  },
  {
    id: 'u-viewer',
    username: 'viewer',
    password: 'Viewer@123',
    displayName: 'Sarah Wilson',
    role: 'Viewer',
    email: 'sarah.wilson@oomnieye.io',
    avatarColor: '#FF9F0A',
  },
]

export const DEMO_ACCOUNTS = DIRECTORY.map(({ username, password, role }) => ({ username, password, role }))

export const DEMO_USERS: User[] = DIRECTORY.map(({ password: _password, ...user }) => user)

export function authenticate(username: string, password: string): User | null {
  const match = DIRECTORY.find((u) => u.username.toLowerCase() === username.trim().toLowerCase() && u.password === password)
  if (!match) return null
  const { password: _pw, ...user } = match
  return user
}
