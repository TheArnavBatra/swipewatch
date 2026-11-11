import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { aiMiddleware, tmdbMiddleware } from './server/route.js'

// The API routes live inside the dev and preview servers (and, once deployed, in the functions under
// api/). Every key is read without a VITE_ prefix, which keeps it out of the browser bundle.
function apiRoutes() {
  let env = {}
  // The braces matter: a value returned from configureServer is run by Vite as a post hook.
  const mount = (server) => {
    server.middlewares.use('/api/ai', aiMiddleware(env))
    server.middlewares.use('/api/tmdb', tmdbMiddleware(env))
  }
  return {
    name: 'swipewatch-api',
    // The browser is only told whether film data and IMDb ratings are set up, never the keys.
    config(config, { mode }) {
      const all = loadEnv(mode, config.envDir ?? process.cwd(), '')
      // A VITE_ name would put the key in the bundle, so it is refused outright.
      for (const old of ['VITE_TMDB_KEY', 'VITE_OMDB_KEY', 'VITE_GEMINI_API_KEY']) {
        if (all[old]) throw new Error(`${old} would be sent to every visitor. Rename it to ${old.replace('VITE_', '')} in .env.local or the host's settings.`)
      }
      return {
        define: {
          'import.meta.env.VITE_HAS_TMDB': JSON.stringify(all.TMDB_KEY ? '1' : ''),
          'import.meta.env.VITE_HAS_OMDB': JSON.stringify(all.OMDB_KEY ? '1' : ''),
        },
      }
    },
    configResolved(config) { env = loadEnv(config.mode, config.envDir, '') },
    configureServer: mount,
    configurePreviewServer: mount,
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    apiRoutes(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Swipewatch',
        short_name: 'Swipewatch',
        description: 'Pick your streaming services, then swipe to decide what to watch.',
        theme_color: '#131110',
        background_color: '#131110',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The API routes are never answered from the offline cache.
        navigateFallbackDenylist: [/^\/api\//],
        // No runtime caching of TMDB's images or Google Fonts. Fetching them from inside the service
        // worker is what the site's Content-Security-Policy (connect-src 'self') forbids, and the
        // browser's own cache already keeps them. Only the app itself is precached.
        runtimeCaching: [],
      },
    }),
  ],
})
