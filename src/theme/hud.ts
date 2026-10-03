import type { Theme } from '@mui/material/styles'

/** Frosted HUD chip/button that stays readable on satellite and video, light or dark. */
export function hudSurface(t: Theme) {
  const dark = t.palette.mode === 'dark'
  return {
    bgcolor: dark ? 'rgba(16,19,26,0.86)' : 'rgba(255,255,255,0.92)',
    color: t.palette.text.primary,
    backdropFilter: 'saturate(180%) blur(18px)',
    WebkitBackdropFilter: 'saturate(180%) blur(18px)',
    border: `1px solid ${dark ? 'rgba(255,255,255,0.18)' : 'rgba(28,28,30,0.16)'}`,
    boxShadow: dark ? '0 8px 22px rgba(0,0,0,0.45)' : '0 8px 22px rgba(28,28,30,0.12)',
    '&:hover': {
      bgcolor: dark ? 'rgba(34,38,48,0.94)' : '#FFFFFF',
      borderColor: dark ? 'rgba(255,255,255,0.34)' : 'rgba(28,28,30,0.28)',
    },
    '&:focus-visible': {
      outline: `2px solid ${t.palette.primary.main}`,
      outlineOffset: 2,
    },
  }
}

export const dialogPaperSx = {
  borderRadius: { xs: 0, sm: '16px' },
  m: { xs: 0, sm: 2 },
  width: { xs: '100%', sm: undefined },
  maxHeight: { xs: '100%', sm: 'min(860px, 92dvh)' },
} as const
