import { Box, Divider, Stack, Tooltip, Typography } from '@mui/material'
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded'
import {
  STATUS_COLOR,
  buildInsights,
  summarise,
  summariseBySite,
  type ImprovementStats,
  type Ticket,
  type TrendPoint,
} from '../../data/tickets'

interface Props {
  tickets: Ticket[]
  /** Shown above the totals, e.g. the site a Live View is scoped to. */
  scopeLabel: string
  dense?: boolean
}

const METRICS: { key: keyof ImprovementStats; label: string; color?: string; hint: string }[] = [
  { key: 'open', label: 'To Do', color: STATUS_COLOR.open, hint: 'Red — To Do: raised and not started' },
  { key: 'closed', label: 'Closed', color: STATUS_COLOR.done, hint: 'Green — Done: work complete, awaiting acceptance' },
  { key: 'accepted', label: 'Accepted', color: STATUS_COLOR.accepted, hint: 'Blue — Accepted: reviewed and signed off' },
  { key: 'failed', label: 'Failed', color: STATUS_COLOR.failed, hint: 'Grey — Failed: could not be resolved' },
]

function Bar({ stats }: { stats: ImprovementStats }) {
  const segments = [
    { n: stats.open, color: STATUS_COLOR.open, hint: 'Red — To Do: raised and not started' },
    { n: stats.total - stats.open - stats.closed - stats.accepted - stats.failed, color: STATUS_COLOR.in_progress, hint: 'Amber — In Progress: work underway' },
    { n: stats.closed, color: STATUS_COLOR.done, hint: 'Green — Done: work complete, awaiting acceptance' },
    { n: stats.accepted, color: STATUS_COLOR.accepted, hint: 'Blue — Accepted: reviewed and signed off' },
    { n: stats.failed, color: STATUS_COLOR.failed, hint: 'Grey — Failed: could not be resolved' },
  ].filter((s) => s.n > 0)

  return (
    <Box sx={{ display: 'flex', height: 5, borderRadius: '3px', overflow: 'hidden', gap: '2px' }}>
      {segments.map((s, i) => (
        <Tooltip key={i} title={`${s.hint} (${s.n})`}>
          <Box sx={{ flex: s.n, bgcolor: s.color, minWidth: 4 }} />
        </Tooltip>
      ))}
    </Box>
  )
}

function Legend({ color, label, hint }: { color: string; label: string; hint: string }) {
  return (
    <Tooltip title={hint}>
      <Stack direction="row" spacing={0.4} sx={{ alignItems: 'center' }}>
        <Box sx={{ width: 7, height: 7, borderRadius: '2px', bgcolor: color }} />
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </Stack>
    </Tooltip>
  )
}

function formatHours(hours: number) {
  if (hours < 24) return `${Math.round(hours)} h`
  const days = hours / 24
  return `${days < 10 ? days.toFixed(1) : Math.round(days)} d`
}

/** Daily raised versus closed tickets as paired mini bars. */
function Trend({ points }: { points: TrendPoint[] }) {
  const peak = Math.max(1, ...points.flatMap((p) => [p.raised, p.closed]))
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'flex-end', height: 42 }}>
      {points.map((p) => (
        <Tooltip
          key={p.daysAgo}
          title={`${p.daysAgo === 0 ? 'Today' : p.daysAgo === 1 ? 'Yesterday' : `${p.daysAgo} days ago`}: ${p.raised} raised, ${p.closed} closed`}
        >
          <Stack direction="row" spacing={0.25} sx={{ flex: 1, alignItems: 'flex-end', height: '100%' }}>
            <Box sx={{ flex: 1, height: `${(p.raised / peak) * 100}%`, minHeight: 2, borderRadius: '2px', bgcolor: STATUS_COLOR.open }} />
            <Box sx={{ flex: 1, height: `${(p.closed / peak) * 100}%`, minHeight: 2, borderRadius: '2px', bgcolor: STATUS_COLOR.done }} />
          </Stack>
        </Tooltip>
      ))}
    </Stack>
  )
}

function Row({ label, stats, indent = false }: { label: string; stats: ImprovementStats; indent?: boolean }) {
  return (
    <Box sx={{ pl: indent ? 1.5 : 0, py: 0.5 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
        <Typography variant={indent ? 'body2' : 'subtitle2'} sx={{ flex: 1, minWidth: 0 }} noWrap>
          {label}
        </Typography>
        <Tooltip title="Completed improvements">
          <Typography variant="caption" sx={{ fontWeight: 700, color: STATUS_COLOR.done }}>{stats.improvements}</Typography>
        </Tooltip>
        <Typography variant="caption" color="text.secondary">
          of {stats.total}
        </Typography>
      </Stack>
      <Box sx={{ mt: 0.4 }}>
        <Bar stats={stats} />
      </Box>
    </Box>
  )
}

/** Improvement rollups for the tickets in view, broken down by site and by camera. */
export default function ImprovementSummary({ tickets, scopeLabel, dense = false }: Props) {
  const totals = summarise(tickets)
  const sites = summariseBySite(tickets)
  const insights = buildInsights(tickets)

  return (
    <Box sx={{ p: dense ? 1.25 : 1.5 }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 1 }}>
        <TrendingUpRoundedIcon sx={{ fontSize: 16, color: STATUS_COLOR.done }} />
        <Typography variant="overline" color="text.secondary">
          Improvements
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: '55%' }}>
          {scopeLabel}
        </Typography>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', mb: 1 }}>
        <Typography sx={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: STATUS_COLOR.done }}>{totals.improvements}</Typography>
        <Typography variant="caption" color="text.secondary">
          total improvements across {totals.total} tickets
        </Typography>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 0.75, mb: 1 }}>
        {METRICS.map((m) => (
          <Tooltip key={m.key} title={m.hint}>
            <Box
              sx={(t) => ({
                px: 0.75,
                py: 0.5,
                borderRadius: '10px',
                border: `1px solid ${t.palette.divider}`,
                borderLeft: `3px solid ${m.color}`,
              })}
            >
              <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.1 }}>{totals[m.key]}</Typography>
              <Typography variant="caption" color="text.secondary" >
                {m.label}
              </Typography>
            </Box>
          </Tooltip>
        ))}
      </Box>

      <Divider sx={{ my: 1 }} />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
            Improvements this week
          </Typography>
          <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{insights.thisWeek}</Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
            Avg resolution time
          </Typography>
          <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
            {insights.avgResolutionHours === null ? '—' : formatHours(insights.avgResolutionHours)}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ mt: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
            Open vs closed · 8 days
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Legend color={STATUS_COLOR.open} label="Raised" hint="Red — tickets raised that day" />
          <Legend color={STATUS_COLOR.done} label="Closed" hint="Green — tickets closed that day" />
        </Stack>
        <Trend points={insights.trend} />
      </Box>

      <Divider sx={{ my: 1 }} />
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>
        By site and camera
      </Typography>
      <Box sx={{ mt: 0.5 }}>
        {sites.map((site) => (
          <Box key={site.id} sx={{ mb: 0.75 }}>
            <Row label={site.label} stats={site.stats} />
            {site.cameras
              .filter((c) => c.stats.total > 0)
              .map((camera) => (
                <Row key={camera.id} label={camera.label} stats={camera.stats} indent />
              ))}
          </Box>
        ))}
        {sites.length === 0 && (
          <Typography variant="caption" color="text.disabled">
            No tickets in view.
          </Typography>
        )}
      </Box>
    </Box>
  )
}
