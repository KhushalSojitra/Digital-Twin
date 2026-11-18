import { getPublicUser } from './_lib/config.js'
import { roleMayRun, type TicketOperation } from './_lib/policy.js'
import { fail, route } from './_lib/route.js'
import { sendJson } from './_lib/http.js'
import { callAdminRpc, getTicketAttachmentObjectPaths, removeTicketAttachmentObjects, SupabaseAdminError } from './_lib/supabaseAdmin.js'

const PRIORITIES = ['critical', 'high', 'medium', 'low']
const ID = /^[A-Za-z0-9_-]{1,120}$/
const FOLLOWER_OPS = ['toggle', 'add', 'remove', 'share']

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length <= max ? value : null
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function people(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 50) return null
  return value.every((entry) => typeof entry === 'string' && entry.length > 0 && entry.length <= 120) ? (value as string[]) : null
}

function statusFor(error: SupabaseAdminError): { code: string; status: number } {
  if (error.status === 503) return { code: 'not_configured', status: 503 }
  if (error.code === 'function_missing') return { code: 'migration_required', status: 409 }
  return { code: 'rejected', status: error.status }
}

/**
 * Every ticket write the browser used to make directly. The acting person and role come from the signed
 * session, never from the body; the database functions re-check the role and write as the table owner.
 * Browsers have no write privilege on public.tickets at all once ticket_type_hardening.sql is applied.
 */
