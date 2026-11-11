import { aiMiddleware } from '../../server/route.js'

// Vercel function for POST /api/ai. The key is GEMINI_API_KEY in the project's environment settings.
export default aiMiddleware(process.env)
