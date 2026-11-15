import type { ReactNode } from 'react'
import { IconButton, Tooltip } from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'

interface InfoTipProps {
  /** Accessible name of the icon button. */
  label: string
  children: ReactNode
}

export default function InfoTip({ label, children }: InfoTipProps) {
  return (
    <Tooltip title={children} arrow placement="top" enterTouchDelay={0} leaveTouchDelay={5000}>
      <IconButton size="small" aria-label={label} sx={{ p: 0.25, color: 'text.secondary' }}>
        <InfoOutlinedIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Tooltip>
  )
}
