import { INDUSTRIES, SERVICES } from './services'
import { SAMPLE } from './sampleCatalog'
import { GENRES } from './genres'
import { discover, filterParams, hasTmdb, resolve, shuffle, toTitle } from './tmdb'

// Fewer exact matches than STRICT_MIN, and the same search is repeated with lesser-known titles
// allowed before any part of the request is loosened. NEAR_FOR is how many titles a mood list wants
// in all; WANT is where a search stops reading further pages.
const STRICT_MIN = 12
const NEAR_FOR = 20
const WANT = 40
const MAX_PAGES = 5
// Shorts and clips are filed as films too. Nobody describing a mood means a ten-minute short.
const RUNTIME_FLOOR = 40

// What each tier of "closest" titles gave up, on top of the tiers before it. A title first found
// at a tier does not meet that tier's part of the request.
export const TIER = { missing: 0, quality: 1, years: 2, cast: 3, blend: 4, themes: 5, noThemes: 6, genres: 7, sample: 8 }

const hasCore = (s) => Boolean(s.genres.length || s.cast.length || s.crew.length || s.keywords.length)

// The request, then one looser version after another. Each step lets go of one thing that was
// asked for. What to avoid, the language and the named people as a whole are never let go.
function ladder(base, floor) {
  const steps = []
  let spec = base
  const step = (tier, asked, change) => {
    if (!asked) return
    const next = { ...spec, ...change }
    // A search with nothing left to look for is only "popular films", which is not close to anything.
    if (hasCore(base) && !hasCore(next)) return
    spec = next
    steps.push({ tier, spec })
  }
  step(TIER.quality, base.minRating || base.maxRuntime || base.minRuntime !== floor, { minRating: null, maxRuntime: null, minRuntime: floor })
  step(TIER.years, base.yearFrom || base.yearTo, { yearFrom: null, yearTo: null })
  step(TIER.cast, base.cast.length > 1 && !base.anyActor, { anyActor: true })
  step(TIER.blend, base.allGenres, { allGenres: false })
  step(TIER.themes, base.keywords.length > 1, { anyTheme: true })
  step(TIER.noThemes, base.keywords.length, { keywords: [] })
  step(TIER.genres, base.genres.length && (base.cast.length || base.crew.length), { genres: [], allGenres: false })
  return steps
}

// Every title for one search across the chosen services and languages, most popular first. Later
// pages are read only while the list is still short. votes is the fewest ratings a title needs.
async function gather(spec, { providers, langs, skip, votes }) {
  const extra = filterParams(spec)
  const found = new Map()
  let open = providers.flatMap((provider) => langs.map((lang) => ({ provider, lang })))
  for (let page = 1; page <= MAX_PAGES && open.length && found.size < WANT; page++) {
    const settled = await Promise.allSettled(open.map((c) => discover(c.provider, c.lang, page, votes, extra)))
    if (page === 1 && settled.every((r) => r.status === 'rejected')) throw settled[0].reason
    const more = []
    settled.forEach((r, i) => {
      if (r.status !== 'fulfilled') return
      const { provider, lang } = open[i]
      for (const m of r.value.results ?? []) {
        const id = String(m.id)
        // TMDB's own exclusion is not relied on: an avoided genre is dropped here as well.
        if (skip.has(id) || spec.avoidGenres.some((g) => m.genre_ids?.includes(g))) continue
        const have = found.get(id)
        if (!have) found.set(id, toTitle(m, provider, lang))
        else if (!have.svcs.includes(provider.id)) have.svcs.push(provider.id)
      }
      if (page < (r.value.totalPages ?? 1)) more.push(open[i])
    })
    open = more
  }
  return [...found.values()]
}

const toggleLangs = (ind) => (ind === 'both' ? ['hi', 'en'] : [INDUSTRIES.find((i) => i.id === ind).lang])

