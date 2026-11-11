import { GeminiError, createGemini } from './gemini.js'
import { cleanIntent, cleanPicks, cleanProfile, text } from './clean.js'
import { SYSTEM, moodPrompt, profilePrompt, rankPrompt } from './prompts.js'
import { MOOD, PROFILE, RANK } from './schemas.js'

const WINDOW_MS = 60 * 60 * 1000

// The longest each kind of request may take, retries included. The browser waits a few seconds
// longer than this (src/lib/ai.js), so what it hears is this server's own answer.
const DEADLINE_MS = { mood: 20_000, rank: 12_000, profile: 40_000 }

class LimitError extends Error {
  constructor(seconds) {
    super('Too many AI requests in an hour.')
    this.seconds = seconds
  }
}

const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : [])
const year = (v) => {
  const n = Math.round(Number(v))
  return n >= 1888 && n <= 2100 ? n : null
}
const genres = (v) => list(v, 4).map((g) => text(g, 20)).filter(Boolean)
const phrases = (v, max) => list(v, max).map((s) => text(s, 40)).filter(Boolean)

const title = (t) => ({ title: text(t?.title, 80), year: year(t?.year), genres: genres(t?.genres), verdict: text(t?.verdict, 20) })
const titles = (v, max) => list(v, max).map(title).filter((t) => t.title)
const candidate = (c) => ({
  ...title(c),
  id: text(String(c?.id ?? ''), 20),
  rating: Number.isFinite(Number(c?.rating)) && c?.rating ? Math.round(Number(c.rating) * 10) / 10 : null,
  blurb: text(c?.blurb, 150),
})
const taste = (t) => (t && text(t.summary, 240)
  ? { summary: text(t.summary, 240), likes: phrases(t.likes, 5), dislikes: phrases(t.dislikes, 4) }
  : null)
// The person's words sit between triple quotes in the prompt, so they may not hold any themselves.
const words = (v) => text(v, 300).replaceAll('"""', '"')

const ok = (json) => ({ status: 200, json })
const bad = (error) => ({ status: 400, json: { kind: 'bad', error } })
const reply = (status, kind, error, extra) => ({ status, json: { kind, error, ...extra } })

// retryAfter is in seconds: how long the browser should hold back its background requests.
function quota(e) {
  if (e.daily) return reply(429, 'quota', "Gemini's free allowance for today is used up. Try again tomorrow.", { retryAfter: 3600 })
  const seconds = e.retryMs ? Math.ceil(e.retryMs / 1000) : null
  if (seconds && seconds <= 90) return reply(429, 'quota', "Gemini's free allowance is used up for the moment. Try again in a minute.", { retryAfter: Math.max(seconds, 15) })
  return reply(429, 'quota', "Gemini's free allowance is used up for now. Try again in a while.", { retryAfter: Math.min(seconds ?? 600, 3600) })
}

function failure(task, e, log) {
  if (e instanceof LimitError) return reply(429, 'quota', 'That is a lot of AI requests in an hour. Give it a little while.', { retryAfter: e.seconds })
  if (!(e instanceof GeminiError)) {
    log.error(`[ai] ${task} crashed:`, e)
    return reply(500, 'failed', 'Something went wrong on the server.')
  }
  log.error(`[ai] ${task} failed: ${e.status} ${e.code} ${e.message}`, e.detail ? JSON.stringify(e.detail) : '')
  if (e.status === 429 || e.code === 'RESOURCE_EXHAUSTED') return quota(e)
  if (e.status === 401 || e.status === 403 || /api key/i.test(e.message)) return reply(502, 'key', 'Gemini did not accept the key. Check GEMINI_API_KEY in .env.local.')
  if (e.status === 404) return reply(502, 'model', 'Gemini could not find a model to use. You can set GEMINI_MODEL in .env.local.')
  if (e.code === 'BLOCKED') return reply(422, 'blocked', 'Gemini would not answer that. Try different words.')
  if (e.status === 504) return reply(504, 'timeout', 'Gemini took too long to answer. Try again.')
  if (e.status === 503 || e.status === 500) return reply(503, 'busy', 'Gemini is busy right now. Try again in a moment.')
  if (e.code === 'NETWORK') return reply(502, 'network', 'The server could not reach Gemini. Check the connection and try again.')
  if (e.code === 'BAD_JSON' || e.code === 'EMPTY') return reply(502, 'bad', 'Gemini sent back an answer the app could not read. Try again.')
  return reply(502, 'failed', 'Gemini could not answer right now.')
}

