import { getPublicUser } from './_lib/config.js'
import { mintDbToken, readDbTokenSecret } from './_lib/dbToken.js'
import { fail, route } from './_lib/route.js'
import { sendJson } from './_lib/http.js'

/**
 * Gives the signed-in browser a short-lived database token so it can READ tickets (and receive realtime
 * updates) as the `authenticated` role. Anonymous visitors get no token and therefore no ticket data.
 */
export default route('GET', async (ctx) => {
  const actor = ctx.state.a ? getPublicUser(ctx.state.a) : null
  if (!actor || !ctx.state.s.some((entry) => entry.u === actor.id)) {
    fail(ctx.res, 401, 'not_signed_in', 'Sign in to continue.')
    return
  }
  const secret = readDbTokenSecret()
  if (!secret) {
    console.error('APP_SUPABASE_JWT_SECRET is missing or shorter than 32 characters; ticket reads are disabled.')
    fail(ctx.res, 503, 'not_configured', 'Ticket access is not configured on the server.')
    return
  }
  const { token, expiresAt } = mintDbToken({ id: actor.id, role: actor.role }, secret, ctx.now)
  sendJson(ctx.res, 200, { data: { token, expiresAt } })
})
