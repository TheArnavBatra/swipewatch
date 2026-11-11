// The shapes Gemini is asked to answer in. Holding the reply to a schema keeps it well-formed JSON;
// the cleaners in clean.js still check every value. A key that does not apply is simply left out.
const text = { type: 'string' }
const whole = { type: 'integer' }
const flag = { type: 'boolean' }
const list = (items) => ({ type: 'array', items })

export const MOOD = {
  type: 'object',
  properties: {
    headline: text,
    genres: list(whole),
    allGenres: flag,
    avoidGenres: list(whole),
    themes: list(text),
    yearFrom: whole,
    yearTo: whole,
    minRating: { type: 'number' },
    maxRuntime: whole,
    minRuntime: whole,
    languages: list(text),
    actors: list(text),
    anyActor: flag,
    directors: list(text),
  },
  required: ['headline', 'genres'],
}

export const RANK = {
  type: 'object',
  properties: { picks: list({ type: 'object', properties: { id: text, why: text }, required: ['id', 'why'] }) },
  required: ['picks'],
}

export const PROFILE = {
  type: 'object',
  properties: {
    summary: text,
    likes: list(text),
    dislikes: list(text),
    lanes: list({
      type: 'object',
      properties: {
        reason: text,
        genres: list(whole),
        language: text,
        yearFrom: whole,
        yearTo: whole,
        minRating: { type: 'number' },
        actors: list(text),
        directors: list(text),
      },
      required: ['reason', 'genres'],
    }),
  },
  required: ['summary', 'likes', 'dislikes', 'lanes'],
}
