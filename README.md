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

### IMDb ratings (optional)

TMDB does not provide IMDb ratings, so the details sheet shows its own TMDB rating plus a link to the IMDb page. To also show the IMDb rating, get a free key at https://www.omdbapi.com/apikey.aspx (it is emailed to you), put it in `.env.local` as `VITE_OMDB_KEY`, and restart `npm run dev`. The free plan allows 1,000 requests a day. Each title is fetched once per visit, and only when its details sheet is opened.

The key is bundled into the client, which is fine for a personal project. Don't reuse a key you care about.

### AI picks (optional)

Two features use Google's Gemini. Both are off until a key is set, and the app works fully without them.

- **Mood list.** Tap the chat icon above the deck (or "Not sure what you want?" on the filters screen) and describe how you feel. Gemini turns that into search filters, TMDB finds real titles on your services, your taste model sorts them, and Gemini lines up the best fits with a one-line reason each. Only titles that fit everything you asked for are in the list. If that list is short, the closest others wait behind a "Show closest matches" button at the end, and each one says how it differs (for example "Before 2020"), with the ones that miss least first. You can name genres, years, a rating, a length, actors or directors, a language ("a Korean thriller") and themes ("heist", "based on a true story"). A request can be cancelled while it is being read. It is a temporary deck: your usual deck comes back afterwards, and a mood swipe teaches the taste model only half as much.
- **Taste reading.** After about 10 swipes, and every 20 or so after that, Gemini reads the titles you kept, skipped and hid. It writes a short summary of your taste (shown on the filters screen) and suggests a few searches that feed the deck, each with a reason on the card. The "Learn from my swipes" switch turns it off.

To turn it on:

1. Get a free key at https://aistudio.google.com/apikey.
2. Put it in `.env.local` as `GEMINI_API_KEY=...` (no `VITE_` prefix) and restart `npm run dev`.

The key stays on the server side. The browser calls `/api/ai`, which is a small route inside the Vite dev and preview servers (`server/`), so the key is never in the bundle. A static host has no such route, so before deploying this needs the same code as a serverless function. The model is picked from your key's own model list (the newest stable Flash-Lite); set `GEMINI_MODEL` to choose another.

Free-tier limits are small and Google changes them without notice, so the app sends few requests: one or two per mood list, one per taste reading. If Gemini reports the allowance is used up, background readings pause for an hour. On the free tier Google may use what you send to improve its products. Only your words and a list of titles and genres are sent.

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
- `src/lib/taste.js`: the small model that learns from your swipes and orders the deck.
- `src/lib/ai.js`, `mood.js`, `profile.js`: the browser side of the AI picks.
- `src/lib/moodPool.js`: finds the titles for a mood (exact matches first, then the closest ones, kept apart).
- `server/`: the `/api/ai` route (Gemini calls, prompts, and checks on everything Gemini sends back).
- `src/components/`: `Setup`, `Deck`, `SwipeCard`, `Library`, `Details`, and the `Icon` set.
- `src/styles/`: `tokens.css` holds the colors and fonts for light and dark; the other files style one screen each.
- `tests/`: checks for the AI route and the mood list, with a stand-in for Gemini and TMDB (`npm test`, no keys needed).
- `scripts/make-icons.mjs`: regenerates the PWA icons in `public/`.
