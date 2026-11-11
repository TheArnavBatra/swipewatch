import { INDUSTRIES, SERVICES } from './services'
import { SAMPLE } from './sampleCatalog'
import { GENRES } from './genres'
import { load, save } from './storage'

const REGION = import.meta.env.VITE_TMDB_REGION || 'IN'
// Film data is fetched through the app's own /api/tmdb route, which holds the keys.
const API = '/api/tmdb'
const call = (path, params) => `${API}?${new URLSearchParams({ path, ...params })}`
const MAX_PAGES = 25
// Pages are visited in random order, with the better-ranked pages more likely to come up first.
const FIRST_PAGE_RANGE = 3
const PAGE_DECAY = 6

export const hasTmdb = import.meta.env.VITE_HAS_TMDB === '1'
export const posterUrl = (path) => (path ? `https://image.tmdb.org/t/p/w500${path}` : null)
const backdropUrl = (path) => (path ? `https://image.tmdb.org/t/p/w780${path}` : null)

export function shuffle(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// extra holds any more TMDB filters to add, as { parameter: value }. A null lang means any language.
export async function discover(provider, lang, page, minVotes, extra) {
  const params = new URLSearchParams({
    watch_region: REGION,
    with_watch_providers: String(provider.tmdbId),
    with_watch_monetization_types: 'flatrate',
    ...(lang && { with_original_language: lang }),
    sort_by: 'popularity.desc',
    'vote_count.gte': String(minVotes),
    page: String(page),
  })
  for (const [name, value] of Object.entries(extra ?? {})) if (value != null && value !== '') params.set(name, String(value))
  const res = await fetch(call('discover/movie', Object.fromEntries(params)))
  if (!res.ok) throw new Error(`TMDB responded ${res.status}`)
  const data = await res.json()
  return { results: data.results, totalPages: data.total_pages }
}

// why is a one-line reason to show on the card, for titles found through an AI-suggested search.
export function toTitle(m, provider, lang, why) {
  // The film's own language, which is what the search asked for unless it asked for any language.
  const code = m.original_language || lang || 'en'
  return {
    id: String(m.id),
    title: m.title,
    year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
    lang: code,
    // Hindi and English keep their old names here, so saved titles and the taste model still line up.
    ind: code === 'hi' ? 'bollywood' : code === 'en' ? 'hollywood' : code,
    svcs: [provider.id],
    genre: GENRES[m.genre_ids?.[0]] ?? 'Film',
    genreIds: m.genre_ids ?? [],
    blurb: m.overview || 'No description yet.',
    poster: posterUrl(m.poster_path),
    backdrop: backdropUrl(m.backdrop_path),
    rating: m.vote_average ? Math.round(m.vote_average * 10) / 10 : null,
    ...(why && { why }),
  }
}

// opts can cap a cursor at a few pages (maxPages) and have it read them in order (ordered).
const newCursor = (c, extra = null, opts = {}) => ({ ...c, extra, ...opts, visited: new Set(), totalPages: null })
const pageLimit = (c) => Math.min(c.totalPages ?? MAX_PAGES, c.maxPages ?? MAX_PAGES)
const isOpen = (c) => c.totalPages === null || c.visited.size < pageLimit(c)

// The first page is a random one near the top, since the page count is not known yet. It is never
// the same page this list opened on last time, so two sessions in a row do not start alike.
function firstPage(c) {
  const key = `${c.provider.id}:${c.lang}:${JSON.stringify(c.extra ?? '')}`
  const seen = load('rp.firstPages', {})
  const options = Array.from({ length: FIRST_PAGE_RANGE }, (_, i) => i + 1).filter((p) => p !== seen[key])
  const page = options[Math.floor(Math.random() * options.length)]
  save('rp.firstPages', { ...seen, [key]: page })
  return page
}

// After that, an unvisited page is drawn with a weight that falls off with its rank.
function nextPage(c) {
  // A capped cursor only wants the top of its list, so it reads its few pages in order.
  if (c.ordered) for (let p = 1; p <= pageLimit(c); p++) if (!c.visited.has(p)) return p
  if (c.totalPages === null) return firstPage(c)
  const pages = []
  for (let p = 1; p <= pageLimit(c); p++) if (!c.visited.has(p)) pages.push(p)
  const weights = pages.map((p) => Math.exp(-(p - 1) / PAGE_DECAY))
  let r = Math.random() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < pages.length; i++) {
    r -= weights[i]
    if (r <= 0) return pages[i]
  }
  return pages[pages.length - 1]
}

