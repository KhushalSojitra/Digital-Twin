import { alpha, createTheme, type PaletteMode } from '@mui/material/styles'

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", "Segoe UI", Roboto, Helvetica, Arial, sans-serif'

export const IOS = {
  blue: '#0A84FF',
  blueLight: '#007AFF',
  green: '#30D158',
  red: '#FF453A',
  orange: '#FF9F0A',
  yellow: '#FFD60A',
  teal: '#64D2FF',
  indigo: '#5E5CE6',
}

export function buildTheme(mode: PaletteMode) {
  const dark = mode === 'dark'
  const primary = dark ? IOS.blue : IOS.blueLight
  const divider = dark ? 'rgba(255,255,255,0.10)' : 'rgba(60,60,67,0.16)'

  return createTheme({
    palette: {
      mode,
      primary: { main: primary },
      secondary: { main: IOS.indigo },
      success: { main: IOS.green },
      error: { main: IOS.red },
      warning: { main: IOS.orange },
      info: { main: IOS.teal },
      divider,
      background: dark ? { default: '#0B0D12', paper: '#161A22' } : { default: '#F2F2F7', paper: '#FFFFFF' },
      text: dark ? { primary: '#F5F5F7', secondary: 'rgba(235,235,245,0.62)' } : { primary: '#1C1C1E', secondary: 'rgba(60,60,67,0.62)' },
    },
    shape: { borderRadius: 14 },
    typography: {
      fontFamily: FONT_FAMILY,
      htmlFontSize: 16,
      h4: { fontSize: 28, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.2 },
      h5: { fontSize: 22, fontWeight: 800, letterSpacing: -0.35, lineHeight: 1.25 },
      h6: { fontSize: 18, fontWeight: 700, letterSpacing: -0.2, lineHeight: 1.3 },
      subtitle1: { fontSize: 16, fontWeight: 650, letterSpacing: -0.1, lineHeight: 1.35 },
      subtitle2: { fontSize: 14, fontWeight: 650, lineHeight: 1.4 },
      body1: { fontSize: 14.5, fontWeight: 400, lineHeight: 1.45 },
      body2: { fontSize: 13.5, fontWeight: 400, lineHeight: 1.45 },
      button: { textTransform: 'none', fontWeight: 650, fontSize: 14 },
      caption: { fontSize: 12.5, fontWeight: 500, letterSpacing: 0.1, lineHeight: 1.35 },
      overline: { fontSize: 11.5, fontWeight: 700, letterSpacing: 0.55, lineHeight: 1.3 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: {
            WebkitTextSizeAdjust: '100%',
            textSizeAdjust: '100%',
          },
          body: {
            backgroundColor: dark ? '#0B0D12' : '#F2F2F7',
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 12,
            paddingInline: 18,
            minHeight: 40,
            '&:hover': { filter: 'brightness(1.04)' },
          },
          sizeSmall: { minHeight: 32, fontSize: 13, paddingInline: 12 },
          sizeLarge: { minHeight: 48, fontSize: 16 },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            '&:hover': {
              backgroundColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(60,60,67,0.10)',
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
          rounded: { borderRadius: 16 },
        },
      },
      MuiTextField: {
        defaultProps: { variant: 'filled', fullWidth: true },
      },
      MuiFilledInput: {
        defaultProps: { disableUnderline: true },
        styleOverrides: {
          root: {
            borderRadius: 12,
            backgroundColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(118,118,128,0.12)',
            '&:hover': {
              backgroundColor: dark ? 'rgba(255,255,255,0.09)' : 'rgba(118,118,128,0.18)',
            },
            '&.Mui-focused': {
              backgroundColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(118,118,128,0.14)',
              boxShadow: `0 0 0 2px ${alpha(primary, 0.5)}`,
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: dark ? 'rgba(255,255,255,0.28)' : 'rgba(60,60,67,0.36)',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: primary,
            },
          },
          notchedOutline: { borderColor: divider },
        },
      },
      MuiSwitch: {
        styleOverrides: {
          root: { width: 51, height: 31, padding: 0 },
          switchBase: {
            padding: 2,
            '&.Mui-checked': {
              transform: 'translateX(20px)',
              color: '#fff',
              '& + .MuiSwitch-track': { backgroundColor: IOS.green, opacity: 1 },
            },
          },
          thumb: {
            width: 27,
            height: 27,
            boxShadow: '0 3px 8px rgba(0,0,0,0.15), 0 3px 1px rgba(0,0,0,0.06)',
          },
          track: {
            borderRadius: 31 / 2,
            backgroundColor: dark ? 'rgba(120,120,128,0.32)' : 'rgba(120,120,128,0.16)',
            opacity: 1,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 500,
            backgroundColor: dark ? 'rgba(44,44,46,0.96)' : 'rgba(28,28,30,0.92)',
          },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: {
            borderRadius: 14,
            border: `1px solid ${divider}`,
            backdropFilter: 'saturate(180%) blur(20px)',
            backgroundColor: dark ? 'rgba(28,28,30,0.86)' : 'rgba(255,255,255,0.86)',
          },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: { borderRadius: 8, marginInline: 6, minHeight: 40 },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: { borderRadius: 12 },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { fontWeight: 650 },
          sizeSmall: { fontSize: 12, height: 24 },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 20 },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: {
            border: `1px solid ${divider}`,
            backgroundImage: 'none',
          },
        },
      },
    },
  })
}
