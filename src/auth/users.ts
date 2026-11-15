export type Role = 'Administrator' | 'Operator' | 'Viewer'

export interface User {
  id: string
  username: string
  displayName: string
  role: Role
  email: string
  avatarColor: string
}

// Display-only directory. Credentials live on the server (see /api) and are never shipped to the browser.
export const DEMO_USERS: User[] = [
  {
    id: 'u-admin',
    username: 'admin',
    displayName: 'Ava Sharma',
    role: 'Administrator',
    email: 'ava.sharma@oomnieye.io',
    avatarColor: '#0A84FF',
  },
  {
    id: 'u-operator',
    username: 'operator',
    displayName: 'Michael Reed',
    role: 'Operator',
    email: 'michael.reed@oomnieye.io',
    avatarColor: '#30D158',
  },
  {
    id: 'u-viewer',
    username: 'viewer',
    displayName: 'Sarah Wilson',
    role: 'Viewer',
    email: 'sarah.wilson@oomnieye.io',
    avatarColor: '#FF9F0A',
  },
]

export const DEMO_ACCOUNTS = DEMO_USERS.map(({ username, role }) => ({ username, role }))
