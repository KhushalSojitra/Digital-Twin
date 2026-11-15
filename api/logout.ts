import { fail, respondWithSession, route } from './_lib/route.js'

export default route('POST', async (ctx) => {
  const input = (ctx.body ?? {}) as { userId?: unknown; all?: unknown }
  if (typeof input !== 'object' || (input.userId !== undefined && typeof input.userId !== 'string')) {
    fail(ctx.res, 400, 'invalid_input', 'Invalid request.')
    return
  }

  if (input.all === true) {
    respondWithSession(ctx, { v: 1, a: null, s: [] })
    return
  }

  const target = input.userId ?? ctx.state.a
  const remaining = ctx.state.s.filter((entry) => entry.u !== target)
  const active = ctx.state.a === target ? (remaining.at(-1)?.u ?? null) : ctx.state.a
  respondWithSession(ctx, { v: 1, a: active, s: remaining })
})
