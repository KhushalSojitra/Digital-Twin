import { alpha, createTheme, type PaletteMode } from '@mui/material/styles'

/**
 * OominiEye theme — follows the Figma design "OominiEye_Ticket" (Nov 2026).
 * Every visual value lives in TOKENS so the Theme application can override
 * sizes, corners and colours without touching components.
 */
export const TOKENS = {
  font: {
    heading: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
    body: '"Inter", "Roboto", system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  // Figma type scale (variables Size/*)
  size: { title1: 28, title2: 22, title3: 18, subheadline: 16, body: 14, bodySmall: 13, footnote: 13, caption: 12 },
  weight: { light: 300, regular: 400, medium: 500, heading: 600, hero: 700 },
  // Figma radius variables: 4 / 12 (Corner/Medium) / 20 (Corner/Large-increased) / 9999
  radius: { sm: 4, md: 8, lg: 12, xl: 20, pill: 9999 },
  space: [2, 4, 6, 8, 12, 16, 24, 48],
  control: { buttonHeight: 32, buttonHeightSmall: 28, iconButton: 32 },
  light: {
    primary: '#3A4A55', // dark slate — filled buttons, active chips
    primaryHover: '#2C3942',
    accent: '#2F80ED', // blue accent (Dashboard icon, home button)
    header: '#0B1116', // near-black app header
    pageBg: '#ECEEF0',
    sidebarBg: '#F7F8F9',
    paper: '#FFFFFF',
    text: '#111417',
    textSecondary: '#5B6670',
    divider: 'rgba(17,20,23,0.10)',
    cardTop: '#F4F6F7',
    cardBottom: '#A9B8C3',
    inputBg: 'rgba(58,74,85,0.10)',
  },
  dark: {
    primary: '#A9BAC6',
    primaryHover: '#C3D0D9',
    accent: '#5AA0FF',
    header: '#05080B',
    pageBg: '#0E1418',
    sidebarBg: '#131B20',
    paper: '#18222A',
    text: '#EEF2F5',
    textSecondary: '#9AA8B3',
    divider: 'rgba(255,255,255,0.10)',
    cardTop: '#22303A',
    cardBottom: '#141C22',
    inputBg: 'rgba(255,255,255,0.07)',
  },
  status: {
    success: '#1E9E5A',
    warning: '#E08A00',
    danger: '#E5484D',
    info: '#2F80ED',
  },
}

/** Kept for existing imports: brand-neutral status colours. */
export const IOS = {
  blue: TOKENS.status.info,
  blueLight: TOKENS.status.info,
  green: TOKENS.status.success,
  red: TOKENS.status.danger,
  orange: TOKENS.status.warning,
  yellow: '#F2C94C',
  teal: '#56CCF2',
  indigo: '#5E5CE6',
}

export type ThemeColors = typeof TOKENS.light

export function themeColors(mode: PaletteMode): ThemeColors {
  return mode === 'dark' ? TOKENS.dark : TOKENS.light
}

/** Figma card surface: light top fading to slate blue-grey. */
export function cardGradient(mode: PaletteMode) {
  const c = themeColors(mode)
  return `linear-gradient(180deg, ${c.cardTop} 0%, ${c.cardBottom} 100%)`
}

export function buildTheme(mode: PaletteMode) {
  const dark = mode === 'dark'
  const c = themeColors(mode)
  const { radius, size, weight, control } = TOKENS

  return createTheme({
    palette: {
      mode,
      primary: { main: c.primary, dark: c.primaryHover, contrastText: dark ? '#0E1418' : '#FFFFFF' },
      secondary: { main: c.accent },
      success: { main: TOKENS.status.success },
      error: { main: TOKENS.status.danger },
      warning: { main: TOKENS.status.warning },
      info: { main: TOKENS.status.info },
      divider: c.divider,
      background: { default: c.pageBg, paper: c.paper },
      text: { primary: c.text, secondary: c.textSecondary },
    },
    shape: { borderRadius: radius.lg },
    typography: {
      fontFamily: TOKENS.font.body,
      htmlFontSize: 16,
      h4: { fontFamily: TOKENS.font.heading, fontSize: size.title1, fontWeight: weight.heading, lineHeight: 1.2 },
      h5: { fontFamily: TOKENS.font.heading, fontSize: size.title2, fontWeight: weight.regular, lineHeight: 1.25 },
      h6: { fontFamily: TOKENS.font.heading, fontSize: size.title3, fontWeight: weight.heading, lineHeight: 1.3 },
      subtitle1: { fontSize: size.subheadline, fontWeight: weight.heading, lineHeight: 1.35 },
      subtitle2: { fontSize: size.body, fontWeight: weight.heading, lineHeight: 1.4 },
      body1: { fontSize: size.body, fontWeight: weight.regular, lineHeight: 1.45 },
      body2: { fontSize: size.bodySmall, fontWeight: weight.regular, lineHeight: 1.45 },
      button: { textTransform: 'none', fontWeight: weight.medium, fontSize: size.bodySmall },
      caption: { fontSize: size.caption, fontWeight: weight.regular, lineHeight: 1.35 },
      overline: { fontSize: 11, fontWeight: weight.heading, letterSpacing: 0.5, lineHeight: 1.3 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: { WebkitTextSizeAdjust: '100%', textSizeAdjust: '100%' },
          body: { backgroundColor: c.pageBg },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: radius.pill,
            paddingInline: 18,
            minHeight: control.buttonHeight,
          },
          contained: { '&:hover': { filter: 'brightness(0.92)' } },
          outlined: {
            borderColor: c.divider,
            color: c.text,
            backgroundColor: dark ? 'transparent' : alpha('#FFFFFF', 0.7),
            '&:hover': { borderColor: alpha(c.primary, 0.4), backgroundColor: alpha(c.primary, 0.06) },
          },
          sizeSmall: { minHeight: control.buttonHeightSmall, fontSize: size.caption, paddingInline: 12 },
          sizeLarge: { minHeight: 40, fontSize: size.body },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: radius.md,
            '&:hover': { backgroundColor: alpha(c.primary, dark ? 0.16 : 0.08) },
            '&:focus-visible': { outline: `2px solid ${alpha(c.accent, 0.6)}`, outlineOffset: 2 },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
          rounded: { borderRadius: radius.lg },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            backgroundImage: cardGradient(mode),
            border: `1px solid ${c.divider}`,
            boxShadow: dark ? '0 2px 10px rgba(0,0,0,0.45)' : '0 2px 10px rgba(17,20,23,0.10)',
            borderRadius: radius.lg,
          },
        },
      },
      MuiTextField: {
        defaultProps: { variant: 'filled', fullWidth: true },
      },
      MuiFilledInput: {
        defaultProps: { disableUnderline: true },
        styleOverrides: {
          root: {
            borderRadius: radius.md,
            backgroundColor: c.inputBg,
            '&:hover': { backgroundColor: alpha(c.primary, dark ? 0.12 : 0.14) },
            '&.Mui-focused': {
              backgroundColor: alpha(c.primary, dark ? 0.12 : 0.12),
              boxShadow: `0 0 0 2px ${alpha(c.accent, 0.45)}`,
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: radius.md,
            backgroundColor: c.inputBg,
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: alpha(c.primary, 0.3) },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: c.accent },
          },
          notchedOutline: { borderColor: 'transparent' },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          root: { width: 40, height: 22, padding: 0 },
          switchBase: {
            padding: 2,
            '&.Mui-checked': {
              transform: 'translateX(18px)',
              color: '#fff',
              '& + .MuiSwitch-track': { backgroundColor: TOKENS.status.success, opacity: 1 },
            },
          },
          thumb: { width: 18, height: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.25)' },
          track: { borderRadius: 11, backgroundColor: dark ? 'rgba(255,255,255,0.22)' : 'rgba(17,20,23,0.18)', opacity: 1 },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: { minHeight: 40, borderBottom: `1px solid ${c.divider}` },
          indicator: { backgroundColor: c.primary, height: 2 },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            minHeight: 40,
            fontSize: size.bodySmall,
            fontWeight: weight.medium,
            color: c.textSecondary,
            borderTopLeftRadius: radius.md,
            borderTopRightRadius: radius.md,
            '&.Mui-selected': { color: c.text, backgroundColor: alpha(c.primary, dark ? 0.18 : 0.10) },
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { borderRadius: radius.sm + 2, fontSize: size.caption, fontWeight: weight.medium, backgroundColor: alpha(c.header, 0.94) },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: radius.lg,
            border: `1px solid ${c.divider}`,
            backdropFilter: 'saturate(160%) blur(16px)',
            backgroundColor: alpha(c.paper, 0.92),
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: { root: { borderRadius: radius.md - 2, marginInline: 6, minHeight: 36, fontSize: size.bodySmall } },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: radius.md,
            '&.Mui-selected': { backgroundColor: alpha(c.primary, dark ? 0.18 : 0.10) },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: weight.medium, borderRadius: radius.pill },
          sizeSmall: { fontSize: 11, height: 22 },
          outlined: { borderColor: c.divider, backgroundColor: dark ? 'transparent' : '#FFFFFF' },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: radius.xl,
            backgroundImage: cardGradient(mode),
            backgroundColor: c.paper,
            border: `1px solid ${c.divider}`,
          },
        },
      },
      MuiPopover: {
        styleOverrides: { paper: { border: `1px solid ${c.divider}`, backgroundImage: 'none' } },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: c.divider, fontSize: size.bodySmall },
          head: { fontWeight: weight.heading, color: c.textSecondary },
        },
      },
    },
  })
}