// The built-in sample titles carry a loose genre name and little else, so only part of a request
// can be checked against them.
const GENRE_WORDS = Object.entries(GENRES).map(([id, name]) => [Number(id), name.toLowerCase()])
const sampleGenres = (t) => GENRE_WORDS.filter(([, word]) => t.genre.toLowerCase().includes(word)).map(([id]) => id)

function samplePool({ services, ind, intent, skip }) {
  const langs = intent.languages?.length ? intent.languages : toggleLangs(ind)
  const genres = intent.genres ?? []
  const fits = SAMPLE.filter((t) => {
    if (!services.includes(t.svcs[0]) || skip.has(t.id)) return false
    if (!langs.includes(t.ind === 'bollywood' ? 'hi' : 'en')) return false
    const own = sampleGenres(t)
    if (intent.avoidGenres?.some((g) => own.includes(g))) return false
    if (genres.length && !(intent.allGenres ? genres.every((g) => own.includes(g)) : genres.some((g) => own.includes(g)))) return false
    if (intent.yearFrom && t.year < intent.yearFrom) return false
    if (intent.yearTo && t.year > intent.yearTo) return false
    return true
  }).map((t) => ({ ...t, genreIds: sampleGenres(t) }))
  const unchecked = intent.themes?.length || intent.actors?.length || intent.directors?.length
    || intent.minRating || intent.minRuntime || intent.maxRuntime
  if (!unchecked) return { strict: shuffle(fits), near: [], tiers: new Map(), missing: [] }
  return { strict: [], near: shuffle(fits), tiers: new Map(fits.map((t) => [t.id, TIER.sample])), missing: [] }
}

// Titles for a described mood, on the chosen services. "strict" is everything that fits all of what
// was asked for. If that is a short list, "near" holds looser matches, kept apart so they are never
// mistaken for exact ones; tiers says, per near title, which part of the request it gave up (TIER).
// missing lists named people or themes the database does not know.
export async function moodPool({ services, ind, intent, exclude = [] }) {
  const skip = new Set(exclude)
  if (!hasTmdb) return samplePool({ services, ind, intent, skip })

  const providers = SERVICES.filter((s) => services.includes(s.id))
  const { spec, missing } = await resolve(intent)
  const people = spec.cast.length + spec.crew.length > 0
  // A language they named wins. A named actor or director is looked for in any language. Otherwise
  // the deck's own Hindi / English choice applies.
  const langs = intent.languages?.length ? intent.languages : people ? [null] : toggleLangs(ind)
  const floor = spec.maxRuntime && spec.maxRuntime < 60 ? null : Math.max(spec.minRuntime ?? 0, RUNTIME_FLOOR)
  const base = { ...spec, minRuntime: floor }
  const empty = { strict: [], near: [], tiers: new Map(), missing }
  // Everything they named is unknown: there is nothing to be close to.
  if (missing.length && !hasCore(base)) return empty

  // Films with a named person are found even when few people have rated them.
  let votes = people ? 20 : 100
  const found = new Map()
  for (const t of await gather(base, { providers, langs, skip, votes })) found.set(t.id, t)
  if (found.size < STRICT_MIN && votes > 20) {
    votes = 20
    for (const t of await gather(base, { providers, langs, skip, votes })) if (!found.has(t.id)) found.set(t.id, t)
  }

  // With part of the request unknown, even these are only close.
  const strict = missing.length ? [] : [...found.values()]
  const near = new Map()
  const tiers = new Map()
  if (missing.length) for (const t of found.values()) { near.set(t.id, t); tiers.set(t.id, TIER.missing) }

  if (found.size < NEAR_FOR) {
    const taken = new Set([...skip, ...found.keys()])
    for (const { tier, spec: looser } of ladder(base, floor)) {
      for (const t of await gather(looser, { providers, langs, skip: taken, votes })) {
        if (near.has(t.id)) continue
        near.set(t.id, t)
        tiers.set(t.id, tier)
      }
      if (found.size + near.size >= NEAR_FOR) break
    }
  }
  return { strict, near: [...near.values()], tiers, missing }
}
