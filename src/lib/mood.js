import { AiError, askMood, askRank } from './ai'
import { GENRES } from './genres'
import { brief } from './profile'
import { rankForMood } from './taste'
import { TIER, moodPool } from './moodPool'

const LIST_SIZE = 20
const SORT_POOL = 30

const candidate = (t) => ({
  id: t.id,
  title: t.title,
  year: t.year,
  genres: (t.genreIds ?? []).map((g) => GENRES[g]).filter(Boolean).slice(0, 3),
  rating: t.rating,
  blurb: (t.blurb ?? '').slice(0, 150),
})

const genreNames = (ids) => ids.map((g) => GENRES[g]).filter(Boolean).join(' or ').toLowerCase()

// How a near match differs from what was asked, in a few words, so no card passes for an exact fit.
// Only what is known is said: either the title's own details show it, or the search that found it
// (its tier) had let go of exactly that part of the request.
function gaps(item, intent, tier, missing = []) {
  const parts = missing.map((m) => (m.kind === 'theme' ? `Not marked as ${m.name}` : `${m.name} not found`))
  if (tier === TIER.sample) parts.push('Sample title, only partly checked')
  if (tier === TIER.genres) parts.push(`Not ${genreNames(intent.genres)}`)
  if (tier === TIER.noThemes) parts.push(`Not marked as ${intent.themes.join(' or ')}`)
  if (tier === TIER.themes) parts.push('Only one of the two themes')
  if (tier === TIER.cast) parts.push('Not all the named cast')
  const lacks = intent.allGenres ? intent.genres.filter((g) => !item.genreIds?.includes(g)) : []
  if (tier >= TIER.blend && tier !== TIER.sample && lacks.length && lacks.length < intent.genres.length) parts.push(`Not ${genreNames(lacks)}`)
  if (intent.yearFrom && item.year && item.year < intent.yearFrom) parts.push(`Before ${intent.yearFrom}`)
  if (intent.yearTo && item.year && item.year > intent.yearTo) parts.push(`After ${intent.yearTo}`)
  const lowRated = Boolean(intent.minRating && item.rating && item.rating < intent.minRating)
  if (lowRated) parts.push(`Rated below ${intent.minRating}`)
  // TMDB leaves a title out for its runtime without saying what the runtime is. At the first tier
  // a title that passes on rating can only have been left out for its length.
  if (tier === TIER.quality && !lowRated && !intent.minRating) {
    if (intent.maxRuntime && !intent.minRuntime) parts.push(`Runs over ${intent.maxRuntime} min`)
    else if (intent.minRuntime && !intent.maxRuntime) parts.push(`Runs under ${intent.minRuntime} min`)
    else if (intent.minRuntime) parts.push('Not the length you asked for')
  }
  return parts
}

export const differs = (...args) => gaps(...args).slice(0, 2).join(' · ') || 'Close, not exact'

// Turns a few words about how someone feels into a short, temporary list. The AI reads the mood as
// search filters, TMDB finds real titles on their services, their taste model sorts them, and the
// AI lines up the best fits with a reason for each (that last step is optional).
//
// Titles that fit everything asked for form the list. Looser ones come back separately as `near`,
// each saying how it differs, for the person to opt into. Only when nothing fits exactly is the
// near list the list itself (closest: true).
export async function buildMoodList({ text, services, ind, exclude, model, profile, onStep, signal }) {
  const taste = brief(profile)

  onStep('Reading your mood…')
  // Taste is not sent here: it would leak into the filters. It only sorts the results, further down.
  const { intent } = await askMood({ text, signal })
  const headline = intent.headline || text.slice(0, 40)

  onStep('Looking through your services…')
  let pool
  try {
    pool = await moodPool({ services, ind, intent, exclude })
  } catch {
    throw new Error('Could not load titles right now. Check your connection and try again.')
  }
  // The person gave up while the titles were loading.
  if (signal?.aborted) throw new AiError('cancelled', 'Cancelled.')
  const { strict, near, tiers, missing } = pool
  if (!strict.length && !near.length) {
    if (missing.length) throw new Error(`Could not find ${missing.map((m) => m.name).join(' or ')} in the film database. Check the spelling, or try other words.`)
    throw new Error(`Nothing on your services fits "${headline}" right now. Try other words, or add a service.`)
  }
  // Closest first: a title that misses one part of the request leads one that misses two. Within
  // the same number of misses the taste order stands (the sort is stable).
  const misses = (t) => gaps(t, intent, tiers.get(t.id), missing).length
  const closer = rankForMood(model, near, intent, tiers)
    .map((t) => ({ ...t, why: differs(t, intent, tiers.get(t.id), missing) }))
    .sort((a, b) => misses(a) - misses(b))
  if (!strict.length) return { list: closer.slice(0, LIST_SIZE), near: [], headline, closest: true }

  const sorted = rankForMood(model, strict, intent)
  onStep('Lining them up for you…')
  let list = sorted.slice(0, LIST_SIZE)
  if (sorted.length >= 3) {
    try {
      const { picks } = await askRank({
        signal, text, headline: intent.headline, taste, candidates: sorted.slice(0, SORT_POOL).map(candidate),
      })
      if (picks.length >= 3) {
        const byId = new Map(sorted.map((t) => [t.id, t]))
        const known = picks.filter((p) => byId.has(p.id))
        const chosen = known.map((p) => ({ ...byId.get(p.id), ...(p.why && { why: p.why }) }))
        const rest = sorted.filter((t) => !known.some((p) => p.id === t.id))
        list = [...chosen, ...rest].slice(0, LIST_SIZE)
      }
    } catch (e) {
      if (e?.kind === 'cancelled') throw e
      // The list is still sorted for their taste, just without the AI's one-line reasons.
    }
  }
  return { list, near: closer, headline, closest: false }
}
