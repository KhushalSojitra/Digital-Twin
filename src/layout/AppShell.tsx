import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemAvatar,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import MenuRoundedIcon from '@mui/icons-material/MenuRounded'
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded'
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded'
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import PersonAddAltRoundedIcon from '@mui/icons-material/PersonAddAltRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import { useAuth } from '../auth/AuthContext'
import { useThemeMode } from '../theme/ThemeModeContext'
import { themeColors } from '../theme/theme'
import { LogoMark } from '../components/Logo'
import CameraDropdown from './CameraDropdown'
import { MODULES } from './modules'
import { initials } from '../utils/format'

const DRAWER_OPEN = 232
const DRAWER_MINI = 68
const HEADER_HEIGHT = 56
const FOOTER_HEIGHT = 28

export default function AppShell() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const { mode, toggleMode } = useThemeMode()
  const { currentUser, sessions, switchAccount, signOut, signOutAll } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Earth / Live View are content-first: give them the full canvas by tucking the nav away automatically.
  const immersive = location.pathname.startsWith('/earth')
  const [expanded, setExpanded] = useState(() => !immersive && localStorage.getItem('oomnieye.nav') !== 'mini')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [accountAnchor, setAccountAnchor] = useState<HTMLElement | null>(null)

  const [wasImmersive, setWasImmersive] = useState(immersive)
  if (immersive !== wasImmersive) {
    setWasImmersive(immersive)
    if (immersive) setExpanded(false)
  }

  const toggleExpanded = () => {
    setExpanded((v) => {
      localStorage.setItem('oomnieye.nav', v ? 'mini' : 'open')
      return !v
    })
  }

  const drawerWidth = isMobile ? DRAWER_OPEN : expanded ? DRAWER_OPEN : DRAWER_MINI
  const showLabels = isMobile || expanded


  const nav = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <List sx={{ px: 1, py: 1.5, flex: 1 }}>
        {MODULES.map((m) => {
          const active = location.pathname.startsWith(m.path)
          const Icon = m.icon
          const button = (
            <ListItemButton
              component={NavLink}
              to={m.path}
              onClick={() => setMobileOpen(false)}
              selected={active}
              sx={{
                mb: 0.5,
                minHeight: 46,
                justifyContent: showLabels ? 'initial' : 'center',
                px: showLabels ? 1.5 : 0,
                position: 'relative',
                '& .MuiListItemIcon-root': { color: 'secondary.main' },
                '&.Mui-selected': {
                  color: 'text.primary',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    left: -6,
                    top: 8,
                    bottom: 8,
                    width: 3,
                    borderRadius: 2,
                    bgcolor: 'secondary.main',
                  },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 0, mr: showLabels ? 1.5 : 0, justifyContent: 'center' }}>
                <Icon />
              </ListItemIcon>
              {showLabels && <ListItemText primary={m.label} slotProps={{ primary: { sx: { fontWeight: 500, fontSize: 14 } } }} />}
            </ListItemButton>
          )
          return (
            <ListItem key={m.id} disablePadding sx={{ display: 'block' }}>
              {showLabels ? (
                button
              ) : (
                <Tooltip title={m.label} placement="right" arrow>
                  {button}
                </Tooltip>
              )}
            </ListItem>
          )
        })}
      </List>
      {!isMobile && (
        <>
          <Divider />
          <Box sx={{ p: 1, display: 'flex', justifyContent: showLabels ? 'flex-end' : 'center' }}>
            <Tooltip title={expanded ? 'Collapse panel' : 'Expand panel'} placement="right">
              <IconButton size="small" onClick={toggleExpanded}>
                {expanded ? <ChevronLeftRoundedIcon /> : <ChevronRightRoundedIcon />}
              </IconButton>
            </Tooltip>
          </Box>
        </>
      )}
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <AppBar
        position="fixed"
        elevation={0}
        color="transparent"
        sx={{
          left: 0,
          width: '100%',
          zIndex: theme.zIndex.drawer + 1,
          backgroundColor: themeColors(mode).header,
          color: '#FFFFFF',
          '& .MuiIconButton-root': { color: 'rgba(255,255,255,0.88)' },
          '& .MuiIconButton-root:hover': { backgroundColor: 'rgba(255,255,255,0.10)' },
        }}
      >
        <Toolbar sx={{ minHeight: `${HEADER_HEIGHT}px !important`, gap: 1.5, px: { xs: 1.5, sm: 2 } }}>
          {isMobile && (
            <IconButton edge="start" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <MenuRoundedIcon />
            </IconButton>
          )}
          <LogoMark size={28} />
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              display: { xs: 'none', md: 'flex' },
              alignItems: 'center',
              gap: 1.25,
              pointerEvents: 'none',
            }}
          >
            <LogoMark size={26} />
            <Box sx={{ lineHeight: 1, textAlign: 'center' }}>
              <Typography sx={{ fontSize: 20, fontWeight: 500, lineHeight: 1.1, color: '#FFFFFF' }}>OominiEye</Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 300, letterSpacing: 0.4, color: 'rgba(255,255,255,0.86)' }}>
                Digital Twin Solutions
              </Typography>
            </Box>
          </Box>
          <Box
            sx={{
              minWidth: 0,
              flex: { xs: 1, md: '0 1 auto' },
              maxWidth: { xs: '100%', md: 360 },
              // readable on the near-black header
              '& .MuiInputBase-root': { color: '#FFFFFF', bgcolor: 'rgba(255,255,255,0.10) !important' },
              '& .MuiInputBase-root:hover': { bgcolor: 'rgba(255,255,255,0.16) !important' },
              '& .MuiTypography-root': { color: 'inherit' },
              '& .MuiSelect-icon, & svg': { color: 'rgba(255,255,255,0.85) !important' },
            }}
          >
            <CameraDropdown compact={isMobile} />
          </Box>
          <Box sx={{ flex: 1 }} />
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Tooltip title={mode === 'dark' ? 'Light theme' : 'Dark theme'}>
              <IconButton onClick={toggleMode} aria-label="Toggle theme">
                {mode === 'dark' ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Alerts">
              <IconButton onClick={() => navigate('/alerts')} aria-label="Alerts">
                <Badge badgeContent={2} color="primary" overlap="circular">
                  <NotificationsRoundedIcon />
                </Badge>
              </IconButton>
            </Tooltip>
            <Tooltip title={currentUser ? `${currentUser.displayName} · ${currentUser.role}` : 'Account'}>
              <IconButton onClick={(e) => setAccountAnchor(e.currentTarget)} sx={{ p: 0.5 }} aria-label="Account menu">
                <Avatar sx={{ width: 32, height: 32, bgcolor: currentUser?.avatarColor, fontSize: 13, fontWeight: 700 }}>
                  {currentUser ? initials(currentUser.displayName) : '?'}
                </Avatar>
              </IconButton>
            </Tooltip>
          </Stack>
        </Toolbar>
      </AppBar>

      <Menu
        anchorEl={accountAnchor}
        open={Boolean(accountAnchor)}
        onClose={() => setAccountAnchor(null)}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        slotProps={{ paper: { sx: { width: 300, mt: 1 } } }}
      >
        {currentUser && (
          <Box sx={{ px: 2, pt: 1, pb: 1.5 }}>
            <Typography sx={{ fontWeight: 700 }}>{currentUser.displayName}</Typography>
            <Typography variant="body2" color="text.secondary">
              {currentUser.email}
            </Typography>
            <Typography variant="caption" color="primary.main" sx={{ fontWeight: 600 }}>
              {currentUser.role}
            </Typography>
          </Box>
        )}
        <Divider sx={{ mb: 0.5 }} />
        <Typography variant="caption" color="text.secondary" sx={{ px: 2, display: 'block', mb: 0.5 }}>
          Signed-in accounts
        </Typography>
        {sessions.map((s) => (
          <MenuItem
            key={s.user.id}
            selected={s.user.id === currentUser?.id}
            onClick={() => {
              switchAccount(s.user.id)
              setAccountAnchor(null)
            }}
          >
            <ListItemAvatar sx={{ minWidth: 44 }}>
              <Avatar sx={{ width: 30, height: 30, bgcolor: s.user.avatarColor, fontSize: 12, fontWeight: 700 }}>
                {initials(s.user.displayName)}
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={s.user.displayName}
              secondary={s.user.role}
              slotProps={{ primary: { sx: { fontSize: 14, fontWeight: 600 } } }}
            />
            {s.user.id === currentUser?.id && <CheckRoundedIcon fontSize="small" color="primary" />}
          </MenuItem>
        ))}
        <MenuItem
          onClick={() => {
            setAccountAnchor(null)
            navigate('/login?add=1')
          }}
        >
          <ListItemIcon>
            <PersonAddAltRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Add another account" />
        </MenuItem>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem
          onClick={() => {
            setAccountAnchor(null)
            signOut()
          }}
        >
          <ListItemIcon>
            <LogoutRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary={sessions.length > 1 ? 'Sign out of this account' : 'Sign out'} />
        </MenuItem>
        {sessions.length > 1 && (
          <MenuItem
            onClick={() => {
              setAccountAnchor(null)
              signOutAll()
            }}
          >
            <ListItemIcon>
              <LogoutRoundedIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText primary="Sign out of all accounts" slotProps={{ primary: { color: 'error' } }} />
          </MenuItem>
        )}
      </Menu>

      <Drawer
        variant={isMobile ? 'temporary' : 'permanent'}
        open={isMobile ? mobileOpen : true}
        onClose={() => setMobileOpen(false)}
        sx={{
          width: isMobile ? 0 : drawerWidth,
          flexShrink: 0,
          transition: 'width 200ms',
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            overflowX: 'hidden',
            transition: 'width 200ms',
            borderRight: `1px solid ${theme.palette.divider}`,
            backgroundColor: themeColors(mode).sidebarBg,
            top: isMobile ? 0 : HEADER_HEIGHT,
            height: isMobile ? '100%' : `calc(100% - ${HEADER_HEIGHT}px)`,
          },
        }}
      >
        {nav}
      </Drawer>

      <Box
        component="main"
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          pt: `${HEADER_HEIGHT}px`,
          height: '100%',
        }}
      >
        <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
          <Outlet />
        </Box>
        <Box
          component="footer"
          sx={{
            display: immersive ? 'none' : 'flex',
            height: FOOTER_HEIGHT,
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            borderTop: `1px solid ${theme.palette.divider}`,
            backgroundColor: 'background.paper',
          }}
        >
          <Typography variant="caption" color="text.secondary">Ready</Typography>
          <Typography variant="caption" color="text.secondary">© 2026 OominiEye. All rights reserved.</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            Powered by OominiEye Digital Solutions
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
