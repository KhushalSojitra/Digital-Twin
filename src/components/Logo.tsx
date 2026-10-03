import { Box, Typography } from '@mui/material'

export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <Box component="svg" viewBox="0 0 64 64" sx={{ width: size, height: size, display: 'block', flexShrink: 0 }} aria-hidden>
      <defs>
        <linearGradient id="oe-logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5AC8FA" />
          <stop offset="1" stopColor="#0A84FF" />
        </linearGradient>
      </defs>
      <path d="M32 6 L54 18 L54 46 L32 58 L10 46 L10 18 Z" fill="none" stroke="url(#oe-logo-grad)" strokeWidth="4" strokeLinejoin="round" />
      <path d="M14 32 C20 22 44 22 50 32 C44 42 20 42 14 32 Z" fill="none" stroke="url(#oe-logo-grad)" strokeWidth="3.5" />
      <circle cx="32" cy="32" r="6" fill="url(#oe-logo-grad)" />
    </Box>
  )
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
      <LogoMark size={compact ? 32 : 40} />
      <Box sx={{ lineHeight: 1, minWidth: 0 }}>
        <Typography component="div" sx={{ fontWeight: 700, fontSize: compact ? 17 : 20, letterSpacing: -0.3, lineHeight: 1.1 }}>
          OominiEye
        </Typography>
        <Typography
          component="div"
          sx={{
            fontSize: compact ? 9 : 10.5,
            fontWeight: 600,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: 'text.secondary',
            whiteSpace: 'nowrap',
          }}
        >
          Next-Gen Command &amp; Control
        </Typography>
      </Box>
    </Box>
  )
}
