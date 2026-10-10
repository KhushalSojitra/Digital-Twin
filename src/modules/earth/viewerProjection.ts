import { createContext, useContext, useEffect } from 'react'
import type { SnapshotTreatment } from '../tickets/snapshotRenderer'
import type { Direction } from './panoramaMath'

export interface ProjectedPoint {
  x: number
  y: number
  /** False when the direction is behind the camera or far outside the frame. */
  visible: boolean
}

export type Projector = (dir: Direction) => ProjectedPoint
export type FrameListener = (project: Projector, size: { width: number; height: number }) => void

export interface ViewerApi {
  /**
   * Renders the live scene at `dir` and returns a JPEG data URL of that frame. Any `marks` are drawn
   * as pins on the frame, and the field of view widens as needed so every mark stays inside it.
   */
  captureAt: (dir: Direction, fov?: number, treatment?: SnapshotTreatment, marks?: Direction[]) => string | null
}

export interface ProjectionHub {
  subscribe: (listener: FrameListener) => () => void
  /** Ask the viewer to render (and re-project) once even if the camera has not moved. */
  requestFrame: () => void
}

export const ProjectionContext = createContext<ProjectionHub | null>(null)

/** Runs `listener` after every rendered frame of the enclosing PanoramaViewer with a projector for that frame. */
export function useViewerFrame(listener: FrameListener) {
  const hub = useContext(ProjectionContext)
  useEffect(() => {
    if (!hub) return
    return hub.subscribe(listener)
  }, [hub, listener])
  return hub
}
