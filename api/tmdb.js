import { tmdbMiddleware } from '../server/route.js'

// Vercel function for /api/tmdb. The keys are TMDB_KEY and OMDB_KEY in the project's environment settings.
export default tmdbMiddleware(process.env)
