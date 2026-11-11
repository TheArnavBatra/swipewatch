import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

// The browser code is loaded through Vite, as the app loads it, with a pretend TMDB and a pretend
// /api/ai behind fetch. No real key is read and nothing leaves the machine.
const film = (id, o) => ({
  id, title: `Film ${id}`, release_date: `${o.year ?? 2015}-06-01`, genre_ids: o.genres ?? [35], vote_average: o.rating ?? 7,
  original_language: o.lang ?? 'en', overview: 'x', runtime: o.runtime ?? 110, cast: o.cast ?? [], keywords: o.keywords ?? [], votes: o.votes ?? 500,
})
let CATALOG = []
let ai = {}
const calls = { discover: 0, ai: [] }
const PEOPLE = { 'aamir khan': 11, 'salman khan': 12 }
const KEYWORDS = { heist: 100, 'time travel': 101, 'football (soccer)': 102, 'based on true story': 103 }

const any = (v, has) => v.split('|').some(has)
const all = (v, has) => v.split(',').every(has)
const match = (v, has) => (v.includes(',') ? all(v, has) : any(v, has))

function tmdb(url) {
  const q = url.searchParams
  if (url.pathname.endsWith('/search/person')) {
    const id = PEOPLE[q.get('query').toLowerCase()]
    return { results: id ? [{ id, known_for_department: 'Acting' }] : [] }
  }
  if (url.pathname.endsWith('/search/keyword')) {
    const name = q.get('query')
    return { results: Object.entries(KEYWORDS).filter(([k]) => k.includes(name)).map(([k, id]) => ({ id, name: k })) }
  }
  calls.discover++
  const results = CATALOG.filter((m) => {
    if (q.get('with_original_language') && m.original_language !== q.get('with_original_language')) return false
    if (m.votes < Number(q.get('vote_count.gte'))) return false
    if (q.get('with_genres') && !match(q.get('with_genres'), (g) => m.genre_ids.includes(Number(g)))) return false
    if (q.get('without_genres') && any(q.get('without_genres'), (g) => m.genre_ids.includes(Number(g)))) return false
    if (q.get('vote_average.gte') && m.vote_average < Number(q.get('vote_average.gte'))) return false
    if (q.get('primary_release_date.gte') && m.release_date < q.get('primary_release_date.gte')) return false
    if (q.get('primary_release_date.lte') && m.release_date > q.get('primary_release_date.lte')) return false
    if (q.get('with_runtime.gte') && m.runtime < Number(q.get('with_runtime.gte'))) return false
    if (q.get('with_runtime.lte') && m.runtime > Number(q.get('with_runtime.lte'))) return false
    if (q.get('with_cast') && !match(q.get('with_cast'), (c) => m.cast.includes(Number(c)))) return false
    if (q.get('with_keywords') && !match(q.get('with_keywords'), (k) => m.keywords.includes(Number(k)))) return false
    return true
  })
  const page = Number(q.get('page'))
  return { results: results.slice((page - 1) * 20, page * 20), total_pages: Math.max(1, Math.ceil(results.length / 20)) }
}

let vite, moodPool, TIER, buildMoodList, differs, emptyModel
before(async () => {
  process.env.VITE_TMDB_KEY = 'test'
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} }
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), 'http://app.test')
    if (url.pathname === '/api/ai') {
      const body = JSON.parse(init.body)
      calls.ai.push(body)
      const out = ai[body.task]
      if (out instanceof Error) throw out
      return new Response(JSON.stringify(out.json), { status: out.status ?? 200 })
    }
    return new Response(JSON.stringify(tmdb(url)))
  }
  vite = await createServer({
    configFile: false, logLevel: 'silent', appType: 'custom', envDir: fileURLToPath(new URL('.', import.meta.url)),
    root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, ws: false, hmr: false }, optimizeDeps: { noDiscovery: true },
  })
  ;({ moodPool, TIER } = await vite.ssrLoadModule('/src/lib/moodPool.js'))
  ;({ buildMoodList, differs } = await vite.ssrLoadModule('/src/lib/mood.js'))
  ;({ emptyModel } = await vite.ssrLoadModule('/src/lib/taste.js'))
})
after(() => vite?.close())

const intentOf = (o = {}) => ({
  genres: [], allGenres: false, avoidGenres: [], themes: [], languages: [], actors: [], anyActor: false, directors: [],
  minRating: null, yearFrom: null, yearTo: null, minRuntime: null, maxRuntime: null, headline: 'Test', ...o,
})
const pool = (intent, extra = {}) => moodPool({ services: ['netflix'], ind: 'both', intent: intentOf(intent), ...extra })
const many = (n, from, o) => Array.from({ length: n }, (_, i) => film(from + i, o))

