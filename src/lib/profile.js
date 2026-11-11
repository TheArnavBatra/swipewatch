import { GENRES } from './genres'
import { leanings } from './taste'

const VERDICT = { liked: 'liked it', meh: 'not for them' }

const slim = (t, verdict) => ({
  title: t.title,
  year: t.year,
  genres: (t.genreIds ?? []).map((g) => GENRES[g]).filter(Boolean).slice(0, 3),
  ...(verdict && { verdict }),
})

// A short, recent slice of their choices for the AI to read. Only titles and genres leave the device.
export const profileInput = ({ liked, skipped, blocked, watched, model }) => ({
  kept: liked.slice(-30).map((t) => slim(t)),
  skipped: skipped.slice(0, 25).map((t) => slim(t)),
  hidden: blocked.slice(-20).map((t) => slim(t)),
  seen: watched.slice(-25).map((t) => slim(t, VERDICT[t.like])),
  leans: leanings(model),
})

// What a mood request needs to know about their taste, and nothing else.
export const brief = (profile) =>
  profile?.summary ? { summary: profile.summary, likes: profile.likes, dislikes: profile.dislikes } : null
