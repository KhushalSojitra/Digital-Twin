import { useEffect, useState } from 'react'
import { Box, Chip, Dialog, Skeleton, Stack, Tooltip, Typography } from '@mui/material'
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import { getSite } from '../../data/cameras'
import {
  LIFECYCLE_COLOR,
  LIFECYCLE_LABEL,
  STATUS_COLOR,
  isCompleted,
  type Snapshot,
  type Ticket,
} from '../../data/tickets'
import { formatDateTime, formatDuration } from '../../utils/format'
import { useTickets } from '../../state/TicketsContext'
import { renderSnapshot } from './snapshotRenderer'
import { useCapture } from './captureContext'

/** Before / after proof for a completed ticket, rendered from the camera that raised it. */
export default function ImprovementVerification({ ticket }: { ticket: Ticket }) {
  const { attachSnapshot } = useTickets()
  const capture = useCapture()
  const [zoomed, setZoomed] = useState<'before' | 'after' | null>(null)
  const { before, after } = ticket.snapshots
  const site = getSite(ticket.siteId)

  // Historical tickets carry no stored frames. Grab them from the camera when it is open,
  // and fall back to rendering the site panorama off-screen when it is not.
  useEffect(() => {
    if (!site || !isCompleted(ticket)) return
    let cancelled = false
    const dir = { yaw: ticket.yaw, pitch: ticket.pitch }
    const backfill = async (slot: 'before' | 'after', at: string, by: string) => {
      const src = capture?.(ticket.cameraId, dir, slot) ?? (await renderSnapshot(site.panorama, dir, 30, slot))
      if (cancelled || !src) return
      attachSnapshot(ticket.id, slot, { src, at, by, yaw: dir.yaw, pitch: dir.pitch })
    }
    if (!before) void backfill('before', ticket.createdAt, ticket.creator)
    if (!after) void backfill('after', ticket.completedAt ?? ticket.updatedAt, ticket.completion?.by ?? ticket.assignee)
    return () => {
      cancelled = true
    }
  }, [site, ticket, before, after, attachSnapshot, capture])

  const frame = (label: string, shot: Snapshot | undefined, slot: 'before' | 'after') => (
    <Box sx={{ minWidth: 0 }}>
      {shot ? (
        <Box
          component="img"
          src={shot.src}
          alt={`${label} snapshot for ${ticket.id}`}
          onClick={() => setZoomed(slot)}
          sx={(t) => ({
            width: '100%',
            aspectRatio: '8 / 5',
            objectFit: 'cover',
            borderRadius: '10px',
            cursor: 'zoom-in',
            border: `1px solid ${t.palette.divider}`,
          })}
        />
      ) : (
        <Skeleton variant="rounded" sx={{ width: '100%', aspectRatio: '8 / 5', borderRadius: '10px' }} />
      )}
      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, mt: 0.25 }}>
        {label}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
        {shot ? formatDateTime(shot.at) : 'Rendering frame…'}
      </Typography>
    </Box>
  )

  return (
    <Box>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.75, flexWrap: 'wrap', gap: 0.5 }}>
        <CheckCircleRoundedIcon sx={{ fontSize: 16, color: STATUS_COLOR.done }} />
        <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'text.secondary' }}>
          Improvement verification
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Tooltip title="Time from raised to completed">
            <Chip
              size="small"
              variant="outlined"
              icon={<TimerOutlinedIcon sx={{ fontSize: 13 }} />}
              label={formatDuration(ticket.createdAt, ticket.completedAt ?? ticket.updatedAt)}
              sx={{ height: 20, fontSize: 10.5, '& .MuiChip-icon': { ml: 0.5 } }}
            />
          </Tooltip>
        </Stack>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        {frame('Before', before, 'before')}
        {frame('After', after, 'after')}
      </Box>

      {ticket.completion && (
        <Box sx={{ mt: 1 }}>
          <Typography sx={{ fontSize: 13 }}>{ticket.completion.notes}</Typography>
          <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, flexWrap: 'wrap', gap: 0.5 }}>
            <Chip size="small" label={`Completed by ${ticket.completion.by}`} sx={{ height: 22, fontSize: 11 }} />
            <Chip size="small" variant="outlined" label={formatDateTime(ticket.completion.at)} sx={{ height: 22, fontSize: 11 }} />
            {ticket.snapshotConfig?.showInImprovementHistory && (
              <Chip size="small" color="success" variant="outlined" label="In improvement history" sx={{ height: 22, fontSize: 11 }} />
            )}
          </Stack>
        </Box>
      )}

      <Box sx={{ mt: 1.25 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', mb: 0.5 }}
        >
          Timeline
        </Typography>
        <Stack spacing={0.4}>
          {(ticket.timeline ?? [])
            .filter((e) => e.state)
            .map((e, i) => (
              <Stack key={`${e.at}-${i}`} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: LIFECYCLE_COLOR[e.state!], flexShrink: 0 }} />
                <Typography sx={{ fontSize: 12, fontWeight: 600, minWidth: 74 }}>{LIFECYCLE_LABEL[e.state!]}</Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {formatDateTime(e.at)} · {e.by}
                </Typography>
              </Stack>
            ))}
        </Stack>
      </Box>

      <Dialog open={Boolean(zoomed)} onClose={() => setZoomed(null)} maxWidth="md" fullWidth>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, p: 1 }}>
          {(['before', 'after'] as const).map((slot) => {
            const shot = ticket.snapshots[slot]
            return (
              <Box key={slot}>
                {shot && <Box component="img" src={shot.src} alt={`${slot} snapshot`} sx={{ width: '100%', borderRadius: '10px' }} />}
                <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'capitalize' }}>
                  {slot}
                  {shot ? ` · ${formatDateTime(shot.at)}` : ''}
                </Typography>
              </Box>
            )
          })}
        </Box>
      </Dialog>
    </Box>
  )
}
