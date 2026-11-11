# Swipewatch

Pick your streaming services and Hindi or English, then swipe through movies until something sticks. Built with React, Vite and a PWA setup, so it installs to a phone's home screen.

## Run it

```bash
npm install
npm run dev
```

Without a TMDB key the app shows 30 sample titles. To see real catalogs:

1. Get a free key at https://www.themoviedb.org/settings/api (the "API Key (v3 auth)" value).
2. Copy `.env.example` to `.env.local` and paste the key into `TMDB_KEY`. No key name starts with `VITE_`: such a name would be sent to every visitor's browser, and the build refuses to run if it finds one for a key.
3. Restart `npm run dev`.

Streaming availability uses the `IN` region by default. Change `VITE_TMDB_REGION` to switch countries. The provider ids in `src/lib/services.js` are TMDB's India ids.

### IMDb ratings (optional)

TMDB does not provide IMDb ratings, so the details sheet shows its own TMDB rating plus a link to the IMDb page. To also show the IMDb rating, get a free key at https://www.omdbapi.com/apikey.aspx (it is emailed to you), put it in `.env.local` as `OMDB_KEY`, and restart `npm run dev`. The free plan allows 1,000 requests a day. Each title is fetched once per visit, and only when its details sheet is opened.


### AI picks (optional)

Two features use Google's Gemini. Both are off until a key is set, and the app works fully without them.

- **Mood list.** Tap the chat icon above the deck (or "Not sure what you want?" on the filters screen) and describe how you feel. Gemini turns that into search filters, TMDB finds real titles on your services, your taste model sorts them, and Gemini lines up the best fits with a one-line reason each. Only titles that fit everything you asked for are in the list. If that list is short, the closest others wait behind a "Show closest matches" button at the end, and each one says how it differs (for example "Before 2020"), with the ones that miss least first. You can name genres, years, a rating, a length, actors or directors, a language ("a Korean thriller") and themes ("heist", "based on a true story"). A request can be cancelled while it is being read. It is a temporary deck: your usual deck comes back afterwards, and a mood swipe teaches the taste model only half as much.
- **Taste reading.** After about 10 swipes, and every 20 or so after that, Gemini reads the titles you kept, skipped and hid. It writes a short summary of your taste (shown on the filters screen) and suggests a few searches that feed the deck, each with a reason on the card. The "Learn from my swipes" switch turns it off.

To turn it on:

1. Get a free key at https://aistudio.google.com/apikey.
2. Put it in `.env.local` as `GEMINI_API_KEY=...` (no `VITE_` prefix) and restart `npm run dev`.

The key stays on the server side. The browser calls `/api/ai`, which is a small route inside the Vite dev and preview servers (`server/`), so the key is never in the bundle. Once deployed, the same code runs as a function (see below). The model is picked from your key's own model list (the newest stable Flash-Lite); set `GEMINI_MODEL` to choose another.

Free-tier limits are small and Google changes them without notice, so the app sends few requests: one or two per mood list, one per taste reading. If Gemini reports the allowance is used up, background readings pause for an hour. On the free tier Google may use what you send to improve its products. Only your words and a list of titles and genres are sent.

## Deploy (Vercel)

Film data and the AI go through two small functions in `api/`, so none of the three keys ever reaches a visitor's browser. The built site holds no key, and the only thing the browser is told is whether each one is set.

1. Push the repo to GitHub. `.env.local` is git-ignored and was never committed.
2. On vercel.com, choose Add New, Project, and import the repo. The build settings are already in `vercel.json`.
3. Under Settings, Environment Variables, add `TMDB_KEY`, `OMDB_KEY` (optional) and `GEMINI_API_KEY`. Leave any "expose to browser" option off, and don't prefix the names with `VITE_`. Optionally add `VITE_TMDB_REGION` (not a secret).
4. Deploy. Add the site to your phone's home screen:
   - **Android (Chrome):** menu, then Install app.
   - **iPhone (Safari):** Share, then Add to Home Screen.

What protects it:

- **Keys:** read only on the server. `/api/tmdb` allows only the few TMDB and OMDb calls the app makes, with only the parameters it uses, and never repeats an upstream error. `/api/ai` checks everything Gemini sends back.
- **Other sites:** a request from a page on another site is refused, and a write must say where it came from. Set `ALLOWED_ORIGINS` (comma separated host names) only if you serve the app from more than one address.
- **Limits:** each visitor is limited per minute (film data) and per 10 minutes (AI), and the AI as a whole to 60 requests an hour, so one visitor cannot use up your free Gemini allowance. Each server instance counts for itself, so for a hard limit also turn on a rate-limit rule in Vercel's Firewall for `/api/ai`.
- **Headers:** `vercel.json` sets a strict Content-Security-Policy (only this site, TMDB's image server and Google Fonts), HSTS, no framing, and no camera, microphone or location.
- **Rotating a key:** change it in Vercel's settings and redeploy. Nothing else needs to change.

Run `npm test` before deploying; it covers the routes and their checks.

## Layout

- `src/lib/tmdb.js`: fetches and merges titles per service and language.
- `src/lib/sampleCatalog.js`: offline fallback data.
- `src/lib/taste.js`: the small model that learns from your swipes and orders the deck.
- `src/lib/ai.js`, `mood.js`, `profile.js`: the browser side of the AI picks.
- `src/lib/moodPool.js`: finds the titles for a mood (exact matches first, then the closest ones, kept apart).
- `server/`: the API routes. `ai.js`, `gemini.js`, `prompts.js`, `clean.js` for Gemini, `tmdb.js` for the TMDB and OMDb proxy, `guard.js` and `route.js` for the checks every request passes. `api/` holds the Vercel functions that use them.
- `src/components/`: `Setup`, `Deck`, `SwipeCard`, `Library`, `Details`, and the `Icon` set.
- `src/styles/`: `tokens.css` holds the colors and fonts for light and dark; the other files style one screen each.
- `tests/`: checks for the AI route and the mood list, with a stand-in for Gemini and TMDB (`npm test`, no keys needed).
- `scripts/make-icons.mjs`: regenerates the PWA icons in `public/`.

## Credits

This product uses the TMDB API but is not endorsed or certified by TMDB. Titles, posters and ratings come from [TMDB](https://www.themoviedb.org). Streaming availability data is provided by [JustWatch](https://www.justwatch.com).
