// A narrow proxy for TMDB and OMDb, so their keys stay on the server. Only the few calls the app
// makes are allowed, with only the parameters it uses. Anything else is refused before it leaves.

const TMDB = 'https://api.themoviedb.org/3'
const OMDB = 'https://www.omdbapi.com/'
const TIMEOUT_MS = 8000
const MAX_VALUE = 160

const DISCOVER = new Set([
  'watch_region', 'with_watch_providers', 'with_watch_monetization_types', 'with_original_language', 'sort_by',
  'vote_count.gte', 'page', 'with_genres', 'without_genres', 'vote_average.gte', 'primary_release_date.gte',
  'primary_release_date.lte', 'with_runtime.gte', 'with_runtime.lte', 'with_cast', 'with_crew', 'with_keywords',
])
const ROUTES = [
  { test: (p) => p === 'discover/movie', params: DISCOVER },
  { test: (p) => p === 'search/person', params: new Set(['query']) },
  { test: (p) => p === 'search/keyword', params: new Set(['query']) },
  { test: (p) => /^movie\/\d{1,9}$/.test(p), params: new Set(['append_to_response']) },
]
const VALUE_OK = (v) => ![...v].some((c) => c.charCodeAt(0) < 32 || c === '<' || c === '>')
const reply = (status, json, cache = 'no-store') => ({ status, json, headers: { 'cache-control': cache } })

// Titles and search results change slowly, so the host's cache may keep them for a while.
const CACHE = 'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400'

async function call(fetchImpl, url, what) {
  let res
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } })
  } catch {
    return reply(504, { error: `${what} did not answer.` })
  }
  // What the upstream says in an error is never passed on: it can contain the request, key included.
  if (res.status === 404) return reply(404, { error: 'Not found.' })
  if (res.status === 429) return reply(429, { error: `${what} is busy. Try again soon.` })
  if (!res.ok) return reply(502, { error: `${what} could not answer.` })
  let json
  try {
    json = await res.json()
  } catch {
    return reply(502, { error: `${what} sent something unreadable.` })
  }
  return reply(200, json, CACHE)
}

// handle({ method, pathname, query }) -> { status, json, headers }. query is a URLSearchParams.
export function createTmdbHandler(env, { fetch: fetchImpl = globalThis.fetch } = {}) {
  const tmdbKey = env.TMDB_KEY
  const omdbKey = env.OMDB_KEY

  return async ({ method, query }) => {
    if (method !== 'GET') return reply(405, { error: 'Use GET.' })
    const path = (query.get('path') ?? '').replace(/^\/+/, '')

    if (path === 'omdb') {
      const id = query.get('i') ?? ''
      if (!/^tt\d{5,10}$/.test(id)) return reply(400, { error: 'Bad request.' })
      if (!omdbKey) return reply(503, { error: 'IMDb ratings are not set up.' })
      return call(fetchImpl, `${OMDB}?${new URLSearchParams({ i: id, apikey: omdbKey })}`, 'OMDb')
    }

    const route = ROUTES.find((r) => r.test(path))
    if (!route) return reply(404, { error: 'Not found.' })
    if (!tmdbKey) return reply(503, { error: 'Film data is not set up.' })

    const params = new URLSearchParams()
    for (const [name, value] of query) {
      if (name === 'path') continue
      if (!route.params.has(name) || value.length > MAX_VALUE || !VALUE_OK(value)) return reply(400, { error: 'Bad request.' })
      params.set(name, value)
    }
    if (params.has('page')) {
      const page = Number(params.get('page'))
      if (!Number.isInteger(page) || page < 1 || page > 500) return reply(400, { error: 'Bad request.' })
    }
    // Adult titles are never asked for, whatever the browser sends.
    if (path !== 'discover/movie' && path !== 'search/person') params.delete('include_adult')
    else params.set('include_adult', 'false')
    params.set('api_key', tmdbKey)
    return call(fetchImpl, `${TMDB}/${path}?${params}`, 'TMDB')
  }
}
