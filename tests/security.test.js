import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createLimiter, fromThisSite } from '../server/guard.js'
import { nodeRoute } from '../server/route.js'
import { createTmdbHandler } from '../server/tmdb.js'

const ENV = { TMDB_KEY: 'tmdb-secret-1', OMDB_KEY: 'omdb-secret-2' }
const q = (o) => new URLSearchParams(o)

// A pretend TMDB and OMDb that record what reached them.
function upstream(reply = () => ({ status: 200, body: { results: [] } })) {
  const seen = []
  const fetch = async (url) => {
    seen.push(String(url))
    const r = reply(String(url))
    return new Response(JSON.stringify(r.body), { status: r.status })
  }
  return { seen, handler: createTmdbHandler(ENV, { fetch }) }
}
const get = (h, query) => h({ method: 'GET', query: q(query) })

test('the proxy adds the key itself and passes only known parameters', async () => {
  const u = upstream()
  const ok = await get(u.handler, { path: 'discover/movie', with_watch_providers: '8', page: '2' })
  assert.equal(ok.status, 200)
  const sent = new URL(u.seen[0])
  assert.equal(sent.origin + sent.pathname, 'https://api.themoviedb.org/3/discover/movie')
  assert.equal(sent.searchParams.get('api_key'), 'tmdb-secret-1')
  assert.equal(sent.searchParams.get('include_adult'), 'false', 'adult titles are never asked for')

  for (const bad of [
    { path: 'discover/movie', api_key: 'mine' }, { path: 'discover/movie', language: 'x' }, { path: 'discover/movie', include_adult: 'true' }, { path: 'discover/movie', page: '0' },
    { path: 'discover/movie', page: '501' }, { path: 'discover/movie', page: '1.5' }, { path: 'search/person', query: 'x'.repeat(200) },
    { path: 'search/person', query: 'a<b' },
  ]) assert.equal((await get(u.handler, bad)).status, 400, JSON.stringify(bad))
  for (const path of ['account', 'movie/603/images', 'movie/abc', 'movie/603/../../account', '../3/account', 'authentication/token/new', '']) {
    assert.equal((await get(u.handler, { path })).status, 404, path)
  }
  assert.equal(u.seen.length, 1, 'nothing refused reached TMDB')
  assert.equal((await u.handler({ method: 'POST', query: q({ path: 'discover/movie' }) })).status, 405)
})

test('the proxy reaches OMDb only for an IMDb id, and never repeats an upstream error', async () => {
  const u = upstream(() => ({ status: 401, body: { error: 'Invalid API key: tmdb-secret-1 omdb-secret-2' } }))
  assert.equal((await get(u.handler, { path: 'omdb', i: 'tt0133093' })).status, 502)
  assert.equal((await get(u.handler, { path: 'omdb', i: 'x&apikey=1' })).status, 400)
  const out = await get(u.handler, { path: 'movie/603' })
  assert.equal(out.status, 502)
  assert.ok(!JSON.stringify(out).includes('secret'))
  assert.match(u.seen[0], /^https:\/\/www\.omdbapi\.com\/\?i=tt0133093&apikey=omdb-secret-2$/)

  const missing = createTmdbHandler({}, { fetch: async () => { throw new Error('must not be called') } })
  assert.equal((await get(missing, { path: 'discover/movie' })).status, 503)
  assert.equal((await get(missing, { path: 'omdb', i: 'tt0133093' })).status, 503)
  const slow = createTmdbHandler(ENV, { fetch: async () => { throw new Error('timeout tmdb-secret-1') } })
  const timeout = await get(slow, { path: 'movie/603' })
  assert.equal(timeout.status, 504)
  assert.ok(!JSON.stringify(timeout).includes('secret'))
  assert.equal((await get(createTmdbHandler(ENV, { fetch: async () => new Response('{}', { status: 404 }) }), { path: 'movie/1' })).status, 404)
  assert.equal((await get(createTmdbHandler(ENV, { fetch: async () => new Response('{}', { status: 429 }) }), { path: 'movie/1' })).status, 429)
})

