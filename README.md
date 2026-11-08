# Swipewatch

Pick your streaming services and Hindi or English, then swipe through movies until something sticks. Built with React, Vite and a PWA setup, so it installs to a phone's home screen.

## Run it

```bash
npm install
npm run dev
```

Without a TMDB key the app shows 30 sample titles. To see real catalogs:

1. Get a free key at https://www.themoviedb.org/settings/api (the "API Key (v3 auth)" value).
2. Copy `.env.example` to `.env.local` and paste the key into `VITE_TMDB_KEY`.
3. Restart `npm run dev`.

Streaming availability uses the `IN` region by default. Change `VITE_TMDB_REGION` to switch countries. The provider ids in `src/lib/services.js` are TMDB's India ids.

The key is bundled into the client, which is fine for a personal project. Don't reuse a key you care about.

## Install on your phone

The service worker only runs over HTTPS (or localhost), so deploy first:

```bash
npm run build
```

Upload `dist/` to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages) and set `VITE_TMDB_KEY` in that host's environment settings. Then open the site on your phone:

- **Android (Chrome):** menu, then Install app.
- **iPhone (Safari):** Share, then Add to Home Screen.

## Layout

- `src/lib/tmdb.js`: fetches and merges titles per service and language.
- `src/lib/sampleCatalog.js`: offline fallback data.
- `src/components/`: `Setup`, `Deck`, `SwipeCard`, `Shortlist`.
- `scripts/make-icons.mjs`: regenerates the PWA icons in `public/`.
