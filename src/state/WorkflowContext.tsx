import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../supabaseClient'
import { STATUS_LABEL, TYPE_LABEL, type Ticket } from '../data/tickets'
import { BUILT_IN_TICKET_TYPES, humanizeTypeKey, parseTicketType, type TicketTypeDef } from '../data/ticketTypes'
import {
  actionsFrom,
  parseVersion,
  stateOf,
  type WorkflowDefinition,
  type WorkflowState,
  type WorkflowTemplate,
  type WorkflowTransition,
  type WorkflowVersion,
} from '../data/workflows'

interface WorkflowValue {
  loading: boolean
  templates: WorkflowTemplate[]
  activeTemplate: WorkflowTemplate | null
  activeVersion: WorkflowVersion | null
  refresh: () => Promise<void>
  /** Every ticket type with the workflow its tickets start on. */
  ticketTypes: TicketTypeDef[]
  /** False until the ticket_types table exists in the database; types are then read-only built-ins. */
  typesAvailable: boolean
  typeLabel: (typeKey: string) => string
  /**
   * Creates a custom ticket type (typeKey null) with its own workflow, or saves the name and workflow of
   * one. Tickets already created keep the workflow version they started with.
   */
  saveTicketType: (typeKey: string | null, label: string, description: string, definition: WorkflowDefinition) => Promise<string>
  deleteTicketType: (typeKey: string) => Promise<void>
  /** Every state defined by any workflow version, active workflow first. Drives tabs and filters. */
  stateOptions: WorkflowState[]
  versionFor: (ticket: Pick<Ticket, 'workflowVersionId'>) => WorkflowVersion | undefined
  /** The workflow's own name for the ticket's current state. */
  stateLabel: (ticket: Pick<Ticket, 'workflowVersionId' | 'workflowState' | 'status'>) => string
  /** Actions the ticket's own workflow version offers from its current state. */
  actionsFor: (ticket: Pick<Ticket, 'workflowVersionId' | 'workflowState'>) => WorkflowTransition[]
  /** Only the assignee and the reporter may change a ticket's state. */
  canAct: (ticket: Pick<Ticket, 'assignee' | 'creator'>, me: string) => boolean
}

const WorkflowContext = createContext<WorkflowValue | null>(null)

function describeError(error: { message: string }) {
  return error.message
}

export function WorkflowProvider({ children }: { children: ReactNode }) {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([])
  const [ticketTypes, setTicketTypes] = useState<TicketTypeDef[]>(BUILT_IN_TICKET_TYPES)
  const [typesAvailable, setTypesAvailable] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [templateResult, versionResult, typeResult] = await Promise.all([
      supabase.from('workflow_templates').select('*').order('created_at', { ascending: true }),
      supabase.from('workflow_versions').select('*').order('version', { ascending: false }),
      supabase.from('ticket_types').select('*').order('created_at', { ascending: true }),
    ])
    if (typeResult.error) {
      console.error('Unable to load ticket types:', typeResult.error.message)
      setTicketTypes(BUILT_IN_TICKET_TYPES)
      setTypesAvailable(false)
    } else {
      const loaded = (typeResult.data ?? []).flatMap((row) => {
        const parsed = parseTicketType(row)
        return parsed ? [parsed] : []
      })
      setTicketTypes([...loaded.filter((type) => type.isSystem), ...loaded.filter((type) => !type.isSystem)])
      setTypesAvailable(true)
    }
    if (templateResult.error) {
      console.error('Unable to load workflow templates:', templateResult.error.message)
      setLoading(false)
      return
    }
    if (versionResult.error) {
      console.error('Unable to load workflow versions:', versionResult.error.message)
      setLoading(false)
      return
    }
    const versions = (versionResult.data ?? []).flatMap((row) => {
      const version = parseVersion(row)
      return version ? [version] : []
    })
    const next = (templateResult.data ?? []).map((row): WorkflowTemplate => ({
      id: String(row.id),
      name: String(row.name),
      description: typeof row.description === 'string' ? row.description : '',
      isSystem: row.is_system === true,
      createdAt: typeof row.created_at === 'string' ? row.created_at : '',
      versions: versions.filter((version) => version.templateId === row.id),
    }))
    setTemplates(next)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const saveTicketType = useCallback<WorkflowValue['saveTicketType']>(async (typeKey, label, description, definition) => {
    let savedKey = typeKey ?? ''
    if (typeKey === null) {
      const { data, error } = await supabase.rpc('create_ticket_type', {
        p_label: label,
        p_description: description,
        p_definition: definition,
      })
      if (error) throw new Error(describeError(error))
      const created = parseTicketType((Array.isArray(data) ? data[0] : data) ?? {})
      savedKey = created?.key ?? ''
    } else {
      const templateId = ticketTypes.find((type) => type.key === typeKey)?.workflowTemplateId
      if (!templateId) throw new Error('This ticket type has no workflow to save.')
      const saved = await supabase.rpc('save_workflow_template', {
        p_template_id: templateId,
        p_name: label,
        p_description: description,
        p_definition: definition,
      })
      if (saved.error) throw new Error(describeError(saved.error))
      const renamed = await supabase.rpc('update_ticket_type', { p_key: typeKey, p_label: label, p_description: description })
      if (renamed.error) throw new Error(describeError(renamed.error))
    }
    await refresh()
    return savedKey
  }, [refresh, ticketTypes])

  const deleteTicketType = useCallback(async (typeKey: string) => {
    const { error } = await supabase.rpc('delete_ticket_type', { p_key: typeKey })
    if (error) throw new Error(describeError(error))
    await refresh()
  }, [refresh])

  const value = useMemo<WorkflowValue>(() => {
    const versionsById = new Map(templates.flatMap((template) => template.versions).map((version) => [version.id, version]))
    const activeTemplate = templates.find((template) => template.versions.some((version) => version.isActive)) ?? null
    const activeVersion = activeTemplate?.versions.find((version) => version.isActive) ?? null
    const versionFor: WorkflowValue['versionFor'] = (ticket) => (ticket.workflowVersionId ? versionsById.get(ticket.workflowVersionId) : undefined)
    const stateOptions: WorkflowState[] = []
    const seen = new Set<string>()
    const orderedVersions = [
      ...(activeVersion ? [activeVersion] : []),
      ...templates.flatMap((template) => template.versions).filter((version) => version.id !== activeVersion?.id),
    ]
    for (const version of orderedVersions) {
      for (const state of version.definition.states) {
        if (seen.has(state.key)) continue
        seen.add(state.key)
        stateOptions.push(state)
      }
    }
    return {
      loading,
      templates,
      activeTemplate,
      activeVersion,
      stateOptions,
      refresh,
      ticketTypes,
      typesAvailable,
      typeLabel: (typeKey) => ticketTypes.find((type) => type.key === typeKey)?.label ?? TYPE_LABEL[typeKey] ?? humanizeTypeKey(typeKey),
      saveTicketType,
      deleteTicketType,
      versionFor,
      stateLabel: (ticket) => stateOf(versionFor(ticket)?.definition, ticket.workflowState)?.label ?? STATUS_LABEL[ticket.status],
      actionsFor: (ticket) => actionsFrom(versionFor(ticket)?.definition, ticket.workflowState),
      canAct: (ticket, me) => Boolean(me) && (ticket.assignee === me || ticket.creator === me),
    }
  }, [templates, loading, refresh, ticketTypes, typesAvailable, saveTicketType, deleteTicketType])

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>
}

export function useWorkflow() {
  const ctx = useContext(WorkflowContext)
  if (!ctx) throw new Error('useWorkflow must be used within WorkflowProvider')
  return ctx
}
