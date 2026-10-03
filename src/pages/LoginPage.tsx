import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded'
import PersonRoundedIcon from '@mui/icons-material/PersonRounded'
import LockRoundedIcon from '@mui/icons-material/LockRounded'
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded'
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded'
import ArrowForwardIosRoundedIcon from '@mui/icons-material/ArrowForwardIosRounded'
import { useAuth } from '../auth/AuthContext'
import { DEMO_ACCOUNTS } from '../auth/users'
import { Wordmark } from '../components/Logo'
import { useThemeMode } from '../theme/ThemeModeContext'
import { initials } from '../utils/format'

export default function LoginPage() {
  const { login, sessions, currentUser, switchAccount } = useAuth()
  const { mode, toggleMode } = useThemeMode()
  const navigate = useNavigate()
  const location = useLocation()
  const addingAccount = new URLSearchParams(location.search).get('add') === '1'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (currentUser && !addingAccount) return <Navigate to="/earth" replace />

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!username || !password) {
      setError('Enter both your username and password.')
      return
    }
    setBusy(true)
    setError(null)
    const result = await login(username, password)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    navigate('/earth', { replace: true })
  }

  const fillDemo = (u: string, p: string) => {
    setUsername(u)
    setPassword(p)
    setError(null)
  }

  return (
    <Box
      sx={(t) => ({
        minHeight: '100%',
        display: 'grid',
        placeItems: 'center',
        p: 2,
        position: 'relative',
        background:
          t.palette.mode === 'dark'
            ? 'radial-gradient(1200px 600px at 10% -10%, rgba(10,132,255,0.22), transparent 60%), radial-gradient(900px 500px at 110% 110%, rgba(94,92,230,0.22), transparent 60%), #0B0D12'
            : 'radial-gradient(1200px 600px at 10% -10%, rgba(0,122,255,0.16), transparent 60%), radial-gradient(900px 500px at 110% 110%, rgba(94,92,230,0.14), transparent 60%), #F2F2F7',
      })}
    >
      <Tooltip title={mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
        <IconButton onClick={toggleMode} sx={{ position: 'absolute', top: 16, right: 16 }}>
          {mode === 'dark' ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
        </IconButton>
      </Tooltip>

      <Paper
        elevation={0}
        sx={(t) => ({
          width: '100%',
          maxWidth: 420,
          p: { xs: 3, sm: 4 },
          borderRadius: '24px',
          border: `1px solid ${t.palette.divider}`,
          backdropFilter: 'saturate(180%) blur(24px)',
          backgroundColor: t.palette.mode === 'dark' ? 'rgba(22,26,34,0.78)' : 'rgba(255,255,255,0.78)',
          boxShadow: t.palette.mode === 'dark' ? '0 30px 80px rgba(0,0,0,0.55)' : '0 30px 80px rgba(28,28,30,0.14)',
        })}
      >
        <Stack spacing={3}>
          <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center' }}>
            <Wordmark />
            <Box>
              <Typography variant="h5">{addingAccount ? 'Add another account' : 'Sign in'}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {addingAccount
                  ? 'Sign in with a second set of credentials. You can switch between accounts at any time.'
                  : 'Use your OominiEye operator credentials to access the command center.'}
              </Typography>
            </Box>
          </Stack>

          {sessions.length > 0 && !addingAccount && (
            <>
              <List disablePadding sx={{ borderRadius: '14px', overflow: 'hidden', bgcolor: 'action.hover' }}>
                {sessions.map((s) => (
                  <ListItemButton
                    key={s.user.id}
                    onClick={() => {
                      switchAccount(s.user.id)
                      navigate('/earth', { replace: true })
                    }}
                    sx={{ borderRadius: 0 }}
                  >
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: s.user.avatarColor, width: 36, height: 36, fontSize: 14, fontWeight: 700 }}>
                        {initials(s.user.displayName)}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText primary={s.user.displayName} secondary={`${s.user.role} · signed in`} />
                    <ArrowForwardIosRoundedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                  </ListItemButton>
                ))}
              </List>
              <Divider>
                <Typography variant="caption" color="text.secondary">
                  or sign in with another account
                </Typography>
              </Divider>
            </>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Stack spacing={1.5}>
              <TextField
                label="Username"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <PersonRoundedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
              />
              <TextField
                label="Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <LockRoundedIcon fontSize="small" />
                      </InputAdornment>
                    ),
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small"
                          edge="end"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                          onClick={() => setShowPassword((v) => !v)}
                        >
                          {showPassword ? <VisibilityOffRoundedIcon fontSize="small" /> : <VisibilityRoundedIcon fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              {error && (
                <Alert severity="error" variant="filled" sx={{ borderRadius: '12px' }}>
                  {error}
                </Alert>
              )}
              <Button type="submit" size="large" variant="contained" loading={busy} fullWidth sx={{ mt: 0.5 }}>
                {addingAccount ? 'Add account' : 'Sign in'}
              </Button>
              {addingAccount && (
                <Button variant="text" onClick={() => navigate(-1)}>
                  Cancel
                </Button>
              )}
            </Stack>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Demo accounts — tap to fill
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {DEMO_ACCOUNTS.map((a) => (
                <Chip
                  key={a.username}
                  size="small"
                  variant="outlined"
                  label={`${a.username} · ${a.role}`}
                  onClick={() => fillDemo(a.username, a.password)}
                />
              ))}
            </Stack>
          </Box>
        </Stack>
      </Paper>

      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center' }}
      >
        © 2026 OominiEye. All rights reserved.
      </Typography>
    </Box>
  )
}
