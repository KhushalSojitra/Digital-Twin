import { getPublicUser } from './_lib/config.js'
import { mintDbToken, readDbTokenSecret } from './_lib/dbToken.js'
import { fail, route } from './_lib/route.js'
import { sendJson } from './_lib/http.js'

/**
 * Gives the signed-in browser a short-lived database token for ticket reads, realtime,
 * and account-scoped interface preferences. Anonymous visitors receive no token.
 */
export default route('GET', async (ctx) => {
  const actor = ctx.state.a ? getPublicUser(ctx.state.a) : null
  if (!actor || !ctx.state.s.some((entry) => entry.u === actor.id)) {
    fail(ctx.res, 401, 'not_signed_in', 'Sign in to continue.')
    return
  }
  const secret = readDbTokenSecret()
  if (!secret) {
    console.error('APP_SUPABASE_JWT_SECRET is missing or shorter than 32 characters; database reads are disabled.')
    fail(ctx.res, 503, 'not_configured', 'Database access is not configured on the server.')
    return
  }
  const { token, expiresAt } = mintDbToken(
    { id: actor.id, role: actor.role, userName: actor.id },
    secret,
    ctx.now,
  )
  sendJson(ctx.res, 200, { data: { token, expiresAt } })
})
