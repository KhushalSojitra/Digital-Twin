import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { fetchSession, postAuth, type AuthResult, type Session } from './authApi'
import type { User } from './users'

export type { Session }

interface AuthState {
  sessions: Session[]
  activeUserId: string | null
}

interface AuthValue extends AuthState {
  /** False until the first server session check completes. */
  ready: boolean
  currentUser: User | null
  login: (username: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>
  switchAccount: (userId: string) => void
  signOut: (userId?: string) => void
  signOutAll: () => void
}

const LEGACY_STORAGE_KEY = 'oomnieye.auth'
const EMPTY_STATE: AuthState = { sessions: [], activeUserId: null }

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(EMPTY_STATE)
  const [ready, setReady] = useState(false)
  const requestId = useRef(0)

  const apply = useCallback((result: AuthResult) => {
    if (result.ok) setState({ sessions: result.state.sessions, activeUserId: result.state.activeUserId })
    return result
  }, [])

  const refresh = useCallback(async () => {
    const id = ++requestId.current
    const result = await fetchSession()
    if (id === requestId.current && result.ok) apply(result)
    return result
  }, [apply])

  useEffect(() => {
    // Sessions used to be stored (and trusted) client-side; discard anything left over.
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // Storage may be unavailable; nothing to clean up.
    }
    void refresh().finally(() => setReady(true))
  }, [refresh])

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh])

  const login = useCallback<AuthValue['login']>(
    async (username, password) => {
      requestId.current += 1
      const result = apply(await postAuth('/api/login', { username, password }))
      return result.ok ? { ok: true } : { ok: false, error: result.error }
    },
    [apply],
  )

  const switchAccount = useCallback(
    (userId: string) => {
      setState((prev) => (prev.sessions.some((s) => s.user.id === userId) ? { ...prev, activeUserId: userId } : prev))
      requestId.current += 1
      void postAuth('/api/switch', { userId }).then((result) => (result.ok ? apply(result) : refresh()))
    },
    [apply, refresh],
  )

  const signOut = useCallback(
    (userId?: string) => {
      let target: string | null = null
      setState((prev) => {
        target = userId ?? prev.activeUserId
        const sessions = prev.sessions.filter((s) => s.user.id !== target)
        const activeUserId = prev.activeUserId === target ? (sessions.at(-1)?.user.id ?? null) : prev.activeUserId
        return { sessions, activeUserId }
      })
      requestId.current += 1
      void postAuth('/api/logout', userId ? { userId } : {}).then((result) => (result.ok ? apply(result) : refresh()))
    },
    [apply, refresh],
  )

  const signOutAll = useCallback(() => {
    setState(EMPTY_STATE)
    requestId.current += 1
    void postAuth('/api/logout', { all: true }).then((result) => (result.ok ? apply(result) : refresh()))
  }, [apply, refresh])

  const value = useMemo<AuthValue>(() => {
    const currentUser = state.sessions.find((s) => s.user.id === state.activeUserId)?.user ?? null
    return { ...state, ready, currentUser, login, switchAccount, signOut, signOutAll }
  }, [state, ready, login, switchAccount, signOut, signOutAll])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
