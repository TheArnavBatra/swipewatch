import { GENRES } from '../src/lib/genres.js'
import { LANGUAGES } from '../src/lib/languages.js'

// Whatever Gemini sends back is untrusted text. These helpers keep only the shapes the app expects,
// so a strange answer can narrow a search but never break the app or reach the page as markup.

const GENRE_IDS = new Set(Object.keys(GENRES).map(Number))
const LANGUAGE_BY_NAME = new Map(Object.entries(LANGUAGES).map(([code, name]) => [name.toLowerCase(), code]))

export const text = (v, max) =>
  typeof v === 'string' ? v.replace(/\p{Cc}+/gu, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : ''

// A model sometimes wraps its one object in a list.
const one = (raw) => (Array.isArray(raw) ? raw[0] : raw)

const whole = (v, lo, hi) => {
  if (v === null || v === '' || typeof v === 'boolean') return null
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null
}

const rating = (v) => {
  if (v === null || v === '' || typeof v === 'boolean') return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 4 && n <= 9 ? Math.round(n * 10) / 10 : null
}

const genreIds = (v, max = 3) =>
  [...new Set((Array.isArray(v) ? v : []).map(Number).filter((g) => GENRE_IDS.has(g)))].slice(0, max)

// A language comes back as a code or, now and then, as its name.
const languageCode = (v) => {
  const s = text(v, 20).toLowerCase()
  return Object.hasOwn(LANGUAGES, s) ? s : LANGUAGE_BY_NAME.get(s) ?? null
}

const languageCodes = (v, max) =>
  [...new Set((Array.isArray(v) ? v : [v]).map(languageCode).filter(Boolean))].slice(0, max)

// A person's name is letters, spaces and a few marks. Anything else is not a name and is dropped.
const names = (v, max) =>
  [...new Set((Array.isArray(v) ? v : [])
    .map((n) => text(n, 40))
    .filter((n) => n.length >= 2 && /^[\p{L}\p{M} .'-]+$/u.test(n)))]
    .slice(0, max)

const phrases = (v, max, size) => (Array.isArray(v) ? v : []).map((s) => text(s, size)).filter(Boolean).slice(0, max)

// A theme is a subject to look up as a database keyword. A genre, or a word for how a film feels,
// is not one: searched as a keyword it would throw away nearly every film that fits.
const plain = (s) => s.toLowerCase().replace(/-/g, ' ')
const NOT_THEMES = new Set([
  ...Object.values(GENRES).map(plain),
  'science fiction', 'romcom', 'rom com', 'feel good', 'feelgood', 'dark', 'light', 'lighthearted', 'light hearted',
  'funny', 'sad', 'happy', 'scary', 'gripping', 'emotional', 'uplifting', 'heartwarming', 'romantic', 'intense',
  'suspense', 'suspenseful', 'thrilling', 'inspiring', 'inspirational', 'relaxing', 'cozy', 'cosy', 'wholesome',
  'slow burn', 'fast paced', 'easy watch', 'tearjerker', 'gritty', 'quirky', 'fun', 'serious', 'mood',
])

const themes = (v, max) => {
  const out = []
  for (const item of Array.isArray(v) ? v : []) {
    const theme = text(item, 40).toLowerCase().replace(/[^\p{L}\p{N} '&.()-]/gu, ' ').replace(/\s+/g, ' ').trim()
    if (theme.length < 2 || NOT_THEMES.has(plain(theme)) || out.includes(theme)) continue
    out.push(theme)
    if (out.length === max) break
  }
  return out
}

// The part a mood and a search lane have in common.
function filters(raw) {
  let yearFrom = whole(raw?.yearFrom, 1900, 2100)
  let yearTo = whole(raw?.yearTo, 1900, 2100)
  if (yearFrom && yearTo && yearFrom > yearTo) [yearFrom, yearTo] = [yearTo, yearFrom]
  return {
    genres: genreIds(raw?.genres),
    minRating: rating(raw?.minRating),
    yearFrom,
    yearTo,
    actors: names(raw?.actors, 3),
    directors: names(raw?.directors, 2),
  }
}

export function cleanIntent(reply) {
  const raw = one(reply)
  const f = filters(raw)
  let minRuntime = whole(raw?.minRuntime, 30, 300)
  const maxRuntime = whole(raw?.maxRuntime, 30, 400)
  if (minRuntime && maxRuntime && minRuntime > maxRuntime) minRuntime = null
  return {
    ...f,
    // Both flags only mean something when there is more than one thing to combine.
    allGenres: raw?.allGenres === true && f.genres.length > 1,
    anyActor: raw?.anyActor === true && f.actors.length > 1,
    avoidGenres: genreIds(raw?.avoidGenres).filter((g) => !f.genres.includes(g)),
    themes: themes(raw?.themes, 2),
    languages: languageCodes(raw?.languages ?? raw?.language, 4),
    minRuntime,
    maxRuntime,
    headline: text(raw?.headline, 60),
  }
}

export function cleanProfile(reply) {
  const raw = one(reply)
  // A lane runs inside the deck's own Hindi / English toggle, so those are the languages it can name.
  const laneLanguage = (v) => languageCodes(v, 4).find((code) => code === 'hi' || code === 'en') ?? null
  const lanes = (Array.isArray(raw?.lanes) ? raw.lanes : [])
    .slice(0, 10)
    .map((l) => ({ reason: text(l?.reason, 60), ...filters(l), language: laneLanguage(l?.language) }))
    .filter((l) => l.reason && (l.genres.length || l.actors.length || l.directors.length))
    .slice(0, 3)
  return {
    summary: text(raw?.summary, 240),
    likes: phrases(raw?.likes, 5, 40),
    dislikes: phrases(raw?.dislikes, 4, 40),
    lanes,
  }
}

// Only ids the app itself offered can come back, each once, with a short plain-text reason.
export function cleanPicks(raw, allowed) {
  // Usually { picks: [...] }; now and then that object wrapped in a list, or the bare list of picks.
  const picks = [raw?.picks, raw?.[0]?.picks, raw].find(Array.isArray) ?? []
  const seen = new Set()
  const out = []
  for (const p of picks) {
    const id = String(p?.id ?? '')
    if (!allowed.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push({ id, why: text(p?.why, 70) })
    if (out.length === 15) break
  }
  return out
}
