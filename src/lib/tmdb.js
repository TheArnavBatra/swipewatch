import { INDUSTRIES, SERVICES } from './services'
import { SAMPLE } from './sampleCatalog'
import { GENRES } from './genres'

const KEY = import.meta.env.VITE_TMDB_KEY
const REGION = import.meta.env.VITE_TMDB_REGION || 'IN'
const API = 'https://api.themoviedb.org/3'
const MAX_PAGES = 25

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
  const cursors = base.map((c) => ({ ...c, page: 1, totalPages: Infinity, genres: null }))
  const biasedFor = new Set()
  const open = (c) => c.page <= Math.min(c.totalPages, MAX_PAGES)

  return {
    hasMore: () => cursors.some(open),
    async next() {
      // Once the model has a clear favorite genre, also pull titles in that genre. A new set of
      // favorites opens a fresh set of pages, and the older ones stay open.
      const favorites = favoriteGenres().join('|')
      if (favorites && !biasedFor.has(favorites)) {
        biasedFor.add(favorites)
        cursors.push(...base.map((c) => ({ ...c, page: 1, totalPages: Infinity, genres: favorites })))
      }
      const batches = await Promise.all(cursors.filter(open).map(async (c) => {
        const { results, totalPages } = await discover(c.provider, c.lang, c.page, minVotes, c.genres)
        c.page += 1
        c.totalPages = totalPages
        return results.map((m) => ({ m, provider: c.provider, lang: c.lang }))
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
