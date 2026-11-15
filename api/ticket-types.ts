import { getPublicUser } from './_lib/config.js'
import { fail, route } from './_lib/route.js'
import { sendJson } from './_lib/http.js'
import { callAdminRpc, SupabaseAdminError } from './_lib/supabaseAdmin.js'

const FLAGS = ['pre_approval', 'post_approval', 'on_hold', 'reopen', 'pass_on'] as const

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

/**
 * Mutations of ticket types and ticket workflows. The acting user and role come from the signed
 * session cookie, never from the request body, and the database functions re-check the role.
 */
export default route('POST', async (ctx) => {
  const actor = ctx.state.a ? getPublicUser(ctx.state.a) : null
  if (!actor || !ctx.state.s.some((entry) => entry.u === actor.id)) {
    fail(ctx.res, 401, 'not_signed_in', 'Sign in to continue.')
    return
  }
  if (actor.role === 'Viewer') {
    fail(ctx.res, 403, 'forbidden', 'Your role is not allowed to do this.')
    return
  }

  const input = ctx.body as Record<string, unknown> | undefined
  if (!input || typeof input !== 'object') {
    fail(ctx.res, 400, 'invalid_input', 'Invalid request.')
    return
  }

  const identity = { p_actor: actor.displayName, p_role: actor.role }

  try {
    switch (input.action) {
      case 'create': {
        const label = text(input.label, 80)
        const description = text(input.description, 500)
        const config = configFrom(input.config)
        if (!label || description === null || !config) break
        sendJson(ctx.res, 200, { data: await callAdminRpc('create_ticket_type_secure', { p_label: label, p_description: description, p_config: config, ...identity }) })
        return
      }
      case 'update': {
        const key = text(input.key, 80)
        const label = text(input.label, 80)
        const description = text(input.description, 500)
        const config = configFrom(input.config)
        if (!key || !label || description === null || !config) break
        sendJson(ctx.res, 200, { data: await callAdminRpc('update_ticket_type_secure', { p_key: key, p_label: label, p_description: description, p_config: config, ...identity }) })
        return
      }
      case 'delete': {
        const key = text(input.key, 80)
        if (!key) break
        await callAdminRpc('delete_ticket_type_secure', { p_key: key, ...identity })
        sendJson(ctx.res, 200, { data: null })
        return
      }
      case 'apply': {
        const ticketId = text(input.ticketId, 120)
        const typeKey = text(input.typeKey, 80)
        if (!ticketId || !typeKey) break
        sendJson(ctx.res, 200, { data: await callAdminRpc('apply_ticket_type_secure', { p_ticket_id: ticketId, p_type_key: typeKey, ...identity }) })
        return
      }
      case 'change': {
        const ticketId = text(input.ticketId, 120)
        const typeKey = text(input.typeKey, 80)
        const reason = text(input.reason, 500)
        if (!ticketId || !typeKey || !reason || !reason.trim()) break
        sendJson(ctx.res, 200, { data: await callAdminRpc('change_ticket_type_secure', { p_ticket_id: ticketId, p_new_type: typeKey, p_reason: reason, ...identity }) })
        return
      }
      default:
        break
    }
  } catch (error) {
    if (error instanceof SupabaseAdminError) {
      fail(ctx.res, error.status, error.status === 503 ? 'not_configured' : 'rejected', error.message)
      return
    }
    throw error
  }

  fail(ctx.res, 400, 'invalid_input', 'Invalid request.')
})
