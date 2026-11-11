import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthContext'

/**
 * Per-user interface preferences (ticket view, preview, pin size, Ticket Management layout...).
 * They live in the `user_preferences` table keyed by the signed-in user, so the same experience
 * follows that user to any browser or device.
 */
const SAVE_DELAY_MS = 400

type PreferenceValues = Record<string, unknown>

interface PreferencesValue {
  values: PreferenceValues
  set: (key: string, value: unknown) => void
}

const PreferencesContext = createContext<PreferencesValue | null>(null)

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth()
  const me = currentUser?.displayName ?? null
  const [state, setState] = useState<{ user: string; values: PreferenceValues } | null>(null)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    if (!me) {
      setState(null)
      return
    }
    let active = true
    const load = async () => {
      const { data, error } = await supabase.from('user_preferences').select('key, value').eq('user_name', me)
      if (error) {
        console.error('Unable to load preferences:', error.message)
        return
      }
      if (!active) return
      const loaded: PreferenceValues = {}
      for (const row of data ?? []) loaded[String(row.key)] = row.value
      // Anything the user changed while this was loading wins over the stored value.
      setState((prev) => ({ user: me, values: { ...loaded, ...(prev?.user === me ? prev.values : {}) } }))
    }
    void load()
    return () => {
      active = false
    }
  }, [me])

  const set = useCallback(
    (key: string, value: unknown) => {
      if (!me) return
      setState((prev) => ({ user: me, values: { ...(prev?.user === me ? prev.values : {}), [key]: value } }))
      const timerKey = `${me}:${key}`
      clearTimeout(timers.current[timerKey])
      timers.current[timerKey] = setTimeout(() => {
        void supabase
          .from('user_preferences')
          .upsert({ user_name: me, key, value, updated_at: new Date().toISOString() }, { onConflict: 'user_name,key' })
          .then(({ error }) => {
            if (error) console.error(`Unable to save preference ${key}:`, error.message)
          })
      }, SAVE_DELAY_MS)
    },
    [me],
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
