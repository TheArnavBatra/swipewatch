import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanIntent, cleanPicks, cleanProfile, text } from '../server/clean.js'
import { parseJson, rankModels } from '../server/gemini.js'
import { moodPrompt } from '../server/prompts.js'

test('text strips markup, control characters and length', () => {
  assert.equal(text('  <b>hi</b>\n\tthere  ', 50), 'bhi/b there')
  assert.equal(text('abcdef', 3), 'abc')
  assert.equal(text(42, 10), '')
})

test('cleanIntent keeps only known shapes', () => {
  const intent = cleanIntent({
    headline: 'Light <script>', genres: [35, 10749, 999, '18', 35, 28], allGenres: true, avoidGenres: [27, 35],
    themes: ['Heist', 'feel good', 'thriller', 'heist', 'time travel', 'spy'], yearFrom: 2030, yearTo: 2021,
    minRating: 11, maxRuntime: 100, minRuntime: 150, languages: ['hi', 'Korean', 'xx'],
    actors: ['Aamir Khan', 'x', 'DROP TABLE;', 'Aamir Khan'], anyActor: true, directors: ['Zoya Akhtar'],
  })
  assert.deepEqual(intent.genres, [35, 10749, 18])
  assert.equal(intent.allGenres, true)
  assert.deepEqual(intent.avoidGenres, [27])
  assert.deepEqual(intent.themes, ['heist', 'time travel'])
  assert.deepEqual([intent.yearFrom, intent.yearTo], [2021, 2030])
  assert.equal(intent.minRating, null)
  assert.deepEqual([intent.minRuntime, intent.maxRuntime], [null, 100])
  assert.deepEqual(intent.languages, ['hi', 'ko'])
  assert.deepEqual(intent.actors, ['Aamir Khan'])
  assert.equal(intent.anyActor, false)
  assert.equal(intent.headline, 'Light script')
})

test('cleanIntent survives junk', () => {
  for (const junk of [null, 'text', 7, [], [{ genres: [18] }], { genres: 'no' }]) {
    const intent = cleanIntent(junk)
    assert.ok(Array.isArray(intent.genres) && Array.isArray(intent.themes) && Array.isArray(intent.languages))
    assert.equal(intent.allGenres, false)
  }
  assert.deepEqual(cleanIntent([{ genres: [18] }]).genres, [18])
  assert.deepEqual(cleanIntent({ genres: [], language: 'ta' }).languages, ['ta'])
})

test('cleanPicks only returns offered ids, once each', () => {
  const allowed = new Set(['1', '2', '3'])
  const picks = [{ id: 2, why: 'fun <i>' }, { id: '9', why: 'x' }, { id: '2', why: 'dup' }, { id: '1' }]
  const want = [{ id: '2', why: 'fun i' }, { id: '1', why: '' }]
  assert.deepEqual(cleanPicks({ picks }, allowed), want)
  assert.deepEqual(cleanPicks([{ picks }], allowed), want)
  assert.deepEqual(cleanPicks(picks, allowed), want)
  assert.deepEqual(cleanPicks(null, allowed), [])
})

test('cleanProfile keeps usable lanes only', () => {
  const p = cleanProfile({
    summary: 'You like heists.', likes: ['a', 'b', 3], dislikes: 'no',
    lanes: [{ reason: 'More heists', genres: [80], language: 'Hindi' }, { reason: '', genres: [18] }, { reason: 'Nothing', genres: [] }, { reason: 'Tamil', genres: [18], language: 'ta' }],
  })
  assert.equal(p.lanes.length, 2)
  assert.equal(p.lanes[0].language, 'hi')
  assert.equal(p.lanes[1].language, null)
  assert.deepEqual(p.likes, ['a', 'b'])
  assert.deepEqual(p.dislikes, [])
})

test('parseJson reads fenced and wrapped answers', () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 })
  assert.deepEqual(parseJson('Here you go: {"a":[1,2]} thanks'), { a: [1, 2] })
  assert.deepEqual(parseJson('Here: [{"a":1}] done'), [{ a: 1 }])
  assert.throws(() => parseJson('42'), { code: 'BAD_JSON' })
  assert.throws(() => parseJson('no json here'), { code: 'BAD_JSON' })
})

test('rankModels prefers the newest stable flash-lite', () => {
  const names = ['gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.10-flash', 'gemini-4-flash-preview-05', 'gemini-3.5-pro', 'gemini-2.5-flash-lite']
  assert.deepEqual(rankModels(names), ['gemini-3.5-flash-lite', 'gemini-3.10-flash', 'gemini-3.5-flash', 'gemini-2.5-flash-lite'])
  assert.deepEqual(rankModels(['gemini-4-flash-preview-05']), ['gemini-4-flash-preview-05'])
  assert.deepEqual(rankModels(['text-embedding-004']), [])
})

test('moodPrompt carries the date and quotes the words', () => {
  const prompt = moodPrompt({ text: 'something recent', now: new Date('2026-11-11T12:00:00Z') })
  assert.match(prompt, /Today is 11 November 2026/)
  assert.match(prompt, /"Recent" or "new" is yearFrom 2024/)
  assert.match(prompt, /"""something recent"""/)
})
