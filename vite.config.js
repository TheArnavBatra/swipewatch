import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { aiMiddleware } from './server/route.js'

// The AI route lives inside the dev and preview servers, so the Gemini key stays on this machine.
// It is read from .env.local without a VITE_ prefix, which keeps it out of the browser bundle.
function aiRoute() {
  let env = {}
  // The braces matter: a value returned from configureServer is run by Vite as a post hook.
  const mount = (server) => { server.middlewares.use('/api/ai', aiMiddleware(env)) }
  return {
    name: 'swipewatch-ai',
    configResolved(config) { env = loadEnv(config.mode, config.envDir, '') },
    configureServer: mount,
    configurePreviewServer: mount,
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    aiRoute(),
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
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/image\.tmdb\.org\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'tmdb-posters', expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts' },
          },
        ],
      },
    }),
  ],
})
