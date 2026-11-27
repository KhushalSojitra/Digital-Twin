import { randomUUID } from 'node:crypto'
import { getPublicUser, listUsers, resolveUserRef } from './_lib/config.js'
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

    // The database stores user ids: the actor is the id from the signed session.
    const identity = { p_actor: actor.id, p_role: actor.role }
    const operations: Record<string, TicketOperation> = {
      create: 'create',
      details: 'details',
      delete: 'delete',
      snapshot: 'snapshot',
      comment: 'comment',
      followers: 'followers',
      inbox: 'inbox',
      inbox_count: 'inbox',
      inbox_tickets: 'inbox',
      related_tickets: 'inbox',
      inbox_all: 'inbox',
      resolve_subtasks: 'workflow',
      change_assignee: 'workflow',
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
          // People arrive as names from the browser; the database stores ids.
          const metadata = object(coordinates.metadata)
          const followerRefs = metadata ? people(metadata.followers ?? []) : []
          const ptz = metadata && followerRefs
            ? { ...coordinates, metadata: { ...metadata, followers: followerRefs.map(resolveUserRef) } }
            : coordinates
          const data = await callAdminRpc('create_ticket_secure', {
            p_ticket: { id, title, description, priority, assignee: resolveUserRef(assignee), camera_name: cameraName, ptz_coordinates: ptz },
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
          // Every comment, plain or reply, gets an id; the browser sends one and the server fills it in otherwise.
          const commentId = input.commentId === undefined || input.commentId === null ? randomUUID() : text(input.commentId, 120)
          const replyTo = input.replyTo === undefined || input.replyTo === null ? null : text(input.replyTo, 160)
          if (!commentId || !ID.test(commentId) || (input.replyTo != null && !replyTo)) break
          // Mentions are stored as user ids. The browser sends them; older clients only send text, so fall back
          // to matching "@Display Name" in the text against the directory.
          const sentMentions = input.mentions === undefined || input.mentions === null ? null : people(input.mentions)
          if (input.mentions != null && !sentMentions) break
          const lower = body.toLowerCase()
          const mentionIds = (sentMentions ?? listUsers().filter((u) => lower.includes(`@${u.displayName.toLowerCase()}`)).map((u) => u.displayName))
            .map(resolveUserRef)
          const subtaskFor = input.subtaskFor === undefined || input.subtaskFor === null ? [] : people(input.subtaskFor)
          if (!subtaskFor) break
          // Errors (including a missing or mismatched database function) are not swallowed: they reach the
          // catch below and are returned to the browser so the comment form can show them.
          const data = await callAdminRpc('add_ticket_comment_secure', {
            p_ticket_id: ticketId,
            p_text: body,
            p_attachments: attachments,
            ...identity,
            p_comment_id: commentId,
            p_reply_to: replyTo,
            p_mentions: [...new Set(mentionIds)],
            p_subtask_for: subtaskFor.map(resolveUserRef),
          })
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
            p_people: list.map(resolveUserRef),
            ...identity,
          })
          sendJson(ctx.res, 200, { data })
          return
        }
        // Inbox reads. The database creates and resolves inbox items and watchers; the app only reads them,
        // always as the signed-in user taken from the session.
        case 'inbox': {
          const includeResolved = input.includeResolved === true
          const limit = typeof input.limit === 'number' && Number.isInteger(input.limit) && input.limit >= 1 && input.limit <= 500
            ? input.limit
            : 100
          const data = await callAdminRpc('get_inbox_secure', {
            ...identity,
            p_include_resolved: includeResolved,
            p_limit: limit,
          })
          sendJson(ctx.res, 200, { data })
          return
        }
        // Everything the inbox needs in ONE function call (keeps Vercel CPU/invocations low).
        case 'inbox_all': {
          const [items, count, tickets, related] = await Promise.all([
            callAdminRpc('get_inbox_secure', { ...identity, p_include_resolved: false, p_limit: 200 }),
            callAdminRpc('inbox_count_secure', { ...identity }),
            callAdminRpc('inbox_tickets_secure', { ...identity }),
            callAdminRpc('related_tickets_secure', { ...identity }),
          ])
          sendJson(ctx.res, 200, { data: { items, count, tickets, related } })
          return
        }
        case 'inbox_count': {
          const data = await callAdminRpc('inbox_count_secure', { ...identity })
          sendJson(ctx.res, 200, { data })
          return
        }
        case 'inbox_tickets': {
          const data = await callAdminRpc('inbox_tickets_secure', { ...identity })
          sendJson(ctx.res, 200, { data })
          return
        }
        case 'related_tickets': {
          const data = await callAdminRpc('related_tickets_secure', { ...identity })
          sendJson(ctx.res, 200, { data })
          return
        }
        // Closing a main ticket: every open sub-task is marked complete or discarded first.
        case 'resolve_subtasks': {
          const decisions = object(input.decisions)
          if (!ticketId || !decisions || Object.keys(decisions).length > 50
              || !Object.entries(decisions).every(([key, value]) => ID.test(key) && (value === 'complete' || value === 'discard'))) break
          const data = await callAdminRpc('resolve_open_subtasks_secure', { p_ticket_id: ticketId, p_decisions: decisions, ...identity })
          sendJson(ctx.res, 200, { data })
          return
        }
        // Team tab "Change assignee" (replaces Pass On). The database checks who may do it.
        case 'change_assignee': {
          const assignee = resolveUserRef(text(input.assignee, 120) ?? '')
          if (!ticketId || !assignee || assignee.toLowerCase() === 'unassigned') break
          await callAdminRpc('change_ticket_assignee_secure', {
            p_ticket_id: ticketId,
            p_new_assignee: assignee,
            p_note: text(input.note, 2000) ?? null,
            ...identity,
          })
          sendJson(ctx.res, 200, { data: null })
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
