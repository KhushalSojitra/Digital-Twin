import { getPublicUser, getSessionSecret, getSessionTtlMs, type PublicUser } from './config.js'
import {
  BodyError,
  firstHeader,
  getCookieSettings,
  isSameOrigin,
  parseCookies,
  readJsonBody,
  sendJson,
  serializeCookie,
  type ApiRequest,
  type ApiResponse,
  type CookieSettings,
} from './http.js'
import {
  createCsrfToken,
  isValidCsrfToken,
  normalizeSession,
  safeEqualStrings,
  signSession,
  verifySession,
  type SessionPayload,
} from './tokens.js'

export interface RouteContext {
  req: ApiRequest
  res: ApiResponse
  secret: string
  settings: CookieSettings
  now: number
  state: SessionPayload
  csrfToken: string
  /** Parsed JSON body for POST routes (undefined when empty). */
  body: unknown
}

export interface SessionView {
  csrfToken: string
  sessions: { user: PublicUser; signedInAt: string }[]
  activeUserId: string | null
}

type Handler = (ctx: RouteContext) => Promise<void>

function secureHeaders(res: ApiResponse): void {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
}

export function fail(res: ApiResponse, status: number, code: string, error: string): void {
  sendJson(res, status, { code, error })
}

/** Writes the (possibly updated) session cookie and responds with the server-verified session view. */
export function respondWithSession(ctx: RouteContext, nextState: SessionPayload, status = 200): void {
  const state = normalizeSession(nextState, ctx.now)
  const cookies = [serializeCookie(ctx.settings.csrfName, ctx.csrfToken, ctx.settings, Math.floor(getSessionTtlMs() / 1000))]

  if (state.s.length === 0) {
    cookies.push(serializeCookie(ctx.settings.sessionName, '', ctx.settings, 0))
  } else {
    const latestExpiry = Math.max(...state.s.map((entry) => entry.exp))
    const maxAge = Math.max(1, Math.floor((latestExpiry - ctx.now) / 1000))
    cookies.push(serializeCookie(ctx.settings.sessionName, signSession(state, ctx.secret), ctx.settings, maxAge))
  }
  ctx.res.setHeader('Set-Cookie', cookies)

  const sessions = state.s.flatMap((entry) => {
    const user = getPublicUser(entry.u)
    return user ? [{ user, signedInAt: new Date(entry.iat).toISOString() }] : []
  })
  const view: SessionView = { csrfToken: ctx.csrfToken, sessions, activeUserId: state.a }
  sendJson(ctx.res, status, view)
}

export function route(method: 'GET' | 'POST', handler: Handler, options: { maxBodyBytes?: number } = {}) {
  return async function dispatch(req: ApiRequest, res: ApiResponse): Promise<void> {
    secureHeaders(res)

    if (req.method !== method) {
      res.setHeader('Allow', method)
      fail(res, 405, 'method_not_allowed', 'Method not allowed.')
      return
    }

    const secret = getSessionSecret()
    if (!secret) {
      console.error('Authentication is not configured: AUTH_SESSION_SECRET must be set to at least 32 characters.')
      fail(res, 500, 'auth_not_configured', 'Authentication is not configured on the server.')
      return
    }

    try {
      const now = Date.now()
      const settings = getCookieSettings(req)
      const cookies = parseCookies(req.headers.cookie)
      const state = verifySession(cookies[settings.sessionName], secret, now)

      const existingCsrf = cookies[settings.csrfName]
      const hasValidCsrfCookie = isValidCsrfToken(existingCsrf, secret)
      const csrfToken = hasValidCsrfCookie ? existingCsrf : createCsrfToken(secret)

      let body: unknown
      if (method === 'POST') {
        if (!isSameOrigin(req)) {
          fail(res, 403, 'origin_mismatch', 'Cross-origin requests are not allowed.')
          return
        }
        const contentType = firstHeader(req, 'content-type') ?? ''
        if (!contentType.toLowerCase().startsWith('application/json')) {
          fail(res, 415, 'unsupported_media_type', 'Content-Type must be application/json.')
          return
        }
        const headerToken = firstHeader(req, 'x-csrf-token')
        if (!hasValidCsrfCookie || !headerToken || !safeEqualStrings(headerToken, csrfToken)) {
          // Issue a fresh token so the client can retry once after refreshing it.
          res.setHeader('Set-Cookie', serializeCookie(settings.csrfName, csrfToken, settings, Math.floor(getSessionTtlMs() / 1000)))
          fail(res, 403, 'csrf_invalid', 'Your session security token is missing or expired. Please try again.')
          return
        }
        body = await readJsonBody(req, options.maxBodyBytes)
      }

      await handler({ req, res, secret, settings, now, state, csrfToken, body })
    } catch (error) {
      if (error instanceof BodyError) {
        fail(res, error.status, 'bad_request', error.message)
        return
      }
      console.error('Auth API error:', error instanceof Error ? error.message : 'unknown error')
      if (!res.headersSent) fail(res, 500, 'server_error', 'Something went wrong. Please try again.')
    }
  }
}
