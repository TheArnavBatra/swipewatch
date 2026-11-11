import { createAiHandler } from './ai.js'
import { createLimiter, fromThisSite } from './guard.js'
import { createTmdbHandler } from './tmdb.js'

const MAX_BODY = 64 * 1024

// One request, start to finish, for any Node server: the Vite dev and preview servers and the
// Vercel functions all use it, so the checks are the same everywhere. handle gets
// { method, pathname, query, body } and answers { status, json, headers }.
export function nodeRoute({ base, handle, env = {}, limits, name }) {
  const allowed = String(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const limiters = Object.fromEntries(Object.entries(limits ?? {}).map(([method, cfg]) => [method, createLimiter(cfg)]))

  return async (req, res) => {
    const send = (status, json, headers = {}) => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.setHeader('cache-control', 'no-store')
      res.setHeader('x-content-type-options', 'nosniff')
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
      res.end(JSON.stringify(json))
    }

    // Nothing that goes wrong in here may leave the request without an answer, or the server with
    // a failure nobody is waiting on.
    try {
      const write = req.method === 'POST'
      if (!['GET', 'POST'].includes(req.method)) return send(405, { error: 'Not allowed.' }, { allow: 'GET, POST' })
      // A page on another site cannot use this, and a write must say where it came from.
      if (!fromThisSite(req.headers, { allowed, noOrigin: !write })) return send(403, { error: 'Not allowed.' })

      const limit = limiters[req.method]?.(req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown')
      if (limit && !limit.ok) {
        return send(429, { kind: 'quota', error: 'Too many requests. Try again in a little while.', retryAfter: limit.retryAfter }, { 'retry-after': String(limit.retryAfter) })
      }

      let body = null
      if (write) {
        // JSON is not a "simple" content type, so a page on another site cannot post here without a
        // preflight this server never answers.
        if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return send(415, { error: 'Send JSON.' })
        if (Number(req.headers['content-length'] ?? 0) > MAX_BODY) return send(413, { error: 'Too much data.' })
        try {
          if (req.body !== undefined && req.body !== null) {
            // Some hosts read the body before the function runs.
            body = typeof req.body === 'string' ? JSON.parse(req.body) : Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString('utf8')) : req.body
            if (JSON.stringify(body).length > MAX_BODY) return send(413, { error: 'Too much data.' })
          } else {
            const chunks = []
            let size = 0
            for await (const chunk of req) {
              size += chunk.length
              if (size > MAX_BODY) return send(413, { error: 'Too much data.' })
              chunks.push(chunk)
            }
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          }
        } catch {
          return send(400, { error: 'Bad request.' })
        }
      }

      const url = new URL(req.originalUrl ?? req.url, 'http://localhost')
      const pathname = url.pathname.startsWith(base) ? url.pathname.slice(base.length) || '/' : url.pathname
      const { status, json, headers } = await handle({ method: req.method, pathname, query: url.searchParams, body })
      return send(status, json, headers)
    } catch (e) {
      console.error(`[${name}] request crashed:`, e?.message)
      if (!res.headersSent) send(500, { kind: 'failed', error: 'Something went wrong on the server.' })
      return undefined
    }
  }
}

const MINUTE = 60 * 1000

// The Gemini route: /api/ai (POST) and /api/ai/status (GET).
export function aiMiddleware(env) {
  const ai = createAiHandler(env)
  return nodeRoute({
    name: 'ai', base: '/api/ai', env,
    handle: ({ method, pathname, body }) => ai(method, pathname, body),
    // A mood list is two or three requests, a taste reading one.
    limits: { POST: { max: 20, windowMs: 10 * MINUTE }, GET: { max: 60, windowMs: MINUTE } },
  })
}

// The film-data route: /api/tmdb?path=discover/movie&... (and path=omdb&i=tt...).
export function tmdbMiddleware(env) {
  const tmdb = createTmdbHandler(env)
  return nodeRoute({
    name: 'tmdb', base: '/api/tmdb', env, handle: tmdb,
    limits: { GET: { max: 300, windowMs: MINUTE } },
  })
}
