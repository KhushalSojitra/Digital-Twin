/** The only Supabase project this application may talk to (it owns public.tickets). */
export const APPLICATION_PROJECT_REF = 'okkgnwiqcupflocoobes'

/** Projects connected to the workspace for other purposes. They must never be used. */
export const FORBIDDEN_PROJECT_REFS: readonly string[] = ['krrmktwszdijoqmigkif']

/** Returns the project ref of a https://<ref>.supabase.co URL, or null for anything else. */
export function projectRefFromUrl(value: string | undefined | null): string | null {
  if (!value) return null
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(url.hostname)
  return match ? (match[1] ?? null) : null
}

/** Reads the (unverified) claims of a Supabase JWT key. Only used to catch a key from the wrong project. */
export function jwtClaims(key: string): { role?: unknown; ref?: unknown } | null {
  const parts = key.split('.')
  if (parts.length !== 3 || !parts[1]) return null
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as unknown
    return typeof payload === 'object' && payload !== null ? (payload as { role?: unknown; ref?: unknown }) : null
  } catch {
    return null
  }
}
