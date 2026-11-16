import { getPublicUser } from './_lib/config.js'
import { roleMayRun } from './_lib/policy.js'
import { fail, route } from './_lib/route.js'
import { sendJson } from './_lib/http.js'
import { callAdminRpc, describeAdminConfig, SupabaseAdminError } from './_lib/supabaseAdmin.js'

const FLAGS = ['pre_approval', 'post_approval', 'on_hold', 'reopen', 'pass_on'] as const
const ACTION_ID = /^[a-z0-9_]{1,64}$/

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length <= max ? value : null
}

function configFrom(value: unknown): Record<string, boolean> | null {
  if (typeof value !== 'object' || value === null) return null
  const input = value as Record<string, unknown>
  const config: Record<string, boolean> = {}
  for (const flag of FLAGS) {
    if (typeof input[flag] !== 'boolean') return null
    config[flag] = input[flag] as boolean
  }
  return config
}

function statusFor(error: SupabaseAdminError): { code: string; status: number } {
  if (error.status === 503) return { code: 'not_configured', status: 503 }
  if (error.status === 409) return { code: 'migration_required', status: 409 }
  return { code: 'rejected', status: error.status }
}

/**
 * Every ticket-type and ticket-workflow mutation. The acting user and role come from the signed
 * session cookie, never from the request body, and the database functions re-check the role. The
 * browser has no database permission for any of these operations.
 */
export default route('POST', async (ctx) => {
  const actor = ctx.state.a ? getPublicUser(ctx.state.a) : null
  if (!actor || !ctx.state.s.some((entry) => entry.u === actor.id)) {
    fail(ctx.res, 401, 'not_signed_in', 'Sign in to continue.')
    return
  }

  const input = ctx.body as Record<string, unknown> | undefined
  if (!input || typeof input !== 'object') {
    fail(ctx.res, 400, 'invalid_input', 'Invalid request.')
    return
  }

  // Viewers are read-only for Ticket Types and ticket changes. Workflow actions are open to every role because
  // the database only lets the ticket's current assignee or reporter run them (see apply_workflow_action).
  const operation = input.action === 'workflow' ? 'workflow' : input.action === 'change' ? 'change_type' : input.action === 'status' ? 'read_status' : 'manage_types'
  if (!roleMayRun(actor.role, operation)) {
    fail(ctx.res, 403, 'forbidden', 'Your role is not allowed to do this.')
    return
  }

  const identity = { p_actor: actor.displayName, p_role: actor.role }

  try {
    switch (input.action) {
      case 'status': {
        const config = describeAdminConfig()
        let revision: number | null = null
        let securityVerified = false
        if (config.configured) {
          try {
            const status = (await callAdminRpc('ticket_type_hardening_status', {})) as Record<string, unknown> | null
            revision = typeof status?.revision === 'number' ? status.revision : null
            const securityFlags = [
              status?.browser_can_run_workflow_actions,
              status?.browser_can_read_type_changes,
              status?.anon_can_read_tickets,
              status?.browser_can_write_tickets,
              status?.anon_can_access_history,
              status?.authenticated_can_access_history,
              status?.anon_can_run_legacy_workflow_admin,
              status?.authenticated_can_run_legacy_workflow_admin,
              status?.anon_can_access_deletion_audit,
              status?.authenticated_can_access_deletion_audit,
            ]
            securityVerified = securityFlags.length === 10 && securityFlags.every((flag) => flag === false)
          } catch (error) {
            if (!(error instanceof SupabaseAdminError) || error.code !== 'function_missing') throw error
          }
        }
        sendJson(ctx.res, 200, { data: { ...config, migrated: revision === 3 && securityVerified === true, revision, securityVerified: securityVerified === true } })
        return
      }
      case 'create': {
        const label = text(input.label, 80)
        const description = text(input.description, 500)
        const config = configFrom(input.config)
        if (!label || description === null || !config) break
        const data = await callAdminRpc('create_ticket_type_secure', { p_label: label, p_description: description, p_config: config, ...identity })
        sendJson(ctx.res, 200, { data })
        return
      }
      case 'update': {
        const key = text(input.key, 80)
        const label = text(input.label, 80)
        const description = text(input.description, 500)
        const config = configFrom(input.config)
        if (!key || !label || description === null || !config) break
        const data = await callAdminRpc('update_ticket_type_secure', { p_key: key, p_label: label, p_description: description, p_config: config, ...identity })
        sendJson(ctx.res, 200, { data })
        return
      }
      case 'delete': {
        const key = text(input.key, 80)
        if (!key) break
        await callAdminRpc('delete_ticket_type_secure', { p_key: key, ...identity })
        sendJson(ctx.res, 200, { data: null })
        return
      }
      case 'change': {
        const ticketId = text(input.ticketId, 120)
        const typeKey = text(input.typeKey, 80)
        const reason = text(input.reason, 500)
        if (!ticketId || !typeKey || !reason || !reason.trim()) break
        const data = await callAdminRpc('change_ticket_type_secure', { p_ticket_id: ticketId, p_new_type: typeKey, p_reason: reason, ...identity })
        sendJson(ctx.res, 200, { data })
        return
      }
      case 'workflow': {
        const ticketId = text(input.ticketId, 120)
        const actionId = text(input.actionId, 64)
        const assignee = input.assignee === undefined || input.assignee === null ? null : text(input.assignee, 120)
        const note = input.note === undefined || input.note === null ? null : text(input.note, 2000)
        if (!ticketId || !actionId || !ACTION_ID.test(actionId) || (input.assignee != null && assignee === null) || (input.note != null && note === null)) break
        // No fallback to the legacy function: it must never run without the hardened participant checks.
        const data = await callAdminRpc('apply_workflow_action_secure', { p_ticket_id: ticketId, p_action_id: actionId, p_new_assignee: assignee, p_note: note, ...identity })
        sendJson(ctx.res, 200, { data })
        return
      }
      case 'history': {
        const ticketId = text(input.ticketId, 120)
        if (!ticketId) break
        const data = await callAdminRpc('get_ticket_type_changes_secure', { p_ticket_id: ticketId, ...identity })
        sendJson(ctx.res, 200, { data })
        return
      }
      default:
        break
    }
  } catch (error) {
    if (error instanceof SupabaseAdminError) {
      const { code, status } = statusFor(error)
      fail(ctx.res, status, code, error.message)
      return
    }
    throw error
  }

  fail(ctx.res, 400, 'invalid_input', 'Invalid request.')
})
