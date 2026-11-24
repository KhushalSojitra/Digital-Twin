import { forwardRef, type ComponentType, type HTMLAttributes } from 'react'
import { Box, Tooltip } from '@mui/material'
import {
  Ban,
  Circle,
  CircleCheck,
  Clock,
  Hourglass,
  LoaderCircle,
  Forward,
  OctagonAlert,
  Pause,
  Play,
  RotateCcw,
  Send,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Undo2,
  X,
  type LucideProps,
} from 'lucide-react'
import type { TicketPriority, TicketStatus } from '../../data/tickets'
import { TOKENS } from '../../theme/theme'

/** Every indicator and action icon uses the same lucide set at this stroke width. */
export const ICON_STROKE = 2
export const ICON_SIZE = 18

/** Delay before a tooltip opens, so passing the pointer over the bar stays quiet. */
export const TOOLTIP_DELAY = 300

const SIGNAL = {
  red: TOKENS.status.danger,
  orange: TOKENS.status.warning,
  green: TOKENS.status.success,
  yellow: '#C9A227',
  grey: TOKENS.light.textSecondary,
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

/** Tooltip target that keeps working when its child is a disabled button. */
const Anchor = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(function Anchor(props, ref) {
  return <Box component="span" ref={ref} {...props} sx={{ display: 'inline-flex', flexShrink: 0 }} />
})

/** Small tinted pill: a 18px icon on a ~12% wash of its own colour. */
function Pill({ color, label, tooltip, Icon }: { color: string; label: string; tooltip: string; Icon: ComponentType<LucideProps> }) {
  return (
    <Tooltip title={tooltip} placement="bottom" enterDelay={TOOLTIP_DELAY}>
      <Anchor>
        <Box
          role="img"
          aria-label={label}
          tabIndex={0}
          sx={{
            height: 24,
            minWidth: 32,
            px: 0.75,
            border: `1px solid ${color}59`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '999px',
            color,
            bgcolor: `${color}1A`,
            outline: 'none',
            '&:focus-visible': { boxShadow: `0 0 0 2px ${color}` },
          }}
        >
          <Icon size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
        </Box>
      </Anchor>
    </Tooltip>
  )
}

/** Icon per kind of state, so To Do, In Progress, waiting and finished states look different. */
function stateIcon(stateName: string, status: TicketStatus, signal: Signal): ComponentType<LucideProps> {
  if (/discard|cancel/i.test(stateName)) return Ban
  if (/hold|pause|block/i.test(stateName)) return Pause
  if (/await|pending|waiting|review|submitted|approval/i.test(stateName)) return Hourglass
  if (/progress|rework|reopen/i.test(stateName)) return LoaderCircle
  if (/to ?do|open|new/i.test(stateName)) return Circle
  if (status === 'open') return Circle
  if (status === 'in_progress') return LoaderCircle
  return SIGNAL_ICON[signal] ?? Clock
}

export function StatusIndicator({ stateName, status }: { stateName: string; status: TicketStatus }) {
  const signal = signalFor(stateName, status)
  return <Pill color={SIGNAL[signal]} label={`Status: ${stateName}`} tooltip={stateName} Icon={stateIcon(stateName, status, signal)} />
}

const LEVEL: Record<TicketPriority, { icon: ComponentType<LucideProps>; color: string; label: string }> = {
  critical: { icon: Signal, color: SIGNAL.red, label: 'Critical' },
  high: { icon: SignalHigh, color: SIGNAL.orange, label: 'High' },
  medium: { icon: SignalMedium, color: SIGNAL.yellow, label: 'Medium' },
  low: { icon: SignalLow, color: SIGNAL.grey, label: 'Low' },
}

export function PriorityIndicator({ priority }: { priority: TicketPriority }) {
  const { icon, color, label } = LEVEL[priority]
  return <Pill color={color} label={`Priority: ${label}`} tooltip={`${label} priority`} Icon={icon} />
}

export type ActionKind = 'forward' | 'destructive' | 'neutral'

interface ActionLook {
  Icon: ComponentType<LucideProps>
  kind: ActionKind
  /** Lower wins when a state offers several forward actions. */
  rank: number
}

/** Picks an icon and role from the action name; display only, never changes what the action does. */
export function actionLook(label: string): ActionLook {
  if (/reject|declin|deny|cancel/i.test(label)) return { Icon: X, kind: 'destructive', rank: 99 }
  if (/hold|pause|block/i.test(label)) return { Icon: Pause, kind: 'destructive', rank: 99 }
  if (/reopen|restart|resume/i.test(label)) return { Icon: RotateCcw, kind: 'neutral', rank: 99 }
  if (/return|send back|request change|rework/i.test(label)) return { Icon: Undo2, kind: 'neutral', rank: 99 }
  if (/approve|accept/i.test(label)) return { Icon: CircleCheck, kind: 'forward', rank: 0 }
  if (/submit|approval|review/i.test(label)) return { Icon: Send, kind: 'forward', rank: 1 }
  if (/complete|done|finish|resolve|close/i.test(label)) return { Icon: CircleCheck, kind: 'forward', rank: 2 }
  if (/start|begin|pick up|take/i.test(label)) return { Icon: Play, kind: 'forward', rank: 3 }
  return { Icon: Forward, kind: 'neutral', rank: 99 }
}

/** The single forward action of a state, shown as the filled primary button. */
export function primaryActionId(actions: { id: string; label: string }[]): string | undefined {
  let best: { id: string; rank: number } | undefined
  for (const action of actions) {
    const look = actionLook(action.label)
    if (look.kind === 'forward' && (!best || look.rank < best.rank)) best = { id: action.id, rank: look.rank }
  }
  return best?.id
}

export const DESTRUCTIVE_COLOR = SIGNAL.red
