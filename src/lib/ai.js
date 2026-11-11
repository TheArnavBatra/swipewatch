import { load, save } from './storage'

// The AI sits behind /api/ai on this app's own server, which holds the Gemini key. The browser
// only ever sees the cleaned-up answers.
export class AiError extends Error {
  constructor(kind, message) {
    super(message)
    this.kind = kind
  }
}

const PAUSE_KEY = 'rp.aiPause'
const HOUR_MS = 60 * 60 * 1000
// A little longer than the server allows itself for each task (server/ai.js), so what arrives is
// the server's own answer and not a cut-off connection.
const TIMEOUT_MS = { mood: 25_000, rank: 15_000, profile: 45_000 }

// After Gemini reports the free allowance is used up, background requests wait for as long as the
// server says: under a minute for a busy moment, an hour once the day's allowance is gone.
export const aiPaused = () => Date.now() < load(PAUSE_KEY, 0)
function pauseFor(seconds) {
  const ms = Number.isFinite(seconds) && seconds > 0 ? Math.min(Math.max(seconds, 15) * 1000, HOUR_MS) : HOUR_MS
  save(PAUSE_KEY, Date.now() + ms)
}

// What a usable answer to each task holds.
const SHAPE = {
  mood: (d) => Boolean(d?.intent) && typeof d.intent === 'object' && Array.isArray(d.intent.genres),
  rank: (d) => Array.isArray(d?.picks),
  profile: (d) => Boolean(d?.profile) && typeof d.profile === 'object',
}

// signal lets the caller give up on a request the person has cancelled.
async function post(task, { signal, ...payload }) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS[task])
  let res
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task, ...payload }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch (e) {
    if (signal?.aborted) throw new AiError('cancelled', 'Cancelled.')
    if (e?.name === 'TimeoutError') throw new AiError('timeout', 'The AI took too long to answer. Try again.')
    throw new AiError('network', 'Could not reach the AI. Check your connection and try again.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (data?.kind === 'quota') pauseFor(Number(data.retryAfter))
    throw new AiError(data?.kind ?? 'failed', data?.error ?? 'The AI could not answer. Try again.')
  }
  // A reply of the wrong shape is no answer at all, and must not reach the code that reads it.
  if (!SHAPE[task]?.(data)) throw new AiError('bad', 'The AI sent back an answer the app could not read. Try again.')
  return data
}

// 'off' when there is no AI route at all (a static build), 'nokey' until a Gemini key is set.
// The dev server can be mid-restart when the page loads, so one failed look is tried again.
export async function aiStatus() {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 1500))
    try {
      const res = await fetch('/api/ai/status', { signal: AbortSignal.timeout(5000) })
      const data = await res.json()
      if (typeof data?.ready === 'boolean') return data.ready ? 'ready' : 'nokey'
      return 'off'
    } catch {
      // Try once more.
    }
  }
  return 'off'
}

export const askMood = (payload) => post('mood', payload)
export const askRank = (payload) => post('rank', payload)
export const askProfile = (payload) => post('profile', payload)
