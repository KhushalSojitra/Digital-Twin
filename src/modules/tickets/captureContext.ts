import { createContext, useContext } from 'react'
import type { Direction } from '../earth/panoramaMath'
import type { SnapshotTreatment } from './snapshotRenderer'

export interface CaptureOptions {
  /** Vertical field of view of the frame; defaults to a tight incident crop. */
  fov?: number
  /** Locations drawn as pins on the frame. */
  marks?: Direction[]
}

/** Grabs a still frame from the live camera covering `dir`, or null when that camera is not open. */
export type CaptureFn = (
  cameraId: string,
  dir: Direction,
  treatment: SnapshotTreatment,
  options?: CaptureOptions,
) => string | null

export const CaptureContext = createContext<CaptureFn | null>(null)

export function useCapture() {
  return useContext(CaptureContext)
}