// Returns { status, json } so the same logic can sit behind the dev server today and a hosted
// function later. The options exist for tests: a fixed clock, a lower cap, a quiet log.
export function createAiHandler(env, { now = () => new Date(), maxPerHour = 60, log = console } = {}) {
  const key = env.GEMINI_API_KEY?.trim()
  const gemini = key
    ? createGemini({ key, model: env.GEMINI_MODEL?.trim() || null, base: env.GEMINI_BASE_URL?.trim() || undefined })
    : null

  // A cap on how often this machine can spend the Gemini allowance, whoever is asking. Only
  // requests that reach Gemini count.
  const recent = []
  function spend() {
    const t = Date.now()
    while (recent.length && t - recent[0] > WINDOW_MS) recent.shift()
    if (recent.length >= maxPerHour) throw new LimitError(Math.max(1, Math.ceil((recent[0] + WINDOW_MS - t) / 1000)))
    recent.push(t)
  }

  async function ask(task, prompt, schema) {
    spend()
    const out = await gemini.generateJson({ system: SYSTEM, prompt, schema, deadlineMs: DEADLINE_MS[task] })
    const used = out.usage ?? {}
    log.info(
      `[ai] ${task} answered in ${out.ms} ms by ${out.model}${out.tries > 1 ? ` (try ${out.tries})` : ''}: ` +
      `${used.promptTokenCount ?? '?'} tokens in, ${used.candidatesTokenCount ?? '?'} out${used.thoughtsTokenCount ? `, ${used.thoughtsTokenCount} thinking` : ''}`,
    )
    return out.json
  }

  return async function handle(method, path, body) {
    if (method === 'GET' && path === '/status') return ok({ ready: Boolean(gemini) })
    if (method !== 'POST' || path !== '/') return { status: 404, json: { error: 'Not found' } }
    if (!gemini) return reply(503, 'nokey', 'Add GEMINI_API_KEY to .env.local and restart the dev server.')

    const task = body?.task
    try {
      if (task === 'mood') {
        const said = words(body.text)
        if (said.length < 3) return bad('Say a little more about how you feel.')
        const raw = await ask('mood', moodPrompt({ text: said, now: now() }), MOOD)
        return ok({ intent: cleanIntent(raw) })
      }
      if (task === 'rank') {
        const candidates = list(body.candidates, 40).map(candidate).filter((c) => c.id && c.title)
        if (candidates.length < 3) return bad('Not enough titles to sort.')
        const prompt = rankPrompt({ text: words(body.text), headline: text(body.headline, 60), taste: taste(body.taste), candidates })
        const raw = await ask('rank', prompt, RANK)
        return ok({ picks: cleanPicks(raw, new Set(candidates.map((c) => c.id))) })
      }
      if (task === 'profile') {
        const input = {
          kept: titles(body.kept, 30), skipped: titles(body.skipped, 25),
          hidden: titles(body.hidden, 20), seen: titles(body.seen, 25),
          leans: { likes: phrases(body.leans?.likes, 4), dislikes: phrases(body.leans?.dislikes, 4) },
        }
        if (input.kept.length + input.skipped.length + input.hidden.length + input.seen.length < 5) return bad('Not enough choices to learn from yet.')
        const raw = await ask('profile', profilePrompt({ ...input, now: now() }), PROFILE)
        return ok({ profile: cleanProfile(raw) })
      }
      return bad('Unknown request.')
    } catch (e) {
      return failure(task, e, log)
    }
  }
}
