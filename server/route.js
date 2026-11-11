import { createAiHandler } from './ai.js'

const MAX_BODY = 64 * 1024

// A Connect-style middleware, mounted at /api/ai by the dev and preview servers.
export function aiMiddleware(env) {
  const handle = createAiHandler(env)

  return async (req, res) => {
    const send = (status, json) => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.setHeader('cache-control', 'no-store')
      res.end(JSON.stringify(json))
    }

    // Nothing that goes wrong in here may leave the request without an answer, or the server with
    // a failure nobody is waiting on.
    try {
      let body = null
      if (req.method === 'POST') {
        // JSON is not a "simple" content type, so a page on another site cannot post here without a
        // preflight this server never answers.
        if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'Send JSON.' })
        const chunks = []
        let size = 0
        for await (const chunk of req) {
          size += chunk.length
          if (size > MAX_BODY) return send(413, { error: 'Too much data.' })
          chunks.push(chunk)
        }
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
          return send(400, { error: 'Bad request.' })
        }
      }

      const { pathname } = new URL(req.url, 'http://localhost')
      const { status, json } = await handle(req.method, pathname, body)
      return send(status, json)
    } catch (e) {
      console.error('[ai] request crashed:', e)
      if (!res.headersSent) send(500, { kind: 'failed', error: 'Something went wrong on the server.' })
      return undefined
    }
  }
}
