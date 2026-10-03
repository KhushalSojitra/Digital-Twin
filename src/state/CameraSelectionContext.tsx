import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { getSelection, type CameraSelection } from '../data/cameras'

interface CameraSelectionValue {
  selectionId: string | null
  selection: CameraSelection | null
  select: (id: string | null) => void
}

const CameraSelectionContext = createContext<CameraSelectionValue | null>(null)

export function CameraSelectionProvider({ children }: { children: ReactNode }) {
  const [selectionId, setSelectionId] = useState<string | null>(null)
  const value = useMemo<CameraSelectionValue>(
    () => ({ selectionId, selection: getSelection(selectionId), select: setSelectionId }),
    [selectionId],
  )
  return <CameraSelectionContext.Provider value={value}>{children}</CameraSelectionContext.Provider>
}

export function useCameraSelection() {
  const ctx = useContext(CameraSelectionContext)
  if (!ctx) throw new Error('useCameraSelection must be used within CameraSelectionProvider')
  return ctx
}
