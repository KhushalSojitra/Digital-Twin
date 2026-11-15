import { respondWithSession, route } from './_lib/route.js'

export default route('GET', async (ctx) => {
  respondWithSession(ctx, ctx.state)
})
