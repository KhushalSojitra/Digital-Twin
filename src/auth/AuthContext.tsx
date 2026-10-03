import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { authenticate, type User } from './users'

export interface Session {
  user: User
  signedInAt: string
}

interface AuthState {
  sessions: Session[]
  activeUserId: string | null
}

interface AuthValue extends AuthState {
  currentUser: User | null
  login: (username: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>
  switchAccount: (userId: string) => void
  signOut: (userId?: string) => void
  signOutAll: () => void
}

const STORAGE_KEY = 'oomnieye.auth'

const AuthContext = createContext<AuthValue | null>(null)

function readState(): AuthState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { sessions: [], activeUserId: null }
    const parsed = JSON.parse(raw) as AuthState
    if (!Array.isArray(parsed.sessions)) return { sessions: [], activeUserId: null }
    return parsed
  } catch {
    return { sessions: [], activeUserId: null }
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(readState)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const login = useCallback<AuthValue['login']>(async (username, password) => {
    // Simulated network round-trip so the sign-in button shows real feedback.
    await new Promise((r) => setTimeout(r, 650))
    const user = authenticate(username, password)
    if (!user) return { ok: false, error: 'Incorrect username or password.' }
    setState((prev) => {
      const others = prev.sessions.filter((s) => s.user.id !== user.id)
      return {
        sessions: [...others, { user, signedInAt: new Date().toISOString() }],
        activeUserId: user.id,
      }
    })
    return { ok: true }
  }, [])

  const switchAccount = useCallback((userId: string) => {
    setState((prev) => (prev.sessions.some((s) => s.user.id === userId) ? { ...prev, activeUserId: userId } : prev))
  }, [])

  const signOut = useCallback((userId?: string) => {
    setState((prev) => {
      const target = userId ?? prev.activeUserId
      const sessions = prev.sessions.filter((s) => s.user.id !== target)
      const activeUserId = prev.activeUserId === target ? (sessions.at(-1)?.user.id ?? null) : prev.activeUserId
      return { sessions, activeUserId }
    })
  }, [])

  const signOutAll = useCallback(() => setState({ sessions: [], activeUserId: null }), [])

  const value = useMemo<AuthValue>(() => {
    const currentUser = state.sessions.find((s) => s.user.id === state.activeUserId)?.user ?? null
    return { ...state, currentUser, login, switchAccount, signOut, signOutAll }
  }, [state, login, switchAccount, signOut, signOutAll])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
