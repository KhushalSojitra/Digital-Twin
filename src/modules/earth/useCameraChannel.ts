import { useCallback, useEffect, useRef, useState } from 'react'
import type { View } from './panoramaMath'

/**
 * Lifecycle of a command sent to a camera head:
 * idle → sending (awaiting acknowledgement) → moving (head in motion) → reached → idle
 */
export type CommandPhase = 'idle' | 'sending' | 'moving' | 'reached'

type Updater = (view: View) => View

interface Options {
  /** Simulated round-trip before the head acknowledges a discrete command. */
  latencyMs: number
}

export function useCameraChannel(initial: View, { latencyMs }: Options) {
  const [target, setTarget] = useState<View>(initial)
  const [actual, setActual] = useState<View>(initial)
  const [phase, setPhaseState] = useState<CommandPhase>('idle')
  const phaseRef = useRef<CommandPhase>('idle')
  const queueRef = useRef<Updater[]>([])
  const ackTimer = useRef<number | null>(null)
  const reachedTimer = useRef<number | null>(null)

  const setPhase = useCallback((next: CommandPhase) => {
    phaseRef.current = next
    setPhaseState(next)
  }, [])

  useEffect(
    () => () => {
      if (ackTimer.current) window.clearTimeout(ackTimer.current)
      if (reachedTimer.current) window.clearTimeout(reachedTimer.current)
    },
    [],
  )

  /** Discrete or repeated command: the first press waits for acknowledgement, follow-ups stream straight through. */
  const command = useCallback(
    (updater: Updater) => {
      if (reachedTimer.current) {
        window.clearTimeout(reachedTimer.current)
        reachedTimer.current = null
      }
      const current = phaseRef.current
      if (current === 'moving') {
        setTarget((v) => updater(v))
        return
      }
      if (current === 'sending') {
        queueRef.current.push(updater)
        return
      }
      queueRef.current = [updater]
      setPhase('sending')
      ackTimer.current = window.setTimeout(() => {
        ackTimer.current = null
        const batch = queueRef.current
        queueRef.current = []
        setTarget((v) => batch.reduce((acc, fn) => fn(acc), v))
        setPhase('moving')
      }, latencyMs)
    },
    [latencyMs, setPhase],
  )

  /** Direct manipulation (drag / wheel) that needs no acknowledgement round-trip. */
  const steer = useCallback((view: View) => setTarget(view), [])

  const onSettled = useCallback(() => {
    if (phaseRef.current !== 'moving') return
    setPhase('reached')
    reachedTimer.current = window.setTimeout(() => {
      reachedTimer.current = null
      setPhase('idle')
    }, 1400)
  }, [setPhase])

  return { target, actual, setActual, phase, command, steer, onSettled }
}

export type CameraChannel = ReturnType<typeof useCameraChannel>
