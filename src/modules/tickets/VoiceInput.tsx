import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, IconButton, Tooltip, Typography, type SxProps, type Theme } from '@mui/material'
import { keyframes } from '@mui/material/styles'
import { Mic } from 'lucide-react'
import { ICON_SIZE, ICON_STROKE, TOOLTIP_DELAY } from './TicketIndicators'

/** PROTOTYPE MOCK: no audio is captured and nothing is transcribed. */
export const MOCK_TRANSCRIPT =
  "The water pipe valve near the east wall is leaking. I have shut both sides. Need a replacement valve before tomorrow's shift."

const LISTENING_MS = 2500
const TRANSCRIBING_MS = 800
const TYPE_INTERVAL_MS = 20

export type VoicePhase = 'idle' | 'listening' | 'transcribing' | 'typing'

export interface MockVoiceInput {
  phase: VoicePhase
  toggle: () => void
  cancel: () => void
}

/** Fakes dictation: listen, transcribe, then type the canned transcript into the field. */
export function useMockVoiceInput(
  value: string,
  onChange: (next: string) => void,
  { disabled = false, maxLength = 2000 }: { disabled?: boolean; maxLength?: number } = {},
): MockVoiceInput {
  const [phase, setPhase] = useState<VoicePhase>('idle')
  const valueRef = useRef(value)
  const changeRef = useRef(onChange)
  const timers = useRef<{ timeout?: number; interval?: number }>({})

  useEffect(() => {
    valueRef.current = value
    changeRef.current = onChange
  })

  const clear = useCallback(() => {
    window.clearTimeout(timers.current.timeout)
    window.clearInterval(timers.current.interval)
  }, [])

  const cancel = useCallback(() => {
    clear()
    setPhase('idle')
  }, [clear])

  const typeTranscript = useCallback(() => {
    const base = valueRef.current
    const prefix = base && !/\s$/.test(base) ? `${base} ` : base
    let length = 0
    setPhase('typing')
    timers.current.interval = window.setInterval(() => {
      length += 1
      changeRef.current((prefix + MOCK_TRANSCRIPT.slice(0, length)).slice(0, maxLength))
      if (length >= MOCK_TRANSCRIPT.length) {
        window.clearInterval(timers.current.interval)
        setPhase('idle')
      }
    }, TYPE_INTERVAL_MS)
  }, [maxLength])

  const start = useCallback(() => {
    setPhase('listening')
    timers.current.timeout = window.setTimeout(() => {
      setPhase('transcribing')
      timers.current.timeout = window.setTimeout(typeTranscript, TRANSCRIBING_MS)
    }, LISTENING_MS)
  }, [typeTranscript])

  useEffect(() => clear, [clear])

  useEffect(() => {
    if (disabled && phase !== 'idle') cancel()
  }, [disabled, phase, cancel])

  return { phase, toggle: () => (phase === 'idle' ? start() : cancel()), cancel }
}

const pulse = keyframes`
  0% { box-shadow: 0 0 0 0 var(--voice-ring); }
  100% { box-shadow: 0 0 0 10px transparent; }
`
const wave = keyframes`
  0%, 100% { transform: scaleY(0.3); }
  50% { transform: scaleY(1); }
`
const shimmer = keyframes`
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
`
const reducedMotion = { '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }

/** Quiet ghost mic button that matches the action buttons. */
export function VoiceMicButton({ voice, disabled }: { voice: MockVoiceInput; disabled?: boolean }) {
  const active = voice.phase !== 'idle'
  const label = active ? 'Cancel voice input' : 'Voice input'
  return (
    <Tooltip title={label} enterDelay={TOOLTIP_DELAY}>
      <Box component="span" sx={{ display: 'inline-flex' }}>
        <IconButton
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onClick={voice.toggle}
          sx={(t) => ({
            '--voice-ring': t.palette.primary.main,
            width: 34,
            height: 34,
            borderRadius: '8px',
            border: '1px solid',
            borderColor: active ? t.palette.primary.main : t.palette.divider,
            color: active ? t.palette.primary.main : t.palette.text.secondary,
            bgcolor: active ? `color-mix(in srgb, ${t.palette.primary.main} 12%, transparent)` : 'transparent',
            '&:hover': { bgcolor: t.palette.action.hover, color: t.palette.primary.main, borderColor: t.palette.primary.main },
            '&.Mui-focusVisible': { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 2 },
            '&.Mui-disabled': { opacity: 0.45 },
            ...(voice.phase === 'listening' && { animation: `${pulse} 1.1s ease-out infinite`, ...reducedMotion }),
          })}
        >
          <Mic size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
        </IconButton>
      </Box>
    </Tooltip>
  )
}

/** "Listening…" sound-wave bars and the "Transcribing…" shimmer; typing shows in the field itself. */
export function VoiceStatus({ phase, sx }: { phase: VoicePhase; sx?: SxProps<Theme> }) {
  if (phase !== 'listening' && phase !== 'transcribing') return null
  return (
    <Box
      role="status"
      sx={[{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 20, px: 0.5 }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      {phase === 'listening' ? (
        <>
          <Box aria-hidden sx={{ display: 'flex', alignItems: 'center', gap: '3px', height: 16 }}>
            {[0, 1, 2, 3, 4].map((bar) => (
              <Box
                key={bar}
                sx={{
                  width: 3,
                  height: 16,
                  borderRadius: 2,
                  bgcolor: 'primary.main',
                  transformOrigin: 'center',
                  animation: `${wave} 0.9s ease-in-out ${bar * 0.12}s infinite`,
                  ...reducedMotion,
                }}
              />
            ))}
          </Box>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'primary.main' }}>
            Listening…
          </Typography>
        </>
      ) : (
        <Typography
          variant="caption"
          sx={(t) => ({
            fontWeight: 600,
            color: 'transparent',
            backgroundImage: `linear-gradient(90deg, ${t.palette.text.disabled} 30%, ${t.palette.text.primary} 50%, ${t.palette.text.disabled} 70%)`,
            backgroundSize: '200% 100%',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            animation: `${shimmer} 1.1s linear infinite`,
            ...reducedMotion,
          })}
        >
          Transcribing…
        </Typography>
      )}
    </Box>
  )
}