test('fromThisSite refuses other sites and unsigned writes', () => {
  const ok = { host: 'swipewatch.app', origin: 'https://swipewatch.app', 'sec-fetch-site': 'same-origin' }
  assert.equal(fromThisSite(ok), true)
  assert.equal(fromThisSite({ host: 'swipewatch.app', origin: 'https://evil.example' }), false)
  assert.equal(fromThisSite({ host: 'swipewatch.app', origin: 'null' }), false)
  assert.equal(fromThisSite({ host: 'swipewatch.app', 'sec-fetch-site': 'cross-site' }), false)
  assert.equal(fromThisSite({ host: 'swipewatch.app' }), true, 'a plain read is fine')
  assert.equal(fromThisSite({ host: 'swipewatch.app' }, { noOrigin: false }), false, 'a write must say where it came from')
  assert.equal(fromThisSite({ host: 'a.app', origin: 'https://b.app' }, { allowed: ['b.app'] }), true)
})

test('the limiter counts per visitor and resets', () => {
  let t = 0
  const hit = createLimiter({ max: 2, windowMs: 1000, now: () => t })
  assert.ok(hit('a').ok && hit('a').ok)
  const over = hit('a')
  assert.equal(over.ok, false)
  assert.equal(over.retryAfter, 1)
  assert.ok(hit('b').ok, 'another visitor is not affected')
  t = 1001
  assert.ok(hit('a').ok)
})

// The real request path, on a real socket.
async function serve(options, wrap = (h) => h) {
  const handler = nodeRoute({ name: 't', env: {}, ...options })
  const server = http.createServer(wrap(handler))
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  return { base, host: `127.0.0.1:${server.address().port}`, close: () => { server.closeAllConnections(); server.close() } }
}

test('requests are checked before any work is done', async () => {
  let work = 0
  const s = await serve({ base: '/api/x', handle: async ({ pathname, body }) => { work++; return { status: 200, json: { pathname, body } } }, limits: { POST: { max: 5, windowMs: 60_000 } } })
  // Refused requests count against the limit too: the three before the first good one.
  const json = { 'content-type': 'application/json' }
  const post = (headers, body = '{"a":1}') => fetch(`${s.base}/api/x/hello`, { method: 'POST', headers, body })
  const here = { origin: `http://${s.host}` }

  assert.equal((await post({ ...json })).status, 403, 'no origin on a write')
  assert.equal((await post({ ...json, origin: 'https://evil.example' })).status, 403)
  assert.equal((await post({ ...here, 'content-type': 'text/plain' })).status, 415)
  assert.equal((await post({ ...here, ...json }, '{not json')).status, 400)
  assert.equal((await post({ ...here, ...json }, JSON.stringify({ big: 'x'.repeat(70_000) }))).status, 413)
  assert.equal((await fetch(`${s.base}/api/x`, { method: 'DELETE' })).status, 405)
  assert.equal(work, 0, 'none of that reached the handler')

  const good = await post({ ...here, ...json })
  assert.equal(good.status, 200)
  assert.equal(good.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(good.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await good.json(), { pathname: '/hello', body: { a: 1 } })
  assert.equal((await post({ ...here, ...json })).status, 200)
  const limited = await post({ ...here, ...json })
  assert.equal(limited.status, 429)
  assert.ok(Number(limited.headers.get('retry-after')) > 0)
  assert.equal(work, 2)
  s.close()
})

test('a crash inside is answered plainly, and a body some hosts read first still works', async () => {
  const s = await serve({ base: '/api/x', handle: async ({ body }) => { if (body?.boom) throw new Error('secret-detail'); return { status: 200, json: { body } } } },
    // The way Vercel hands a function a request: the body is already read and sits on req.body.
    (handler) => (req, res) => {
      let raw = ''
      req.on('data', (c) => { raw += c })
      req.on('end', () => { req.body = raw ? JSON.parse(raw) : undefined; req.removeAllListeners('data'); handler(req, res) })
    })
  const call = (body) => fetch(`${s.base}/api/x`, { method: 'POST', headers: { 'content-type': 'application/json', origin: `http://${s.host}` }, body: JSON.stringify(body) })
  assert.deepEqual(await (await call({ ok: 1 })).json(), { body: { ok: 1 } })
  const crashed = await call({ boom: true })
  assert.equal(crashed.status, 500)
  assert.ok(!JSON.stringify(await crashed.json()).includes('secret-detail'))
  s.close()
})
