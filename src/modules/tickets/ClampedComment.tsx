import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Avatar, Box, Dialog, DialogContent, DialogTitle, IconButton, Tooltip, Typography, type SxProps, type Theme } from '@mui/material'
import { Maximize2, X } from 'lucide-react'
import { formatDateTime, initials } from '../../utils/format'
import MentionText from './MentionText'

interface Props {
  text: string
  by: string
  at: Parameters<typeof formatDateTime>[0]
  mine?: boolean
  /** Bubble styling supplied by the list that renders the comment. */
  sx?: SxProps<Theme>
  /** Rendered above the text inside the bubble (for example a quoted reply). */
  header?: ReactNode
  /** Rendered between the text and the footer (for example attachment chips). */
  extra?: ReactNode
  /** Rendered at the bottom-right of the bubble (for example the time). */
  footer?: ReactNode
}

/** A comment bubble clamped to two lines; longer comments get an expand icon that opens the full text. */
export default function ClampedComment({ text, by, at, mine, sx, header, extra, footer }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [truncated, setTruncated] = useState(false)
  const [open, setOpen] = useState(false)
  const titleId = useId()

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const measure = () => setTruncated(body.scrollHeight > body.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    return () => observer.disconnect()
  }, [text])

  return (
    <>
      <Box sx={[{ typography: 'body2', maxWidth: '100%' }, ...(Array.isArray(sx) ? sx : [sx])]}>
        {header}
        {text && (
          <Box
            ref={bodyRef}
            sx={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            <MentionText text={text} />
          </Box>
        )}
        {extra}
        {(truncated || footer) && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mt: 0.25 }}>
            {truncated ? (
            <Tooltip title="View full comment">
              <IconButton
                size="small"
                aria-label="View full comment"
                onClick={() => setOpen(true)}
                sx={(t) => ({
                  width: 24,
                  height: 24,
                  borderRadius: '6px',
                  color: t.palette.text.secondary,
                  '&:hover': { color: t.palette.primary.main, bgcolor: t.palette.action.hover },
                  '&.Mui-focusVisible': { outline: `2px solid ${t.palette.primary.main}`, outlineOffset: 1 },
                })}
              >
                <Maximize2 size={14} strokeWidth={2} aria-hidden />
              </IconButton>
            </Tooltip>
            ) : (
              <span />
            )}
            {footer}
          </Box>
        )}
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" aria-labelledby={titleId}>
        <DialogTitle id={titleId} component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1.25, pr: 1.5 }}>
          <Avatar sx={{ width: 32, height: 32, fontSize: 11, fontWeight: 700, bgcolor: mine ? 'primary.main' : 'secondary.main' }}>
            {initials(by)}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography component="span" sx={{ display: 'block', fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>
              {by}
            </Typography>
            <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {formatDateTime(at)}
            </Typography>
          </Box>
          <IconButton aria-label="Close" onClick={() => setOpen(false)} sx={{ color: 'text.secondary' }}>
            <X size={18} strokeWidth={2} aria-hidden />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Typography component="div" sx={{ fontSize: 14.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            <MentionText text={text} />
          </Typography>
        </DialogContent>
      </Dialog>
    </>
  )
}
