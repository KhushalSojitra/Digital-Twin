export function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function formatRelative(iso: string, now = Date.now()) {
  const diffMs = now - new Date(iso).getTime()
  const min = Math.round(diffMs / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d} d ago`
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatDegrees(value: number, digits = 1) {
  return `${value.toFixed(digits)}°`
}

export function formatCoord(lat: number, lng: number) {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(5)}° ${ns}, ${Math.abs(lng).toFixed(5)}° ${ew}`
}

/** Wrap an angle in degrees to the (-180, 180] range. */
export function wrapDeg(deg: number) {
  let d = ((((deg + 180) % 360) + 360) % 360) - 180
  if (d === -180) d = 180
  return d
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

/** Compact span between two instants, e.g. "3 d 4 h" or "45 min". */
export function formatDuration(fromIso: string, toIso: string) {
  const ms = Math.max(0, new Date(toIso).getTime() - new Date(fromIso).getTime())
  const min = Math.round(ms / 60_000)
  if (min < 60) return `${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h`
  const d = Math.floor(h / 24)
  const rem = h % 24
  return rem ? `${d} d ${rem} h` : `${d} d`
}
