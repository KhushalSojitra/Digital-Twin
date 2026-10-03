import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CssBaseline, ThemeProvider, type PaletteMode } from '@mui/material'
import { buildTheme } from './theme'

interface ThemeModeValue {
  mode: PaletteMode
  toggleMode: () => void
  setMode: (mode: PaletteMode) => void
}

const STORAGE_KEY = 'oomnieye.theme'

const ThemeModeContext = createContext<ThemeModeValue | null>(null)

function readInitialMode(): PaletteMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<PaletteMode>(readInitialMode)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', mode === 'dark' ? '#0B0D12' : '#F2F2F7')
  }, [mode])

  const theme = useMemo(() => buildTheme(mode), [mode])
  const value = useMemo<ThemeModeValue>(
    () => ({ mode, setMode, toggleMode: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')) }),
    [mode],
  )

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  )
}

export function useThemeMode() {
  const ctx = useContext(ThemeModeContext)
  if (!ctx) throw new Error('useThemeMode must be used within ThemeModeProvider')
  return ctx
}