// A feed hands out titles in batches. Each next() call pulls one more page per service and
// language, so the deck can keep refilling until TMDB has nothing left. A title is only ever
// returned once, and a film found on two services in the same batch shows both.
export function createFeed({ services, ind, exclude = [], minVotes = 100, favoriteGenres = () => [], lanes = () => [] }) {
  const seen = new Set(exclude)

  if (!hasTmdb) {
    const all = shuffle(SAMPLE.filter((t) => services.includes(t.svcs[0]) && (ind === 'both' || t.ind === ind)))
      .filter((t) => !seen.has(t.id))
    let done = false
    return { hasMore: () => !done, next: async () => { done = true; return all } }
  }

  const langs = ind === 'both' ? ['hi', 'en'] : [INDUSTRIES.find((i) => i.id === ind).lang]
  const base = SERVICES.filter((s) => services.includes(s.id))
    .flatMap((provider) => langs.map((lang) => ({ provider, lang })))
  const cursors = base.map((c) => newCursor(c, null))
  const biasedFor = new Set()
  const laneKeys = new Set()

  return {
    hasMore: () => cursors.some(isOpen),
    async next() {
      // Once the model has a clear favorite genre, also pull titles in that genre. A new set of
      // favorites opens a fresh set of pages, and the older ones stay open.
      const favorites = favoriteGenres().join('|')
      if (favorites && !biasedFor.has(favorites)) {
        biasedFor.add(favorites)
        cursors.push(...base.map((c) => newCursor(c, { with_genres: favorites })))
      }
      // Lanes are searches the AI suggested after reading their choices. Each opens a couple of
      // pages of its own, and every title it finds carries the lane's one-line reason.
      for (const lane of lanes()) {
        const key = JSON.stringify(lane)
        if (laneKeys.has(key)) continue
        laneKeys.add(key)
        try {
          // A lane with two genres means the blend of both.
          const { spec } = await resolve({ ...lane, allGenres: true, anyActor: true })
          const extra = filterParams(spec)
          const own = base.filter((c) => !lane.language || c.lang === lane.language)
          cursors.push(...own.map((c) => newCursor(c, extra, { why: lane.reason, maxPages: 2, ordered: true })))
        } catch {
          // A lane that cannot be set up is skipped; it must never end the feed.
        }
      }
      const batches = await Promise.all(cursors.filter(isOpen).map(async (c) => {
        // A random first page can be past the end for a small catalog, so try again with the real count.
        for (let attempt = 0; attempt < 3 && isOpen(c); attempt++) {
          const page = nextPage(c)
          c.visited.add(page)
          const { results, totalPages } = await discover(c.provider, c.lang, page, minVotes, c.extra)
          c.totalPages = totalPages
          if (results.length) return results.map((m) => ({ m, provider: c.provider, lang: c.lang, why: c.why }))
        }
        return []
      }))

      const batch = new Map()
      for (const { m, provider, lang, why } of batches.flat()) {
        const id = String(m.id)
        const existing = batch.get(id)
        if (existing) {
          if (!existing.svcs.includes(provider.id)) existing.svcs.push(provider.id)
          if (why && !existing.why) existing.why = why
        } else if (!seen.has(id)) {
          batch.set(id, toTitle(m, provider, lang, why))
        }
      }
      for (const id of batch.keys()) seen.add(id)
      return shuffle([...batch.values()])
    },
  }
}

const peopleCache = new Map()

// A person is looked up by name once, and the best match is used: an actor or a director, as asked.
function personId(name, department) {
  const key = `${department}:${name.toLowerCase()}`
  if (!peopleCache.has(key)) {
    const params = { query: name }
    peopleCache.set(key, fetch(call('search/person', params))
      .then((res) => (res.ok ? res.json() : { results: [] }))
      .then((data) => (data.results.find((p) => p.known_for_department === department) ?? data.results[0])?.id ?? null)
      .catch(() => null))
  }
  return peopleCache.get(key)
}

const keywordCache = new Map()
// TMDB files some subjects under another name than people use for them.
const KEYWORD_ALIAS = {
  'true story': 'based on true story', 'based on a true story': 'based on true story', 'true events': 'based on true story',
  biopic: 'biography', sport: 'sports', 'sci fi': 'science fiction', ai: 'artificial intelligence', soccer: 'football',
  'world war 2': 'world war ii', ww2: 'world war ii', aliens: 'alien', zombies: 'zombie', vampires: 'vampire',
}
const plain = (s) => s.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim()

// A theme is looked up as a TMDB keyword. Only an exact name counts, or the same name with a note
// in brackets ("football (soccer)"); a loose match would search for something they did not ask for.
function keywordId(theme) {
  const asked = plain(theme)
  const query = KEYWORD_ALIAS[asked] ?? asked
  if (!keywordCache.has(query)) {
    const params = { query }
    const request = fetch(call('search/keyword', params))
      .then((res) => { if (!res.ok) throw new Error(`TMDB responded ${res.status}`); return res.json() })
      .then((data) => {
        const all = data.results ?? []
        return (all.find((k) => plain(k.name) === query) ?? all.find((k) => plain(k.name).startsWith(`${query} (`)))?.id ?? null
      })
    request.catch(() => keywordCache.delete(query))
    keywordCache.set(query, request)
  }
  return keywordCache.get(query)
}

