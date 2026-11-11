// Talks to the Gemini REST API from the server side, so the key never reaches the browser.

export class GeminiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

const DEFAULT_BASE = 'https://generativelanguage.googleapis.com'
const DEFAULT_DEADLINE_MS = 30_000
const LIST_TIMEOUT_MS = 10_000
const MAX_TRIES = 3
const MIN_TRY_MS = 3000 // not worth starting another try with less time than this left
const BUSY_WAIT_MS = 1500 // Google's 503 "high demand" usually clears within a moment
const SHORT_WAIT_MS = 5000 // a quota wait this short is sat out rather than reported
const REST_MS = 60 * 60 * 1000 // how long a model that has run out for the day is left alone
const REFUSALS = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'LANGUAGE'])

// Model names change every few months, so the choice is read from the key's own model list. First
// the newest stable Flash-Lite (the cheapest, with the most free quota), then the other stable
// Flash models, newest first, to fall back on when the first one's allowance runs out.
const STABLE = /^gemini-(\d+(?:\.\d+)*)-(flash-lite|flash)$/
const PREVIEW = /^gemini-(\d+(?:\.\d+)*)-(flash-lite|flash)-preview/

export function rankModels(names) {
  const read = (re) => names
    .map((name) => [name, re.exec(name)])
    .filter(([, m]) => m)
    .map(([name, m]) => ({ name, lite: m[2] === 'flash-lite', version: m[1].split('.').map(Number) }))
  // 3.10 is newer than 3.5, so versions are compared part by part, not as decimals.
  const newestFirst = (a, b) => {
    for (let i = 0; i < Math.max(a.version.length, b.version.length); i++) {
      const gap = (b.version[i] ?? 0) - (a.version[i] ?? 0)
      if (gap) return gap
    }
    return Number(b.lite) - Number(a.lite)
  }
  const stable = read(STABLE).sort(newestFirst)
  const found = stable.length ? stable : read(PREVIEW).sort(newestFirst)
  const first = found.find((m) => m.lite) ?? found[0]
  return first ? [first, ...found.filter((m) => m !== first)].slice(0, 4).map((m) => m.name) : []
}

export const bestModel = (names) => rankModels(names)[0] ?? null

// Gemini is asked for JSON, but a model can still wrap it in a code fence or add a line around it.
// Only an object or a list is an answer; a bare number or word is not.
export function parseJson(text) {
  const body = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  // Whichever bracket opens first marks where the answer starts.
  const cuts = [['{', '}'], ['[', ']']]
    .map(([open, close]) => [body.indexOf(open), body.lastIndexOf(close)])
    .filter(([from, to]) => from >= 0 && to > from)
    .sort((a, b) => a[0] - b[0])
    .map(([from, to]) => body.slice(from, to + 1))
  for (const shape of [body, ...cuts]) {
    try {
      const value = JSON.parse(shape)
      if (value && typeof value === 'object') return value
    } catch {
      // Not this shape; try the next one.
    }
  }
  throw new GeminiError(502, 'BAD_JSON', 'Gemini sent back something that was not JSON.')
}

