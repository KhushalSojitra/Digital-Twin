import { forwardRef, type ComponentType, type HTMLAttributes } from 'react'
import { Box, Tooltip } from '@mui/material'
import { CircleCheck, Clock, Forward, OctagonAlert, Pause, Play, RotateCcw, Send, Undo2, X, type LucideProps } from 'lucide-react'
import type { TicketPriority, TicketStatus } from '../../data/tickets'

/** Traffic-light palette shared by the status and action indicators. */
export const SIGNAL = {
  red: '#E5201B',
  orange: '#FF8A00',
  green: '#12B24A',
  blue: '#0A6CFF',
} as const

type Signal = 'red' | 'orange' | 'green'

const RED_STATE = /hold|block|reject|declin|fail|cancel|denied/i
const ORANGE_STATE = /await|pending|waiting|review|submitted|to ?do|progress|open|reopen/i
const GREEN_STATE = /done|approved|accept|clos|complete|resolved|finish/i

/** Reads the workflow state name first, then falls back to the ticket's status group. */
export function signalFor(stateName: string, status: TicketStatus): Signal {
  if (RED_STATE.test(stateName)) return 'red'
  if (ORANGE_STATE.test(stateName)) return 'orange'
  if (GREEN_STATE.test(stateName)) return 'green'
  if (status === 'failed') return 'red'
  if (status === 'done' || status === 'accepted') return 'green'
  return 'orange'
}

const SIGNAL_ICON: Record<Signal, ComponentType<LucideProps>> = {
  red: OctagonAlert,
  orange: Clock,
  green: CircleCheck,
}

const BADGE_SIZE = 44

/** Tooltip target that keeps working when its child is a disabled button. */
const Anchor = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(function Anchor(props, ref) {
  return <Box component="span" ref={ref} {...props} sx={{ display: 'inline-flex', flexShrink: 0 }} />
})

export function StatusIndicator({ stateName, status }: { stateName: string; status: TicketStatus }) {
  const signal = signalFor(stateName, status)
  const Icon = SIGNAL_ICON[signal]
  return (
    <Tooltip title={stateName} placement="bottom">
      <Anchor>
        <Box
          role="img"
          aria-label={`Status: ${stateName}`}
          tabIndex={0}
          sx={{
            width: BADGE_SIZE,
            height: BADGE_SIZE,
            display: 'grid',
            placeItems: 'center',
            borderRadius: '12px',
            color: '#fff',
            bgcolor: SIGNAL[signal],
            boxShadow: `0 0 0 4px ${SIGNAL[signal]}33`,
          }}
        >
          <Icon size={26} strokeWidth={2.5} aria-hidden />
        </Box>
      </Anchor>
    </Tooltip>
  )
}

const LEVEL: Record<TicketPriority, { bars: number; color: string; label: string }> = {
  critical: { bars: 4, color: '#E5201B', label: 'Critical' },
  high: { bars: 3, color: '#FF8A00', label: 'High' },
  medium: { bars: 2, color: '#F2B600', label: 'Medium' },
  low: { bars: 1, color: '#6B7A90', label: 'Low' },
}

export function PriorityIndicator({ priority }: { priority: TicketPriority }) {
  const { bars, color, label } = LEVEL[priority]
  return (
    <Tooltip title={`${label} priority`} placement="bottom">
      <Anchor>
        <Box
          role="img"
          aria-label={`Priority: ${label}`}
          tabIndex={0}
          sx={{
            width: BADGE_SIZE,
            height: BADGE_SIZE,
            display: 'grid',
            placeItems: 'center',
            borderRadius: '12px',
            border: `2px solid ${color}`,
            bgcolor: `${color}26`,
          }}
        >
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
            {[0, 1, 2, 3].map((i) => {
              const height = 7 + i * 5
              return <rect key={i} x={2 + i * 6} y={24 - height} width="4.5" height={height} rx="1.2" fill={i < bars ? color : `${color}40`} />
            })}
          </svg>
        </Box>
      </Anchor>
    </Tooltip>
  )
}

export type ActionTone = 'red' | 'orange' | 'green' | 'blue'

interface ActionLook {
  Icon: ComponentType<LucideProps>
  tone: ActionTone
}

/** Picks a distinct icon and colour from the action name; display only, never changes what the action does. */
export function actionLook(label: string): ActionLook {
  if (/reject|declin|deny|cancel/i.test(label)) return { Icon: X, tone: 'red' }
  if (/hold|pause|block/i.test(label)) return { Icon: Pause, tone: 'orange' }
  if (/reopen|restart|resume/i.test(label)) return { Icon: RotateCcw, tone: 'orange' }
  if (/return|send back|request change|rework/i.test(label)) return { Icon: Undo2, tone: 'orange' }
  if (/submit|approval|review/i.test(label)) return { Icon: Send, tone: 'blue' }
  if (/start|begin|pick up|take/i.test(label)) return { Icon: Play, tone: 'blue' }
  if (/complete|done|finish|resolve|accept|approve|close/i.test(label)) return { Icon: CircleCheck, tone: 'green' }
  return { Icon: Forward, tone: 'blue' }
}

export function toneColor(tone: ActionTone) {
  return tone === 'red' ? SIGNAL.red : tone === 'orange' ? SIGNAL.orange : tone === 'green' ? SIGNAL.green : SIGNAL.blue
}
