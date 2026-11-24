import { Box, Chip, Stack, Tab, Tabs, Typography, alpha, type ChipProps, type SxProps, type Theme } from '@mui/material'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import type { ReactElement, ReactNode } from 'react'
import { TOKENS, cardGradient, themeColors } from '../../theme/theme'

/**
 * Shared building blocks that follow the OominiEye Figma design.
 * All sizes/colours come from TOKENS so the Theme application can change them.
 */

/** Gradient card surface (light top → slate bottom), as in the Figma cards. */
export function glassCardSx(t: Theme): Record<string, unknown> {
  const dark = t.palette.mode === 'dark'
  return {
    backgroundImage: cardGradient(t.palette.mode),
    backgroundColor: t.palette.background.paper,
    border: `1px solid ${t.palette.divider}`,
    borderRadius: `${TOKENS.radius.lg}px`,
    boxShadow: dark ? '0 2px 10px rgba(0,0,0,0.45)' : '0 2px 10px rgba(17,20,23,0.10)',
  }
}

/** Small rounded-square icon button with a light fill and thin border (Figma card toolbar). */
export function toolButtonSx(t: Theme): Record<string, unknown> {
  const c = themeColors(t.palette.mode)
  return {
    width: TOKENS.control.iconButton,
    height: TOKENS.control.iconButton,
    borderRadius: `${TOKENS.radius.md}px`,
    border: `1px solid ${alpha(c.primary, 0.28)}`,
    backgroundColor: alpha(c.paper, t.palette.mode === 'dark' ? 0.08 : 0.55),
    color: c.text,
    '&:hover': { backgroundColor: alpha(c.primary, 0.14) },
    '&.Mui-disabled': { opacity: 0.4, borderColor: alpha(c.primary, 0.12) },
  }
}

/** Round icon chip used in the breadcrumb header and on the active tab. */
function IconChip({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <Box
      sx={(t) => {
        const c = themeColors(t.palette.mode)
        return {
          width: 28,
          height: 28,
          flexShrink: 0,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          color: active ? (t.palette.mode === 'dark' ? c.pageBg : '#FFFFFF') : c.text,
          backgroundColor: active ? c.primary : alpha(c.primary, 0.12),
          border: active ? 'none' : `1px solid ${alpha(c.primary, 0.18)}`,
          '& svg': { fontSize: 16 },
        }
      }}
    >
      {children}
    </Box>
  )
}

/** Figma page header: round icon chip + "Section › Page" breadcrumb. */
export function PageHeader({ icon, trail, pageIcon, actions }: { icon: ReactElement; trail: string[]; pageIcon?: ReactElement; actions?: ReactNode }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 2, minHeight: 40 }}>
      <IconChip>{icon}</IconChip>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0, flex: 1, flexWrap: 'wrap' }}>
        {trail.map((part, i) => {
          const last = i === trail.length - 1
          return (
            <Stack key={part} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              {last && pageIcon && <Box sx={{ display: 'flex', color: 'text.secondary', '& svg': { fontSize: 18 } }}>{pageIcon}</Box>}
              <Typography component={last ? 'h1' : 'span'} sx={{ fontSize: TOKENS.size.title2, fontWeight: TOKENS.weight.regular, lineHeight: 1.2, color: 'text.primary' }}>
                {part}
              </Typography>
              {!last && <ChevronRightRoundedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />}
            </Stack>
          )
        })}
      </Stack>
      {actions}
    </Stack>
  )
}

export interface IconTabItem<T extends string> {
  value: T
  label: string
  icon: ReactElement
}

/** Figma tabs: icon + label; the active tab gets a filled icon chip, grey background and dark underline. */
export function IconTabs<T extends string>({ value, onChange, items }: { value: T; onChange: (next: T) => void; items: IconTabItem<T>[] }) {
  return (
    <Tabs
      value={value}
      onChange={(_, next) => onChange(next as T)}
      variant="scrollable"
      scrollButtons="auto"
      sx={{ mb: 2.5 }}
    >
      {items.map((item) => (
        <Tab
          key={item.value}
          value={item.value}
          iconPosition="start"
          icon={
            item.value === value ? (
              <IconChip active>{item.icon}</IconChip>
            ) : (
              <Box sx={{ display: 'flex', '& svg': { fontSize: 18 } }}>{item.icon}</Box>
            )
          }
          label={item.label}
          sx={{ gap: 1, px: 2, '& .MuiTab-iconWrapper': { mr: 0 } }}
        />
      ))}
    </Tabs>
  )
}

/** White pill with a thin border ("online", role chips). */
export function NeutralChip(props: ChipProps) {
  return <Chip size="small" variant="outlined" {...props} sx={[{ fontWeight: 600, px: 0.5 }, ...(Array.isArray(props.sx) ? props.sx : [props.sx])] as SxProps<Theme>} />
}

/** Tinted status pill: coloured text on a light tint of the same colour (e.g. "● Connected"). */
export function StatusChip({ label, color, dot = true }: { label: string; color: string; dot?: boolean }) {
  return (
    <Chip
      size="small"
      label={
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          {dot && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color }} />}
          <span>{label}</span>
        </Stack>
      }
      sx={{ bgcolor: alpha(color, 0.12), color, border: `1px solid ${alpha(color, 0.35)}`, fontWeight: 600 }}
    />
  )
}

/** White stat tile with a caption and a large number (Figma "Days on Live View"). */
export function StatTile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box
      sx={(t) => ({
        p: 1.5,
        borderRadius: `${TOKENS.radius.md}px`,
        bgcolor: t.palette.mode === 'dark' ? alpha('#FFFFFF', 0.06) : '#FFFFFF',
        border: `1px solid ${t.palette.divider}`,
        textAlign: 'center',
      })}
    >
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
        {label}
      </Typography>
      {children}
    </Box>
  )
}

/** Round red-tinted close button used on every dialog (Figma + org standard). */
export function closeButtonSx(t: Theme): Record<string, unknown> {
  const danger = t.palette.error.main
  return {
    width: 28,
    height: 28,
    borderRadius: '50%',
    color: danger,
    backgroundColor: alpha(danger, 0.12),
    border: `1px solid ${alpha(danger, 0.35)}`,
    '& svg': { fontSize: 16 },
    '&:hover': { backgroundColor: danger, color: '#FFFFFF' },
  }
}

/** Header icon tile for dialogs (light rounded square with border). */
export function dialogIconSx(t: Theme): Record<string, unknown> {
  const c = themeColors(t.palette.mode)
  return {
    width: 32,
    height: 32,
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    borderRadius: `${TOKENS.radius.md}px`,
    color: c.text,
    backgroundColor: alpha(c.primary, 0.1),
    border: `1px solid ${alpha(c.primary, 0.22)}`,
    '& svg': { fontSize: 18 },
  }
}