// A 429 says how long to wait, and whether it is the minute's allowance or the day's that ran out.
function quotaDetail(details) {
  const list = Array.isArray(details) ? details : []
  const seconds = parseFloat(list.find((d) => typeof d?.retryDelay === 'string')?.retryDelay)
  const daily = list.some((d) => Array.isArray(d?.violations) && d.violations.some((v) => /per ?day/i.test(String(v?.quotaId ?? ''))))
  return { retryMs: Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null, daily }
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function createGemini({ key, model = null, base = DEFAULT_BASE }) {
  // The models to use, best first. A model named in GEMINI_MODEL is the only one.
  let models = model ? [model] : null
  let listing = null
  const restUntil = new Map()
  const rested = (name) => (restUntil.get(name) ?? 0) <= Date.now()

  async function call(path, init, timeoutMs) {
    let res
    let raw
    try {
      res = await fetch(`${base}/v1beta/${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        signal: AbortSignal.timeout(Math.max(1, Math.round(timeoutMs))),
      })
      raw = await res.text()
    } catch (e) {
      const slow = e?.name === 'TimeoutError' || e?.name === 'AbortError'
      throw new GeminiError(slow ? 504 : 502, slow ? 'TIMEOUT' : 'NETWORK', slow ? 'Gemini took too long.' : 'Could not reach Gemini.')
    }
    let data = null
    try { data = JSON.parse(raw) } catch { /* error pages are not always JSON */ }
    if (!res.ok) {
      const message = String(data?.error?.message ?? raw.slice(0, 200)).split(key).join('[key]')
      const error = new GeminiError(res.status, data?.error?.status ?? '', message)
      if (res.status === 429) Object.assign(error, quotaDetail(data?.error?.details))
      throw error
    }
    return data
  }

  async function listModels(timeoutMs) {
    const names = []
    let token = ''
    for (let page = 0; page < 5; page++) {
      const qs = new URLSearchParams({ pageSize: '200', ...(token && { pageToken: token }) })
      const data = await call(`models?${qs}`, { method: 'GET' }, timeoutMs)
      for (const m of data?.models ?? []) {
        const methods = m.supportedGenerationMethods ?? m.supportedActions ?? []
        if (methods.includes('generateContent')) names.push(String(m.name).replace(/^models\//, ''))
      }
      token = data?.nextPageToken ?? ''
      if (!token) break
    }
    const ranked = rankModels(names)
    if (!ranked.length) throw new GeminiError(404, 'NO_MODEL', 'No Flash model is available for this key.')
    return ranked
  }

  // Requests that arrive together share one look at the model list.
  async function candidates(timeoutMs) {
    if (models) return models
    listing ??= listModels(timeoutMs).finally(() => { listing = null })
    models = await listing
    return models
  }

  // A schema holds Gemini to well-formed JSON of a known shape. If Google ever refuses the field,
  // requests carry on without it for the rest of the run.
  let schemaRefused = false

  async function generate(name, { system, prompt, schema }, timeoutMs) {
    const post = (withSchema) => call(`models/${name}:generateContent`, {
      method: 'POST',
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          ...(withSchema && { responseJsonSchema: schema }),
          maxOutputTokens: 4096,
        },
      }),
    }, timeoutMs)

    let data
    try {
      data = await post(Boolean(schema) && !schemaRefused)
    } catch (e) {
      if (!schema || schemaRefused || e.status !== 400 || !/schema/i.test(e.message)) throw e
      schemaRefused = true
      data = await post(false)
    }

    // A reply can arrive in several parts; a model that thinks aloud marks those parts, and they are not the answer.
    const candidate = data?.candidates?.[0]
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : []
    const reply = parts.filter((p) => typeof p?.text === 'string' && !p.thought).map((p) => p.text).join('')
    if (!reply.trim()) {
      const refused = data?.promptFeedback?.blockReason ?? (REFUSALS.has(candidate?.finishReason) ? candidate.finishReason : null)
      if (refused) throw new GeminiError(502, 'BLOCKED', `Gemini would not answer (${refused}).`)
      throw new GeminiError(502, 'EMPTY', `Gemini returned no text${candidate?.finishReason ? ` (${candidate.finishReason})` : ''}.`)
    }
    try {
      return { json: parseJson(reply), model: name, usage: data.usageMetadata ?? null }
    } catch (e) {
      // For the server log only: how the reply started and ended, and why it stopped.
      e.detail = { finishReason: candidate.finishReason, length: reply.length, head: reply.slice(0, 160), tail: reply.slice(-120) }
      throw e
    }
  }

  // How long to wait before another try, or null when another try would not help.
  function retryIn(e, name) {
    if (e.status === 429) {
      if (!e.daily && e.retryMs !== null && e.retryMs <= SHORT_WAIT_MS) return e.retryMs + 250
      // This model's allowance is spent for now. Each model has its own, so the next one may still answer.
      restUntil.set(name, Date.now() + (e.daily || e.retryMs === null ? REST_MS : e.retryMs))
      return !model && models?.some(rested) ? 0 : null
    }
    if (e.status === 404) {
      // A model retired mid-session is dropped; with none left, the list is read again next time.
      if (model || !models) return null
      models = models.filter((m) => m !== name)
      if (models.length) return 0
      models = null
      return null
    }
    if (e.status === 500 || e.status === 503 || e.code === 'NETWORK') return BUSY_WAIT_MS
    if (e.code === 'TIMEOUT' || e.code === 'BAD_JSON' || e.code === 'EMPTY') return 0
    return null // a refused prompt, a bad key or a bad request fails the same way twice
  }

  return {
    get model() { return models?.find(rested) ?? models?.[0] ?? null },

    // Resolves to { json, model, usage, tries, ms }. deadlineMs is the longest the whole request may
    // take, however many tries that turns out to be.
    async generateJson({ system, prompt, schema, deadlineMs = DEFAULT_DEADLINE_MS }) {
      const started = Date.now()
      const left = () => started + deadlineMs - Date.now()
      // No single try may use the whole wait, so a hung one still leaves room for another.
      const perTry = Math.max(5000, deadlineMs * 0.6)

      for (let tries = 1; ; tries++) {
        const list = await candidates(Math.min(left(), LIST_TIMEOUT_MS))
        const name = list.find(rested) ?? list[0]
        try {
          const out = await generate(name, { system, prompt, schema }, Math.min(left(), perTry))
          return { ...out, tries, ms: Date.now() - started }
        } catch (e) {
          const wait = tries < MAX_TRIES ? retryIn(e, name) : null
          if (wait === null || left() < wait + MIN_TRY_MS) throw e
          if (wait) await pause(wait)
        }
      }
    },
  }
}
