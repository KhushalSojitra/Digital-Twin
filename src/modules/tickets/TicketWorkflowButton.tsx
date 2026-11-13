import { useState } from 'react'
import { IconButton, Tooltip } from '@mui/material'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import WorkflowSettingsDialog from './WorkflowSettingsDialog'
import { useWorkflow } from '../../state/WorkflowContext'
import { useTickets } from '../../state/TicketsContext'
import { useAuth } from '../../auth/AuthContext'
import type { Ticket } from '../../data/tickets'

interface Props {
  /** The ticket whose workflow is managed. Omit while a ticket is still being created. */
  ticket?: Ticket
  /** Workflow chosen so far for a ticket that is being created (undefined = the default workflow). */
  draftTemplateId?: string
  onDraftTemplateChange?: (templateId: string | undefined) => void
}

export default function TicketWorkflowButton({ ticket, draftTemplateId, onDraftTemplateChange }: Props) {
  const [open, setOpen] = useState(false)
  const { activeTemplate, versionFor } = useWorkflow()
  const { setWorkflow } = useTickets()
  const { currentUser } = useAuth()
  const canChange = currentUser?.role !== 'Viewer'
  const me = currentUser?.displayName ?? 'Operator'

  const selectedTemplateId = ticket ? (versionFor(ticket)?.templateId ?? null) : (draftTemplateId ?? activeTemplate?.id ?? null)

  const selectTemplate = !canChange
    ? undefined
    : ticket
      ? (templateId: string) => setWorkflow(ticket.id, templateId, me)
      : async (templateId: string) => onDraftTemplateChange?.(templateId === activeTemplate?.id ? undefined : templateId)

  return (
    <>
      <Tooltip title="Workflow management" placement="bottom">
        <IconButton onClick={() => setOpen(true)} aria-label="Workflow management">
          <SettingsRoundedIcon />
        </IconButton>
      </Tooltip>
      {open && (
        <WorkflowSettingsDialog open onClose={() => setOpen(false)} selectedTemplateId={selectedTemplateId} onSelectTemplate={selectTemplate} />
      )}
    </>
  )
}
