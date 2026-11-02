import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../supabaseClient'
import { STATUS_LABEL, type Ticket } from '../data/tickets'
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
  /** Creates a customer template, or publishes the edit of one (a new version once tickets use it). */
  saveTemplate: (templateId: string | null, name: string, description: string, definition: WorkflowDefinition) => Promise<void>
  activateTemplate: (templateId: string) => Promise<void>
  deleteTemplate: (templateId: string) => Promise<void>
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
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [templateResult, versionResult] = await Promise.all([
      supabase.from('workflow_templates').select('*').order('created_at', { ascending: true }),
      supabase.from('workflow_versions').select('*').order('version', { ascending: false }),
    ])
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

  const saveTemplate = useCallback<WorkflowValue['saveTemplate']>(async (templateId, name, description, definition) => {
    const { error } = await supabase.rpc('save_workflow_template', {
      p_template_id: templateId,
      p_name: name,
      p_description: description,
      p_definition: definition,
    })
    if (error) throw new Error(describeError(error))
    await refresh()
  }, [refresh])

  const activateTemplate = useCallback(async (templateId: string) => {
    const { error } = await supabase.rpc('activate_workflow_template', { p_template_id: templateId })
    if (error) throw new Error(describeError(error))
    await refresh()
  }, [refresh])

  const deleteTemplate = useCallback(async (templateId: string) => {
    const { error } = await supabase.rpc('delete_workflow_template', { p_template_id: templateId })
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
      saveTemplate,
      activateTemplate,
      deleteTemplate,
      versionFor,
      stateLabel: (ticket) => stateOf(versionFor(ticket)?.definition, ticket.workflowState)?.label ?? STATUS_LABEL[ticket.status],
      actionsFor: (ticket) => actionsFrom(versionFor(ticket)?.definition, ticket.workflowState),
      canAct: (ticket, me) => Boolean(me) && (ticket.assignee === me || ticket.creator === me),
    }
  }, [templates, loading, refresh, saveTemplate, activateTemplate, deleteTemplate])

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>
}

export function useWorkflow() {
  const ctx = useContext(WorkflowContext)
  if (!ctx) throw new Error('useWorkflow must be used within WorkflowProvider')
  return ctx
}
