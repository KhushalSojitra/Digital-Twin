import { createContext, useContext } from 'react'
import type { Direction } from '../earth/panoramaMath'
import type { SnapshotTreatment } from './snapshotRenderer'

/** Grabs a still frame from the live camera covering `dir`, or null when no camera is open. */
export type CaptureFn = (cameraId: string, dir: Direction, treatment: SnapshotTreatment) => string | null

export const CaptureContext = createContext<CaptureFn | null>(null)

export function useCapture() {
  return useContext(CaptureContext)
}
