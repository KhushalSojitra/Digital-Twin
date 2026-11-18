import { useId, useLayoutEffect, useRef, useState } from 'react'
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
}

/** A comment bubble clamped to two lines; longer comments get an expand icon that opens the full text. */
export default function ClampedComment({ text, by, at, mine, sx }: Props) {
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
        {truncated && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.25 }}>
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