export default route(
  'POST',
  async (ctx) => {
    const actor = ctx.state.a ? getPublicUser(ctx.state.a) : null
    if (!actor || !ctx.state.s.some((entry) => entry.u === actor.id)) {
      fail(ctx.res, 401, 'not_signed_in', 'Sign in to continue.')
      return
    }
    const input = object(ctx.body)
    if (!input) {
      fail(ctx.res, 400, 'invalid_input', 'Invalid request.')
      return
    }

    const identity = { p_actor: actor.displayName, p_role: actor.role }
    const operations: Record<string, TicketOperation> = {
      create: 'create',
      details: 'details',
      delete: 'delete',
      snapshot: 'snapshot',
      comment: 'comment',
      followers: 'followers',
    }
    const operation = typeof input.action === 'string' ? operations[input.action] : undefined
    if (!operation) {
      fail(ctx.res, 400, 'invalid_input', 'Invalid request.')
      return
    }
    if (!roleMayRun(actor.role, operation)) {
      fail(ctx.res, 403, 'forbidden', 'Your role is not allowed to do this.')
      return
    }

    const ticketId = text(input.ticketId, 120)
    try {
      switch (input.action) {
        case 'create': {
          const ticket = object(input.ticket)
          const typeKey = text(input.typeKey, 80)
          const title = ticket ? text(ticket.title, 300) : null
          const description = ticket ? text(ticket.description, 10000) : null
          const priority = ticket ? text(ticket.priority, 20) : null
          const assignee = ticket ? text(ticket.assignee, 120) : null
          const cameraName = ticket ? text(ticket.camera_name, 200) : null
          const id = ticket ? text(ticket.id, 120) : null
          const coordinates = ticket ? object(ticket.ptz_coordinates) : null
          if (!ticket || !typeKey || !title?.trim() || description === null || !priority || !PRIORITIES.includes(priority)
              || assignee === null || cameraName === null || !id || !ID.test(id) || !coordinates) break
          const data = await callAdminRpc('create_ticket_secure', {
            p_ticket: { id, title, description, priority, assignee, camera_name: cameraName, ptz_coordinates: coordinates },
            p_type_key: typeKey,
            ...identity,
          })
          sendJson(ctx.res, 200, { data })
          return
        }
        case 'details': {
          const title = text(input.title, 300)
          const description = text(input.description, 10000)
          const priority = text(input.priority, 20)
          const additional = input.additional === undefined || input.additional === null ? null : object(input.additional)
          const snapshot = input.creationSnapshot === undefined || input.creationSnapshot === null ? null : object(input.creationSnapshot)
          if (!ticketId || !title?.trim() || description === null || !priority || !PRIORITIES.includes(priority)
              || (input.additional != null && !additional) || (input.creationSnapshot != null && !snapshot)) break
          const data = await callAdminRpc('update_ticket_details_secure', {
            p_ticket_id: ticketId,
            p_title: title,
            p_description: description,
            p_priority: priority,
            p_additional: additional,
            p_creation_snapshot: snapshot,
            ...identity,
          })
          sendJson(ctx.res, 200, { data })
          return
        }
        case 'comment': {
          const body = text(input.text, 5000)
          const attachments = input.attachments === undefined || input.attachments === null ? [] : input.attachments
          if (!ticketId || body === null || !Array.isArray(attachments) || attachments.length > 20 || (!body.trim() && attachments.length === 0)) break
          const commentId = input.commentId === undefined ? null : text(input.commentId, 120)
          const replyTo = input.replyTo === undefined ? null : text(input.replyTo, 160)
          if ((input.commentId !== undefined && !commentId?.match(ID)) || (input.replyTo !== undefined && !replyTo)) break
          const base = { p_ticket_id: ticketId, p_text: body, p_attachments: attachments, ...identity }
          let data: unknown
          try {
            data = await callAdminRpc('add_ticket_comment_secure', {
              ...base,
              ...(commentId ? { p_id: commentId } : {}),
              ...(replyTo ? { p_reply_to: replyTo } : {}),
            })
          } catch (error) {
            // Until comment_threading_patch.sql is applied the function only knows the original arguments:
            // post the comment without its threading data rather than failing it.
            if (!(error instanceof SupabaseAdminError) || error.code !== 'function_missing' || (!commentId && !replyTo)) throw error
            data = await callAdminRpc('add_ticket_comment_secure', base)
          }
          sendJson(ctx.res, 200, { data })
          return
        }
        case 'followers': {
          const op = text(input.op, 20)
          const list = people(input.people ?? [])
          if (!ticketId || !op || !FOLLOWER_OPS.includes(op) || !list) break
          const data = await callAdminRpc('update_ticket_followers_secure', {
            p_ticket_id: ticketId,
            p_op: op,
            p_people: list,
            ...identity,
          })
          sendJson(ctx.res, 200, { data })
          return
        }
        case 'snapshot': {
          const slot = text(input.slot, 10)
          const snapshot = object(input.snapshot)
          if (!ticketId || (slot !== 'before' && slot !== 'after') || !snapshot) break
          const data = await callAdminRpc('attach_ticket_snapshot_secure', {
            p_ticket_id: ticketId,
            p_slot: slot,
            p_snapshot: snapshot,
            ...identity,
          })
          sendJson(ctx.res, 200, { data })
          return
        }
        case 'delete': {
          if (!ticketId || !ID.test(ticketId)) break
          // Read the attachment object paths while the ticket row still exists.
          const attachmentPaths = await getTicketAttachmentObjectPaths(ticketId)
          await callAdminRpc('delete_ticket_secure', { p_ticket_id: ticketId, ...identity })
          // The database deletion is authoritative and permanent. Storage cleanup follows it; a cleanup
          // failure is logged so the UI does not report a failed deletion after the ticket is already gone.
          try {
            await removeTicketAttachmentObjects(attachmentPaths)
          } catch (cleanupError) {
            console.error('Ticket deleted; attachment cleanup needs follow-up:', ticketId,
              cleanupError instanceof Error ? cleanupError.message : 'unknown error')
          }
          sendJson(ctx.res, 200, { data: null })
          return
        }
        default:
          break
      }
    } catch (error) {
      if (error instanceof SupabaseAdminError) {
        const { code, status } = statusFor(error)
        fail(ctx.res, status, code, error.code === 'function_missing' ? 'This needs the database update (supabase/ticket_type_hardening.sql) to be applied first.' : error.message)
        return
      }
      throw error
    }

    fail(ctx.res, 400, 'invalid_input', 'Invalid request.')
  },
  // Ticket snapshots are embedded images; Vercel itself caps request bodies at 4.5 MB.
  { maxBodyBytes: 4_000_000 },
)
