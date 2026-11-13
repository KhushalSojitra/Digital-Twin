import { useState } from 'react'
import { IconButton, Tooltip } from '@mui/material'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import WorkflowSettingsDialog from './WorkflowSettingsDialog'
import { useAuth } from '../../auth/AuthContext'
import type { Ticket } from '../../data/tickets'
import { DEFAULT_TICKET_TYPE_KEY } from '../../data/ticketTypes'

interface Props {
  /** The ticket whose ticket type is shown. Omit while a ticket is still being created. */
  ticket?: Ticket
  /** Ticket type chosen so far for a ticket that is being created. */
  draftType?: string
  onDraftTypeChange?: (typeKey: string) => void
}

export default function TicketWorkflowButton({ ticket, draftType, onDraftTypeChange }: Props) {
  const [open, setOpen] = useState(false)
  const { currentUser } = useAuth()
  const canChange = currentUser?.role !== 'Viewer'

  const selectedTypeKey = ticket ? ticket.type : (draftType ?? DEFAULT_TICKET_TYPE_KEY)
  const onSelectType = !ticket && canChange ? onDraftTypeChange : undefined

  return (
    <>
      <Tooltip title="Workflow management" placement="bottom">
        <IconButton onClick={() => setOpen(true)} aria-label="Workflow management">
          <SettingsRoundedIcon />
        </IconButton>
      </Tooltip>
      {open && <WorkflowSettingsDialog open onClose={() => setOpen(false)} selectedTypeKey={selectedTypeKey} onSelectType={onSelectType} />}
    </>
  )
}
