import { findAccountByUsername, getAccountPassword, getSessionTtlMs } from './_lib/config.js'
import { getClientIp } from './_lib/http.js'
import { fail, respondWithSession, route } from './_lib/route.js'
import { safeEqualStrings } from './_lib/tokens.js'

const MAX_USERNAME_LENGTH = 64
const MAX_PASSWORD_LENGTH = 256
const MAX_FAILURES = 5
const FAILURE_WINDOW_MS = 15 * 60 * 1000
const MAX_TRACKED_KEYS = 1000
const DUMMY_PASSWORD = 'not-a-real-password'

// Best-effort throttle: state lives in one function instance, so it slows guessing but is not a global limit.
const failures = new Map<string, { count: number; windowStart: number }>()

function pruneFailures(now: number): void {
  if (failures.size < MAX_TRACKED_KEYS) return
  for (const [key, record] of failures) {
    if (now - record.windowStart > FAILURE_WINDOW_MS) failures.delete(key)
  }
  if (failures.size >= MAX_TRACKED_KEYS) failures.clear()
}

export default route('POST', async (ctx) => {
  const { res, now } = ctx
  const input = ctx.body as { username?: unknown; password?: unknown } | undefined

  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.username !== 'string' ||
    typeof input.password !== 'string' ||
    input.username.trim() === '' ||
    input.password === ''
  ) {
    fail(res, 400, 'invalid_input', 'Enter both your username and password.')
    return
  }
  if (input.username.length > MAX_USERNAME_LENGTH || input.password.length > MAX_PASSWORD_LENGTH) {
    fail(res, 400, 'invalid_input', 'Username or password is too long.')
    return
  }

  const username = input.username.trim().toLowerCase()
  const throttleKey = `${getClientIp(ctx.req)}|${username}`
  const record = failures.get(throttleKey)
  if (record && now - record.windowStart < FAILURE_WINDOW_MS && record.count >= MAX_FAILURES) {
    res.setHeader('Retry-After', String(Math.ceil((record.windowStart + FAILURE_WINDOW_MS - now) / 1000)))
    fail(res, 429, 'too_many_attempts', 'Too many failed attempts. Try again in a few minutes.')
    return
  }

  const account = findAccountByUsername(username)
  const expected = account ? getAccountPassword(account) : null
  // Always compare so a missing account or unset password takes the same path as a wrong password.
  const passwordMatches = safeEqualStrings(input.password, expected ?? DUMMY_PASSWORD)

  if (!account || !expected || !passwordMatches) {
    if (account && !expected) console.error(`Login unavailable: password env var for "${account.username}" is not set.`)
    pruneFailures(now)
    const fresh = record && now - record.windowStart < FAILURE_WINDOW_MS ? record : { count: 0, windowStart: now }
    failures.set(throttleKey, { count: fresh.count + 1, windowStart: fresh.windowStart })
    fail(res, 401, 'invalid_credentials', 'Incorrect username or password.')
    return
  }

  failures.delete(throttleKey)
  const others = ctx.state.s.filter((entry) => entry.u !== account.id)
  respondWithSession(ctx, {
    v: 1,
    a: account.id,
    s: [...others, { u: account.id, iat: now, exp: now + getSessionTtlMs() }],
  })
})
