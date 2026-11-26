import { useMemo, type ReactElement, type ReactNode } from 'react'
import { alpha, Box, Tooltip, Typography, type Theme } from '@mui/material'
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded'
import PauseCircleOutlineRoundedIcon from '@mui/icons-material/PauseCircleOutlineRounded'
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded'
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import { previewDefinition, type TicketTypeConfig } from '../../data/ticketTypes'
import InfoTip from './InfoTip'

type Tone = 'neutral' | 'approval' | 'active' | 'done'

const TONE_BY_STATE: Record<string, Tone> = {
  todo: 'neutral',
  pending_approval: 'approval',
  approved: 'approval',
  in_progress: 'active',
  pending_post_approval: 'approval',
  done: 'done',
}

const nodeSx = (tone: Tone) => ({
  width: '100%',
  maxWidth: 220,
  borderRadius: '10px',
  border: 1,
  px: 1.25,
  py: 0.75,
  textAlign: 'center' as const,
  color: (t: Theme) =>
    tone === 'active' ? t.palette.primary.contrastText : tone === 'done' ? t.palette.success.main : t.palette.text.primary,
  bgcolor: (t: Theme) =>
    tone === 'active'
      ? t.palette.primary.main
      : tone === 'done'
        ? alpha(t.palette.success.main, 0.14)
        : tone === 'approval'
          ? alpha(t.palette.warning.main, 0.12)
          : t.palette.action.hover,
  borderColor: (t: Theme) =>
    tone === 'active'
      ? t.palette.primary.main
      : tone === 'done'
        ? alpha(t.palette.success.main, 0.5)
        : tone === 'approval'
          ? alpha(t.palette.warning.main, 0.55)
          : t.palette.divider,
})

function Tag({ icon, label, tip }: { icon: ReactElement; label: string; tip: string }) {
  return (
    <Tooltip title={tip} arrow placement="top" enterTouchDelay={0}>
      <Box
        component="span"
        tabIndex={0}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          px: 0.875,
          py: 0.125,
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1.5,
          borderRadius: 999,
          border: '1px dashed currentColor',
          cursor: 'help',
          '& svg': { fontSize: 13 },
          '&:focus-visible': { outline: '2px solid currentColor', outlineOffset: 2 },
        }}
      >
        {icon}
        {label}
      </Box>
    </Tooltip>
  )
}

/** On Hold is shown as a tag; Rejected and Closed are side exits with no step of their own in the preview. */
const HIDDEN_IN_PREVIEW = new Set(['on_hold', 'rejected', 'closed'])

export default function WorkflowPreview({
  config,
  currentState,
  headerAction,
}: {
  config: TicketTypeConfig
  /** Workflow state of the ticket the dialog was opened from; that step is highlighted. */
  currentState?: string
  headerAction?: ReactNode
}) {
  const currentNode = currentState === 'on_hold' ? 'in_progress' : currentState
  const mainFlow = useMemo(() => previewDefinition(config).states.filter((state) => !HIDDEN_IN_PREVIEW.has(state.key)), [config])

  const tagsFor = (stateKey: string) => {
    const tags: ReactElement[] = []
    if (stateKey === 'in_progress') {
      if (config.onHold) {
        tags.push(
          <Tag
            key="hold"
            icon={<PauseCircleOutlineRoundedIcon />}
            label="On Hold / Resume"
            tip="Conditional transition: work in progress can move to On Hold and resume later. It is not a step in the main flow."
          />,
        )
      }
      if (config.allowPassOn) {
        tags.push(
          <Tag
            key="pass"
            icon={<SwapHorizRoundedIcon />}
            label="Pass On"
            tip="Assignment action: the assignee hands the ticket to someone else. The ticket stays In Progress; it is not a workflow state."
          />,
        )
      }
    }
    if (stateKey === 'done' && config.allowReopen) {
      tags.push(
        <Tag
          key="reopen"
          icon={<ReplayRoundedIcon />}
          label="Reopen"
          tip="Conditional transition: a Done ticket can be reopened back to In Progress with a new assignee."
        />,
      )
    }
    return tags
  }

  return (
    <Box
      component="section"
      aria-label="Workflow preview"
      sx={{ border: 1, borderColor: 'divider', borderRadius: '12px', p: 1.5, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.25 }}>
        <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 700 }}>
          Workflow Preview
        </Typography>
        <InfoTip label="About the workflow preview">
          Solid steps are the main flow, including approvals. Dashed tags are optional: On Hold and Reopen are conditional transitions, and Pass On is an assignment action.
        </InfoTip>
        <Box sx={{ flex: 1 }} />
        {headerAction}
      </Box>
      {/* my: auto centres the flow vertically in the card and still scrolls from the top when it is taller. */}
      <Box component="ol" sx={{ listStyle: 'none', mx: 0, my: 'auto', p: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {mainFlow.map((state, index) => {
          const tone = TONE_BY_STATE[state.key] ?? 'neutral'
          const tags = tagsFor(state.key)
          return (
            <Box
              component="li"
              key={state.key}
              sx={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              <Box
                sx={[
                  nodeSx(tone),
                  state.key === currentNode && {
                    position: 'relative',
                    boxShadow: (t: Theme) => `0 0 0 2px ${t.palette.secondary.main}`,
                  },
                ]}
                aria-current={state.key === currentNode ? 'step' : undefined}
              >
                {state.key === currentNode && (
                  <Box
                    component="span"
                    sx={(t) => ({
                      position: 'absolute',
                      top: -9,
                      right: 8,
                      px: 0.75,
                      borderRadius: '999px',
                      fontSize: 10,
                      fontWeight: 600,
                      lineHeight: '16px',
                      color: '#fff',
                      bgcolor: t.palette.secondary.main,
                    })}
                  >
                    {currentState === 'on_hold' ? 'This ticket · On Hold' : 'This ticket'}
                  </Box>
                )}
                <Typography
                  variant="body2"
                  component="span"
                  sx={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 0.75 }}
                >
                  {tone === 'done' && <CheckCircleRoundedIcon sx={{ fontSize: 16 }} />}
                  {state.label}
                </Typography>
                {tags.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 0.5, mt: 0.5 }}>{tags}</Box>
                )}
              </Box>
              {index < mainFlow.length - 1 && (
                <ArrowDownwardRoundedIcon aria-hidden sx={{ fontSize: 18, color: 'text.secondary', my: 0.25 }} />
              )}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