// Turns names into TMDB ids: actors, directors and themes. missing lists whatever could not be
// found, so the caller can say so instead of quietly searching without it.
export async function resolve(intent) {
  const actors = intent.actors ?? []
  const directors = intent.directors ?? []
  const themes = intent.themes ?? []
  const [cast, crew, keywords] = await Promise.all([
    Promise.all(actors.map((n) => personId(n, 'Acting'))),
    Promise.all(directors.map((n) => personId(n, 'Directing'))),
    Promise.all(themes.map((t) => keywordId(t).catch(() => null))),
  ])
  const missing = [
    ...actors.filter((_, i) => !cast[i]).map((name) => ({ kind: 'person', name })),
    ...directors.filter((_, i) => !crew[i]).map((name) => ({ kind: 'person', name })),
    ...themes.filter((_, i) => !keywords[i]).map((name) => ({ kind: 'theme', name })),
  ]
  const spec = {
    genres: intent.genres ?? [], allGenres: Boolean(intent.allGenres), avoidGenres: intent.avoidGenres ?? [],
    minRating: intent.minRating ?? null, yearFrom: intent.yearFrom ?? null, yearTo: intent.yearTo ?? null,
    minRuntime: intent.minRuntime ?? null, maxRuntime: intent.maxRuntime ?? null,
    cast: cast.filter(Boolean), anyActor: Boolean(intent.anyActor), crew: crew.filter(Boolean),
    keywords: keywords.filter(Boolean), anyTheme: false,
  }
  return { spec, missing }
}

// A resolved search as TMDB discover parameters. In TMDB a comma means "all of" and a pipe "any of".
export function filterParams(spec) {
  const p = {}
  if (spec.genres.length) p.with_genres = spec.genres.join(spec.allGenres ? ',' : '|')
  if (spec.avoidGenres.length) p.without_genres = spec.avoidGenres.join('|')
  if (spec.minRating) p['vote_average.gte'] = spec.minRating
  if (spec.yearFrom) p['primary_release_date.gte'] = `${spec.yearFrom}-01-01`
  if (spec.yearTo) p['primary_release_date.lte'] = `${spec.yearTo}-12-31`
  if (spec.minRuntime) p['with_runtime.gte'] = spec.minRuntime
  if (spec.maxRuntime) p['with_runtime.lte'] = spec.maxRuntime
  if (spec.cast.length) p.with_cast = spec.cast.join(spec.anyActor ? '|' : ',')
  if (spec.crew.length) p.with_crew = spec.crew.join('|')
  if (spec.keywords.length) p.with_keywords = spec.keywords.join(spec.anyTheme ? '|' : ',')
  return p
}

export const hasOmdb = import.meta.env.VITE_HAS_OMDB === '1'
const detailsCache = new Map()

// IMDb's rating is not part of TMDB, so it comes from OMDb when a key is set. It is optional:
// a missing key or a failed request leaves the IMDb rating out instead of failing the sheet.
async function fetchImdbRating(imdbId) {
  if (!hasOmdb || !imdbId) return null
  try {
    const res = await fetch(call('omdb', { i: imdbId }))
    const data = await res.json()
    if (data.Response === 'False' || !data.imdbRating || data.imdbRating === 'N/A') return null
    return { rating: data.imdbRating, votes: data.imdbVotes && data.imdbVotes !== 'N/A' ? data.imdbVotes : null }
  } catch {
    return null
  }
}

// Full details for one title: cast, director, runtime, trailer and ratings. Null means there is
// nothing more to fetch (sample titles, or no TMDB key), so the caller shows what it already has.
export function fetchDetails(item) {
  if (!hasTmdb || !/^\d+$/.test(item.id)) return Promise.resolve(null)
  // The request itself is cached, so opening a title twice at once or again later costs one fetch.
  if (!detailsCache.has(item.id)) {
    const request = loadDetails(item)
    request.catch(() => detailsCache.delete(item.id))
    detailsCache.set(item.id, request)
  }
  return detailsCache.get(item.id)
}

async function loadDetails(item) {
  const res = await fetch(call(`movie/${item.id}`, { append_to_response: 'credits,videos' }))
  if (!res.ok) throw new Error(`TMDB responded ${res.status}`)
  const d = await res.json()

  const trailer = d.videos?.results?.find((v) => v.site === 'YouTube' && v.type === 'Trailer')
    ?? d.videos?.results?.find((v) => v.site === 'YouTube')
  const details = {
    backdrop: backdropUrl(d.backdrop_path),
    tagline: d.tagline || null,
    runtime: d.runtime || null,
    genres: (d.genres ?? []).map((g) => g.name),
    overview: d.overview || null,
    languages: (d.spoken_languages ?? []).map((l) => l.english_name),
    originalLanguage: d.original_language || null,
    countries: (d.production_countries ?? []).map((c) => c.name),
    director: (d.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c) => c.name),
    cast: (d.credits?.cast ?? []).slice(0, 8).map((c) => ({
      name: c.name,
      role: c.character || null,
      photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
    })),
    trailerUrl: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null,
    imdbUrl: d.imdb_id ? `https://www.imdb.com/title/${d.imdb_id}/` : null,
    tmdbRating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
    tmdbVotes: d.vote_count || null,
    imdb: await fetchImdbRating(d.imdb_id),
  }
  return details
}
