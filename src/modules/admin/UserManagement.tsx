import { Avatar, Chip, Paper, Stack, Typography } from '@mui/material'
import { DEMO_USERS } from '../../auth/users'
import { initials } from '../../utils/format'

export default function UserManagement() {
  return (
    <Stack spacing={1.25}>
      <Typography variant="body2" color="text.secondary">
        Demo directory used for sign-in, assignment and watchers.
      </Typography>
      {DEMO_USERS.map((user) => (
        <Paper key={user.id} elevation={0} sx={(t) => ({ p: 1.5, borderRadius: '14px', border: `1px solid ${t.palette.divider}` })}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
            <Avatar sx={{ bgcolor: user.avatarColor, fontWeight: 700 }}>{initials(user.displayName)}</Avatar>
            <Stack sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle2">{user.displayName}</Typography>
              <Typography variant="caption" color="text.secondary">
                {user.email} · {user.username}
              </Typography>
            </Stack>
            <Chip size="small" label={user.role} />
          </Stack>
        </Paper>
      ))}
    </Stack>
  )
}
