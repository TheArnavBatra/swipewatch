import { GENRES } from './genres'
import { LANGUAGES } from './languages'

// A small online logistic-regression model. Each title becomes a handful of features (genres,
// language, decade, rating band). Each swipe nudges the weight of those features toward or away
// from the title, so the score is the model's estimate that you would keep a similar title.
//
// Marking a title watched is not a signal on its own: it says you have seen it, not that you
// liked it. Only the optional "Liked it" / "Not for me" answer teaches the model.

const LEARNING_RATE = 0.6
const DECAY = 0.01
export const MIN_SIGNALS = 5
const EXPLORE_EVERY = 5

// label: what the title was (1 liked, 0 not liked). weight: how much we trust it.
const SIGNALS = {
  yes: { label: 1, weight: 1 },
  never: { label: 0, weight: 1.5 },
  skip: { label: 0, weight: 0.3 },
  liked: { label: 1, weight: 0.7 },
  meh: { label: 0, weight: 1 },
}

export const emptyModel = () => ({ w: {}, b: 0, n: 0 })

const sigmoid = (z) => 1 / (1 + Math.exp(-z))

export function features(item) {
  const out = []
  if (item.genreIds?.length) for (const g of item.genreIds) out.push(`g:${g}`)
  else if (item.genre) out.push(`g:${item.genre}`)
  if (item.ind) out.push(`l:${item.ind}`)
  if (item.year) out.push(`d:${Math.floor(item.year / 10) * 10}`)
  if (item.rating) out.push(`r:${item.rating >= 8 ? 'great' : item.rating >= 7 ? 'good' : item.rating >= 6 ? 'ok' : 'low'}`)
  return out
}

export function score(model, item) {
  let z = model.b
  for (const f of features(item)) z += model.w[f] ?? 0
  return sigmoid(z)
}

// scale softens a swipe that says less about long-term taste, such as one made for a passing mood.
export function learn(model, item, signal, scale = 1) {
  const s = SIGNALS[signal]
  if (!s) return model
  const error = (s.label - score(model, item)) * s.weight * LEARNING_RATE * scale
  const w = { ...model.w }
  for (const f of features(item)) w[f] = (w[f] ?? 0) * (1 - DECAY) + error
  return { w, b: model.b + error * 0.5, n: model.n + 1 }
}

export const isReady = (model) => model.n >= MIN_SIGNALS

// Best-scoring first, except that every fifth slot is drawn at random so the deck keeps
// showing things outside what the model already likes.
export function rank(model, items) {
  if (!isReady(model) || items.length < 2) return items
  const pool = items
    .map((item) => ({ item, s: score(model, item) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.item)
  const out = []
  while (pool.length) {
    const i = out.length % EXPLORE_EVERY === EXPLORE_EVERY - 1 ? Math.floor(Math.random() * pool.length) : 0
    out.push(pool.splice(i, 1)[0])
  }
  return out
}

const clamp01 = (n) => Math.max(0, Math.min(1, n))

// A list for a described mood: how much the model expects them to like a title, blended with how
// well it fits the mood and how well it is rated. Until the model knows their taste, the mood decides.
// A title that matched everything asked for always comes before one found only after loosening
// the search (tiers says which step found each title).
export function rankForMood(model, items, intent, tiers = new Map()) {
  const wanted = intent.genres ?? []
  const fit = (item) => {
    if (!wanted.length) return 0.5
    const hits = wanted.filter((g) => item.genreIds?.includes(g)).length
    return Math.min(1, hits / Math.min(wanted.length, 2))
  }
  const quality = (item) => (item.rating ? clamp01((item.rating - 5) / 4) : 0.5)
  const taste = isReady(model) ? 0.45 : 0
  return items
    .map((item) => ({
      item,
      tier: tiers.get(item.id) ?? 0,
      s: taste * score(model, item) + (0.9 - taste) * fit(item) + 0.1 * quality(item),
    }))
    .sort((a, b) => a.tier - b.tier || b.s - a.s)
    .map((x) => x.item)
}

// Genres the model clearly likes, as TMDB ids, strongest first.
export function favoriteGenres(model, count = 2) {
  if (!isReady(model)) return []
  return Object.entries(model.w)
    .filter(([f, w]) => /^g:\d+$/.test(f) && w > 0.3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([f]) => Number(f.slice(2)))
}

const FEATURE_LABEL = {
  'l:bollywood': 'Hindi films',
  'l:hollywood': 'English films',
  'r:great': 'highly rated films',
  'r:good': 'well-rated films',
}

function labelFor(feature) {
  if (FEATURE_LABEL[feature]) return FEATURE_LABEL[feature]
  const [kind, value] = [feature[0], feature.slice(2)]
  if (kind === 'g') return GENRES[value] ?? value
  if (kind === 'd') return `${value}s films`
  if (kind === 'l' && Object.hasOwn(LANGUAGES, value)) return `${LANGUAGES[value]} films`
  return null
}

// The strongest likes and dislikes the model has found, as short phrases the AI can build on.
export function leanings(model, count = 4) {
  const found = Object.entries(model.w)
    .map(([f, w]) => ({ label: labelFor(f), w }))
    .filter((x) => x.label && Math.abs(x.w) > 0.3)
  const top = (sign) => found
    .filter((x) => Math.sign(x.w) === sign)
    .sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
    .slice(0, count)
    .map((x) => x.label)
  return { likes: top(1), dislikes: top(-1) }
}

// The feature that most explains why this title scored well, as a short phrase. Null when no
// feature is a clear positive, so a card never claims a reason the model does not have.
export function reasonFor(model, item) {
  if (!isReady(model)) return null
  let best = null
  for (const f of features(item)) {
    const w = model.w[f] ?? 0
    if (w > 0.3 && (!best || w > best.w) && labelFor(f)) best = { f, w }
  }
  return best ? labelFor(best.f) : null
}
