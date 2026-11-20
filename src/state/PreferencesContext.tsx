import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../supabaseClient'
import { getDbToken, getDbTokenFailure } from '../dbToken'
import { useAuth } from '../auth/AuthContext'

/**
 * Per-user interface preferences (ticket view, preview, pin size, Ticket Management layout...).
 * They live in the `user_preferences` table keyed by the signed-in user, so the same experience
 * follows that user to any browser or device and is restored on every sign-in.
 */
const SAVE_DELAY_MS = 400

type PreferenceValues = Record<string, unknown>

interface PendingSave {
  user: string
  key: string
  value: unknown
}

interface PreferencesValue {
  values: PreferenceValues
  set: (key: string, value: unknown) => void
}

const PreferencesContext = createContext<PreferencesValue | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth()
  const me = currentUser?.id ?? null
  const [state, setState] = useState<{ user: string; values: PreferenceValues } | null>(null)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pending = useRef<Record<string, PendingSave>>({})
  const loadedFor = useRef<string | null>(null)

  const saveNow = useCallback((timerKey: string) => {
    clearTimeout(timers.current[timerKey])
    delete timers.current[timerKey]
    const entry = pending.current[timerKey]
    if (!entry) return
    delete pending.current[timerKey]
    void supabase
      .from('user_preferences')
      .upsert(
        { user_name: entry.user, key: entry.key, value: entry.value, updated_at: new Date().toISOString() },
        { onConflict: 'user_name,key' },
      )
      .then(({ error }) => {
        if (!error) return
        console.error(`Unable to save preference ${entry.key}:`, error.message)
        // Keep the change so the next flush retries it, unless the user has since changed it again.
        if (!pending.current[timerKey]) pending.current[timerKey] = entry
      })
  }, [])

  /** Sends every change still waiting out its delay, so nothing is lost when the user leaves. */
  const flushAll = useCallback(() => {
    for (const timerKey of Object.keys(pending.current)) saveNow(timerKey)
  }, [saveNow])

  const load = useCallback(async (user: string, isCurrent: () => boolean) => {
    // Without a token the request would run as an anonymous visitor and return nothing, which must not
    // be mistaken for "this user has no saved preferences".
    const token = await getDbToken()
    if (!token) {
      console.error('Unable to load preferences:', getDbTokenFailure() ?? 'database access could not be authorised.')
      return
    }
    const { data, error } = await supabase.from('user_preferences').select('key, value').eq('user_name', user)
    if (error) {
      console.error('Unable to load preferences:', error.message)
      return
    }
    if (!isCurrent()) return
    const loaded: PreferenceValues = {}
    for (const row of data ?? []) loaded[String(row.key)] = row.value
    loadedFor.current = user
    // Anything the user changed while this was loading wins over the stored value.
    setState((prev) => ({ user, values: { ...loaded, ...(prev?.user === user ? prev.values : {}) } }))
  }, [])

  useEffect(() => {
    if (!me) {
      loadedFor.current = null
      setState(null)
      return
    }
    let active = true
    void load(me, () => active)
    return () => {
      active = false
      // Runs on sign-out and account switch while the previous user's token is still valid.
      flushAll()
      loadedFor.current = null
    }
  }, [me, load, flushAll])

  useEffect(() => {
    if (!me) return
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushAll()
        return
      }
      // Retry a load that failed earlier (for example a token that could not be issued yet).
      if (loadedFor.current !== me) void load(me, () => loadedFor.current !== me)
    }
    const onPageHide = () => flushAll()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [me, load, flushAll])

  const set = useCallback(
    (key: string, value: unknown) => {
      if (!me) return
      setState((prev) => ({ user: me, values: { ...(prev?.user === me ? prev.values : {}), [key]: value } }))
      const timerKey = `${me}:${key}`
      clearTimeout(timers.current[timerKey])
      pending.current[timerKey] = { user: me, key, value }
      timers.current[timerKey] = setTimeout(() => saveNow(timerKey), SAVE_DELAY_MS)
    },
    [me, saveNow],
  )

  const values = state?.user === me && state ? state.values : EMPTY
  const value = useMemo(() => ({ values, set }), [values, set])
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

const EMPTY: PreferenceValues = {}

/** useState backed by the signed-in user's stored preferences; invalid or missing values fall back. */
export function usePreference<T>(key: string, fallback: T, isValid: (value: T) => boolean) {
  const ctx = useContext(PreferencesContext)
  if (!ctx) throw new Error('usePreference must be used within PreferencesProvider')
  const { values, set } = ctx
  const raw = values[key]
  const value = raw !== undefined && isValid(raw as T) ? (raw as T) : fallback
  const valueRef = useRef(value)
  valueRef.current = value
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      set(key, typeof next === 'function' ? (next as (prev: T) => T)(valueRef.current) : next)
    },
    [key, set],
  )
  return [value, update] as const
}
