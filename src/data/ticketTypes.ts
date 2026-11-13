import { TYPE_LABEL } from './tickets'

/** A ticket type and the workflow every ticket of that type starts on. */
export interface TicketTypeDef {
  key: string
  label: string
  description: string
  /** Built-in types cannot be renamed, edited or deleted. */
  isSystem: boolean
  /** Null until the ticket_types table is set up in the database. */
  workflowTemplateId: string | null
}

export function parseTicketType(row: Record<string, unknown>): TicketTypeDef | null {
  if (typeof row.key !== 'string' || typeof row.label !== 'string') return null
  return {
    key: row.key,
    label: row.label,
    description: typeof row.description === 'string' ? row.description : '',
    isSystem: row.is_system === true,
    workflowTemplateId: row.workflow_template_id == null ? null : String(row.workflow_template_id),
  }
}

/** Shown until the ticket_types table is available, so ticket creation keeps working. */
export const BUILT_IN_TICKET_TYPES: TicketTypeDef[] = Object.entries(TYPE_LABEL).map(([key, label]) => ({
  key,
  label,
  description: '',
  isSystem: true,
  workflowTemplateId: null,
}))

export function humanizeTypeKey(key: string) {
  const words = key.replace(/_/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key
}
