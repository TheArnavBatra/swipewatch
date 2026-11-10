import { INDUSTRIES, SERVICES } from './services'
import { SAMPLE } from './sampleCatalog'
import { GENRES } from './genres'
import { load, save } from './storage'

const KEY = import.meta.env.VITE_TMDB_KEY
const REGION = import.meta.env.VITE_TMDB_REGION || 'IN'
const API = 'https://api.themoviedb.org/3'
const MAX_PAGES = 25
// Pages are visited in random order, with the better-ranked pages more likely to come up first.
const FIRST_PAGE_RANGE = 3
const PAGE_DECAY = 6

export const hasTmdb = Boolean(KEY)
export const posterUrl = (path) => (path ? `https://image.tmdb.org/t/p/w500${path}` : null)

export function shuffle(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function discover(provider, lang, page, minVotes, genres) {
  const params = new URLSearchParams({
    api_key: KEY,
    watch_region: REGION,
    with_watch_providers: String(provider.tmdbId),
    with_watch_monetization_types: 'flatrate',
    with_original_language: lang,
    sort_by: 'popularity.desc',
    'vote_count.gte': String(minVotes),
    include_adult: 'false',
    page: String(page),
  })
  if (genres) params.set('with_genres', genres)
  const res = await fetch(`${API}/discover/movie?${params}`)
  if (!res.ok) throw new Error(`TMDB responded ${res.status}`)
  const data = await res.json()
  return { results: data.results, totalPages: data.total_pages }
}

function toTitle(m, provider, lang) {
  return {
    id: String(m.id),
    title: m.title,
    year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
    ind: lang === 'hi' ? 'bollywood' : 'hollywood',
    svcs: [provider.id],
    genre: GENRES[m.genre_ids?.[0]] ?? 'Film',
    genreIds: m.genre_ids ?? [],
    blurb: m.overview || 'No description yet.',
    poster: posterUrl(m.poster_path),
    rating: m.vote_average ? Math.round(m.vote_average * 10) / 10 : null,
  }
}

const newCursor = (c, genres) => ({ ...c, genres, visited: new Set(), totalPages: null })
const pageLimit = (c) => Math.min(c.totalPages ?? MAX_PAGES, MAX_PAGES)
const isOpen = (c) => c.totalPages === null || c.visited.size < pageLimit(c)

// The first page is a random one near the top, since the page count is not known yet. It is never
// the same page this list opened on last time, so two sessions in a row do not start alike.
function firstPage(c) {
  const key = `${c.provider.id}:${c.lang}:${c.genres ?? ''}`
  const seen = load('rp.firstPages', {})
  const options = Array.from({ length: FIRST_PAGE_RANGE }, (_, i) => i + 1).filter((p) => p !== seen[key])
  const page = options[Math.floor(Math.random() * options.length)]
  save('rp.firstPages', { ...seen, [key]: page })
  return page
}

// After that, an unvisited page is drawn with a weight that falls off with its rank.
function nextPage(c) {
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
export function createFeed({ services, ind, exclude = [], minVotes = 100, favoriteGenres = () => [] }) {
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

  return {
    hasMore: () => cursors.some(isOpen),
    async next() {
      // Once the model has a clear favorite genre, also pull titles in that genre. A new set of
      // favorites opens a fresh set of pages, and the older ones stay open.
      const favorites = favoriteGenres().join('|')
      if (favorites && !biasedFor.has(favorites)) {
        biasedFor.add(favorites)
        cursors.push(...base.map((c) => newCursor(c, favorites)))
      }
      const batches = await Promise.all(cursors.filter(isOpen).map(async (c) => {
        // A random first page can be past the end for a small catalog, so try again with the real count.
        for (let attempt = 0; attempt < 3 && isOpen(c); attempt++) {
          const page = nextPage(c)
          c.visited.add(page)
          const { results, totalPages } = await discover(c.provider, c.lang, page, minVotes, c.genres)
          c.totalPages = totalPages
          if (results.length) return results.map((m) => ({ m, provider: c.provider, lang: c.lang }))
        }
        return []
      }))

      const batch = new Map()
      for (const { m, provider, lang } of batches.flat()) {
        const id = String(m.id)
        const existing = batch.get(id)
        if (existing) {
          if (!existing.svcs.includes(provider.id)) existing.svcs.push(provider.id)
        } else if (!seen.has(id)) {
          batch.set(id, toTitle(m, provider, lang))
        }
      }
      for (const id of batch.keys()) seen.add(id)
      return shuffle([...batch.values()])
    },
  }
}
