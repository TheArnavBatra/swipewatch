// Checks every request passes before it does any work: where it came from, and how often.

// A request from a page on another site is refused. Browsers always say where a request comes from;
// a request with no such sign is allowed only where noOrigin is true (reads, never writes).
export function fromThisSite(headers, { allowed = [], noOrigin = true } = {}) {
  const site = headers['sec-fetch-site']
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = headers.origin
  if (!origin) return noOrigin
  let host
  try {
    host = new URL(origin).host
  } catch {
    return false
  }
  return host === headers.host || allowed.includes(host) || allowed.includes(origin)
}

// A fixed window per visitor, kept in memory. Each server instance counts for itself, so this slows
// a script down without being an exact quota. The host's own firewall is the stronger layer.
export function createLimiter({ max, windowMs, now = Date.now }) {
  const hits = new Map()
  return (key) => {
    const t = now()
    if (hits.size > 5000) for (const [k, v] of hits) if (v.until <= t) hits.delete(k)
    let entry = hits.get(key)
    if (!entry || entry.until <= t) {
      entry = { count: 0, until: t + windowMs }
      hits.set(key, entry)
    }
    entry.count++
    return entry.count <= max ? { ok: true } : { ok: false, retryAfter: Math.max(1, Math.ceil((entry.until - t) / 1000)) }
  }
}
