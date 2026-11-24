import { Avatar, Box, Stack, Typography } from '@mui/material'
import { DEMO_USERS } from '../../auth/users'
import { initials } from '../../utils/format'
import { NeutralChip, glassCardSx } from '../../components/ui/figma'

export default function UserManagement() {
  return (
    <Stack spacing={1.25}>
      {DEMO_USERS.map((user) => (
        <Box key={user.id} sx={(t) => ({ ...glassCardSx(t), px: 1.75, py: 1.25 })}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Avatar sx={{ width: 36, height: 36, bgcolor: user.avatarColor, fontSize: 13, fontWeight: 600 }}>{initials(user.displayName)}</Avatar>
            <Stack sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="subtitle2">{user.displayName}</Typography>
              <Typography variant="caption" color="text.secondary">
                {user.email} · {user.username}
              </Typography>
            </Stack>
            <NeutralChip label={user.role} />
          </Stack>
        </Box>
      ))}
    </Stack>
  )
}