test('enough exact matches: nothing looser is fetched', async () => {
  CATALOG = [...many(25, 1, { genres: [35], year: 2022 }), ...many(10, 100, { genres: [35], year: 2010 })]
  const { strict, near } = await pool({ genres: [35], yearFrom: 2021 })
  assert.equal(strict.length, 25, 'second page is read too')
  assert.ok(strict.every((t) => t.year >= 2021))
  assert.equal(near.length, 0)
})

test('years are never loosened silently, and the note says so', async () => {
  CATALOG = [...many(3, 1, { genres: [35], year: 2022 }), ...many(10, 100, { genres: [35], year: 2010 }), ...many(5, 200, { genres: [18], year: 2022 })]
  const intent = intentOf({ genres: [35], yearFrom: 2021 })
  const { strict, near, tiers } = await pool(intent)
  assert.deepEqual(strict.map((t) => t.id).sort(), ['1', '2', '3'])
  assert.equal(near.length, 10)
  assert.ok(near.every((t) => tiers.get(t.id) === TIER.years && t.genreIds.includes(35)), 'the genre is kept')
  assert.equal(differs(near[0], intent, TIER.years), 'Before 2021')
})

test('blend, avoided genres and shorts', async () => {
  CATALOG = [
    ...many(2, 1, { genres: [35, 10749] }), ...many(4, 10, { genres: [35] }), film(20, { genres: [35, 10749, 27] }),
    film(21, { genres: [35, 10749], runtime: 12 }),
  ]
  const intent = intentOf({ genres: [10749, 35], allGenres: true, avoidGenres: [27] })
  const { strict, near, tiers } = await pool(intent)
  assert.deepEqual(strict.map((t) => t.id).sort(), ['1', '2'])
  assert.equal(near.length, 4)
  assert.ok(near.every((t) => tiers.get(t.id) === TIER.blend))
  assert.equal(differs(near[0], intent, TIER.blend), 'Not romance')
})

test('named actors: together first, any language, then either one', async () => {
  CATALOG = [film(1, { cast: [11, 12], lang: 'hi', votes: 30 }), film(2, { cast: [11], lang: 'ta' }), film(3, { cast: [12], lang: 'hi' }), film(4, {})]
  const intent = intentOf({ actors: ['Aamir Khan', 'Salman Khan'] })
  const { strict, near, tiers } = await pool(intent, { ind: 'hollywood' })
  assert.deepEqual(strict.map((t) => t.id), ['1'])
  assert.deepEqual(near.map((t) => t.id).sort(), ['2', '3'])
  assert.equal(strict[0].lang, 'hi')
  assert.equal(near.find((t) => t.id === '2').ind, 'ta')
  assert.equal(differs(near[0], intent, tiers.get(near[0].id)), 'Not all the named cast')
  const either = await pool({ actors: ['Aamir Khan', 'Salman Khan'], anyActor: true })
  assert.equal(either.strict.length, 3)
})

test('themes: exact keyword, bracketed name, alias, and unknown', async () => {
  CATALOG = [film(1, { keywords: [100] }), film(2, { keywords: [102] }), film(3, { keywords: [103] }), ...many(5, 10, { genres: [80] })]
  assert.deepEqual((await pool({ themes: ['heist'] })).strict.map((t) => t.id), ['1'])
  assert.deepEqual((await pool({ themes: ['football'] })).strict.map((t) => t.id), ['2'])
  assert.deepEqual((await pool({ themes: ['true story'] })).strict.map((t) => t.id), ['3'])
  const none = await pool({ themes: ['underwater basket weaving'] })
  assert.deepEqual([none.strict.length, none.near.length, none.missing.length], [0, 0, 1])
  const intent = intentOf({ genres: [80], themes: ['underwater basket weaving'] })
  const part = await pool(intent)
  assert.equal(part.strict.length, 0, 'an unknown theme can never be an exact match')
  assert.equal(part.near.length, 5)
  assert.equal(differs(part.near[0], intent, TIER.missing, part.missing), 'Not marked as underwater basket weaving')
  const two = await pool({ genres: [80], themes: ['heist'] })
  assert.equal(two.strict.length, 0)
  assert.ok(two.near.length === 5 && two.near.every((t) => two.tiers.get(t.id) === TIER.noThemes))
})

test('a named language beats the deck toggle; the toggle applies otherwise', async () => {
  CATALOG = [film(1, { lang: 'ko' }), film(2, { lang: 'hi' }), film(3, { lang: 'en' })]
  assert.deepEqual((await pool({ languages: ['ko'] }, { ind: 'bollywood' })).strict.map((t) => t.id), ['1'])
  assert.deepEqual((await pool({}, { ind: 'bollywood' })).strict.map((t) => t.id), ['2'])
  assert.equal((await pool({})).strict.length, 2, 'an empty request is not an error')
  assert.equal((await pool({}, { exclude: ['2', '3'] })).strict.length, 0)
})

