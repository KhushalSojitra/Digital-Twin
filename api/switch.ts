import { fail, respondWithSession, route } from './_lib/route.js'

export default route('POST', async (ctx) => {
  const input = ctx.body as { userId?: unknown } | undefined
  if (!input || typeof input !== 'object' || typeof input.userId !== 'string') {
    fail(ctx.res, 400, 'invalid_input', 'Invalid request.')
    return
  }
  // The account must already hold a valid server-issued session; the client cannot pick an arbitrary identity.
  if (!ctx.state.s.some((entry) => entry.u === input.userId)) {
    fail(ctx.res, 403, 'not_signed_in', 'That account is not signed in.')
    return
  }
  respondWithSession(ctx, { ...ctx.state, a: input.userId })
})
