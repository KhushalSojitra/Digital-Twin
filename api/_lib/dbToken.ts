import { createHash, createHmac } from 'node:crypto'

export const DB_TOKEN_TTL_SECONDS = 600

export interface DbTokenIdentity {
  id: string
  role: string
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url')
}

/** Stable UUID-shaped subject for a user id, so auth.uid() works without storing anything. */
export function subjectFor(userId: string): string {
  const hex = createHash('sha256').update(`oomnieye-user:${userId}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/**
 * Short-lived Supabase JWT for the signed-in user. It carries the `authenticated` role, which row level
 * security allows to READ tickets only: every ticket write is refused for it by privileges, policies and a
 * trigger, and goes through the API instead. It proves "signed in", never "which actions are allowed".
 */
export function mintDbToken(identity: DbTokenIdentity, secret: string, now: number): { token: string; expiresAt: number } {
  const iat = Math.floor(now / 1000)
  const exp = iat + DB_TOKEN_TTL_SECONDS
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      aud: 'authenticated',
      role: 'authenticated',
      sub: subjectFor(identity.id),
      iat,
      exp,
      app_user: identity.id,
      app_role: identity.role,
    }),
  )
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return { token: `${header}.${payload}.${signature}`, expiresAt: exp * 1000 }
}

export function readDbTokenSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = env.APP_SUPABASE_JWT_SECRET?.trim()
  return secret && secret.length >= 32 ? secret : null
}