test('rating and runtime notes say only what is known', async () => {
  CATALOG = [film(1, { rating: 8 }), film(2, { rating: 6 }), film(3, { rating: 8, runtime: 170 })]
  const intent = intentOf({ genres: [35], minRating: 7.5 })
  const a = await pool(intent)
  assert.equal(a.strict.length, 2)
  assert.equal(differs(a.near[0], intent, a.tiers.get('2')), 'Rated below 7.5')
  const short = intentOf({ genres: [35], maxRuntime: 120 })
  const b = await pool(short)
  assert.deepEqual(b.near.map((t) => t.id), ['3'])
  assert.equal(differs(b.near[0], short, b.tiers.get('3')), 'Runs over 120 min')
})

const build = (o = {}) => buildMoodList({ text: 'something light', services: ['netflix'], ind: 'both', exclude: [], model: emptyModel(), profile: null, onStep() {}, ...o })

test('buildMoodList: picks lead, unknown ids are ignored, taste stays out of the mood request', async () => {
  CATALOG = many(6, 1, { genres: [35] })
  calls.ai = []
  ai = { mood: { json: { intent: intentOf({ genres: [35], headline: 'Light' }) } }, rank: { json: { picks: [{ id: '4', why: 'Warm' }, { id: '999', why: 'ghost' }, { id: '2', why: 'Easy' }] } } }
  const out = await build({ profile: { summary: 'You like horror.', likes: [], dislikes: [] } })
  assert.deepEqual(out.list.slice(0, 2).map((t) => [t.id, t.why]), [['4', 'Warm'], ['2', 'Easy']])
  assert.equal(out.list.length, 6)
  assert.ok(out.list.every((t) => t.title))
  assert.equal(out.closest, false)
  assert.deepEqual(Object.keys(calls.ai[0]).sort(), ['task', 'text'])
  assert.equal(calls.ai[1].taste.summary, 'You like horror.')
})

test('buildMoodList: rank failure keeps the list; closest lists skip the rank; errors are plain', async () => {
  CATALOG = many(6, 1, { genres: [35] })
  ai = { mood: { json: { intent: intentOf({ genres: [35] }) } }, rank: { status: 429, json: { kind: 'quota', error: 'spent', retryAfter: 30 } } }
  assert.equal((await build()).list.length, 6)

  calls.ai = []
  ai.mood = { json: { intent: intentOf({ genres: [35], yearFrom: 2024, headline: 'New comedies' }) } }
  const closest = await build()
  assert.equal(closest.closest, true)
  assert.ok(closest.list.every((t) => t.why === 'Before 2024'))
  assert.equal(calls.ai.length, 1, 'no second AI request for a closest-only list')

  ai.mood = { json: { intent: intentOf({ genres: [99], headline: 'Documentaries' }) } }
  await assert.rejects(build(), /Nothing on your services fits "Documentaries"/)
  ai.mood = { json: { intent: intentOf({ actors: ['Nobody Atall'] }) } }
  await assert.rejects(build(), /Could not find Nobody Atall/)
  ai.mood = { status: 422, json: { kind: 'blocked', error: 'Gemini would not answer that. Try different words.' } }
  await assert.rejects(build(), { kind: 'blocked' })
  ai.mood = { json: { nonsense: true } }
  await assert.rejects(build(), { kind: 'bad' })
  ai.mood = new TypeError('fetch failed')
  await assert.rejects(build(), { kind: 'network' })
})

test('buildMoodList: a cancelled request stops quietly', async () => {
  CATALOG = many(6, 1, { genres: [35] })
  ai = { mood: { json: { intent: intentOf({ genres: [35] }) } }, rank: { json: { picks: [] } } }
  const run = new AbortController()
  const pending = build({ signal: run.signal, onStep: (s) => { if (s.startsWith('Looking')) run.abort() } })
  await assert.rejects(pending, { kind: 'cancelled' })
})

test('buildMoodList: closest matches that miss less come first', async () => {
  CATALOG = [
    ...[1, 2, 3, 4].map((n) => film(n, { genres: [28], year: 2010 + n, cast: [12], rating: 8 })),
    film(5, { genres: [28], year: 1995, cast: [12], rating: 5 }),
    film(6, { genres: [28], year: 1999, cast: [11], rating: 5 }),
  ]
  ai = { mood: { json: { intent: intentOf({ genres: [28], yearFrom: 1990, yearTo: 1999, actors: ['Aamir Khan', 'Salman Khan'] }) } } }
  const out = await build()
  assert.equal(out.closest, true)
  assert.deepEqual(out.list.slice(0, 2).map((t) => t.why), ['Not all the named cast', 'Not all the named cast'])
  assert.ok(out.list.slice(2).every((t) => t.why === 'Not all the named cast · After 1999'))
  assert.ok(out.list.every((t) => !('misses' in t)))
})
