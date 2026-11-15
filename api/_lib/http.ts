import type { IncomingMessage, ServerResponse } from 'node:http'

export type ApiRequest = IncomingMessage & { body?: unknown }
export type ApiResponse = ServerResponse

const MAX_BODY_BYTES = 4096

export function firstHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  const raw = Array.isArray(value) ? value[0] : value
  return raw?.split(',')[0]?.trim() || undefined
}

export function sendJson(res: ApiResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!header) return cookies
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 1) continue
    const name = part.slice(0, index).trim()
    if (name in cookies) continue
    try {
      cookies[name] = decodeURIComponent(part.slice(index + 1).trim())
    } catch {
      cookies[name] = ''
    }
  }
  return cookies
}

export interface CookieSettings {
  secure: boolean
  sameSite: 'Strict' | 'Lax' | 'None'
  partitioned: boolean
  sessionName: string
  csrfName: string
}

/**
 * Deployed (Vercel production/preview) apps get SameSite=Strict and __Host- cookies.
 * Outside Vercel, HTTPS requests use SameSite=None; Secure; Partitioned so the cookie also works
 * when the app is rendered inside the cross-site v0 preview iframe; plain HTTP uses Lax.
 */
export function getCookieSettings(req: IncomingMessage): CookieSettings {
  const vercelEnv = process.env.VERCEL_ENV
  const deployed = vercelEnv === 'production' || vercelEnv === 'preview'
  if (deployed) {
    return { secure: true, sameSite: 'Strict', partitioned: false, sessionName: '__Host-oe_session', csrfName: '__Host-oe_csrf' }
  }
  const https = firstHeader(req, 'x-forwarded-proto') === 'https'
  return {
    secure: https,
    sameSite: https ? 'None' : 'Lax',
    partitioned: https,
    sessionName: 'oe_session',
    csrfName: 'oe_csrf',
  }
}

export function serializeCookie(name: string, value: string, settings: CookieSettings, maxAgeSeconds: number): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', `SameSite=${settings.sameSite}`, `Max-Age=${maxAgeSeconds}`]
  if (maxAgeSeconds <= 0) parts.push('Expires=Thu, 01 Jan 1970 00:00:00 GMT')
  if (settings.secure) parts.push('Secure')
  if (settings.partitioned) parts.push('Partitioned')
  return parts.join('; ')
}

export function isSameOrigin(req: IncomingMessage): boolean {
  const host = firstHeader(req, 'x-forwarded-host') ?? firstHeader(req, 'host')
  const origin = firstHeader(req, 'origin')
  if (origin) {
    try {
      return host !== undefined && new URL(origin).host === host
    } catch {
      return false
    }
  }
  const fetchSite = firstHeader(req, 'sec-fetch-site')
  return fetchSite === undefined || fetchSite === 'same-origin' || fetchSite === 'none'
}

export function getClientIp(req: IncomingMessage): string {
  return firstHeader(req, 'x-forwarded-for') ?? req.socket.remoteAddress ?? 'unknown'
}

export class BodyError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** Resolves to the parsed JSON body, or undefined when the body is empty. */
export async function readJsonBody(req: ApiRequest): Promise<unknown> {
  const parsedByPlatform = req.body
  if (parsedByPlatform !== undefined && parsedByPlatform !== null && typeof parsedByPlatform !== 'string') {
    return parsedByPlatform
  }

  let raw: string
  if (typeof parsedByPlatform === 'string') {
    raw = parsedByPlatform
  } else {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
      size += buffer.length
      if (size > MAX_BODY_BYTES) throw new BodyError('Request body is too large.', 413)
      chunks.push(buffer)
    }
    raw = Buffer.concat(chunks).toString('utf8')
  }

  if (raw.length > MAX_BODY_BYTES) throw new BodyError('Request body is too large.', 413)
  if (raw.trim() === '') return undefined
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new BodyError('Request body must be valid JSON.', 400)
  }
}
