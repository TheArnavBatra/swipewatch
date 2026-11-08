import { INDUSTRIES, SERVICES } from './services'
import { SAMPLE } from './sampleCatalog'

const KEY = import.meta.env.VITE_TMDB_KEY
const REGION = import.meta.env.VITE_TMDB_REGION || 'IN'
const API = 'https://api.themoviedb.org/3'
const PAGES = [1, 2]

export const hasTmdb = Boolean(KEY)
export const posterUrl = (path) => (path ? `https://image.tmdb.org/t/p/w500${path}` : null)

const GENRES = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary',
  18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Sci-fi', 53: 'Thriller', 10752: 'War', 37: 'Western',
}

function shuffle(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function discover(provider, lang, page) {
  const params = new URLSearchParams({
    api_key: KEY,
    watch_region: REGION,
    with_watch_providers: String(provider.tmdbId),
    with_watch_monetization_types: 'flatrate',
    with_original_language: lang,
    sort_by: 'popularity.desc',
    'vote_count.gte': '300',
    include_adult: 'false',
    page: String(page),
  })
  const res = await fetch(`${API}/discover/movie?${params}`)
  if (!res.ok) throw new Error(`TMDB responded ${res.status}`)
  const data = await res.json()
  return data.results.map((m) => ({ m, provider, lang }))
}

function fromSample({ services, ind }) {
  return shuffle(SAMPLE.filter((t) => services.includes(t.svcs[0]) && (ind === 'both' || t.ind === ind)))
}

// Returns titles streaming on the chosen services, merged so a film on two services shows both.
export async function fetchTitles({ services, ind }) {
  if (!hasTmdb) return fromSample({ services, ind })
  const langs = ind === 'both' ? ['hi', 'en'] : [INDUSTRIES.find((i) => i.id === ind).lang]
  const providers = SERVICES.filter((s) => services.includes(s.id))
  const jobs = providers.flatMap((p) => langs.flatMap((l) => PAGES.map((pg) => discover(p, l, pg))))
  const batches = await Promise.all(jobs)

  const byId = new Map()
  for (const { m, provider, lang } of batches.flat()) {
    const existing = byId.get(m.id)
    if (existing) {
      if (!existing.svcs.includes(provider.id)) existing.svcs.push(provider.id)
      continue
    }
    byId.set(m.id, {
      id: String(m.id),
      title: m.title,
      year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
      ind: lang === 'hi' ? 'bollywood' : 'hollywood',
      svcs: [provider.id],
      genre: GENRES[m.genre_ids?.[0]] ?? 'Film',
      blurb: m.overview || 'No description yet.',
      poster: posterUrl(m.poster_path),
      rating: m.vote_average ? Math.round(m.vote_average * 10) / 10 : null,
    })
  }
  return shuffle([...byId.values()])
}
