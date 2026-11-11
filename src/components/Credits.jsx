import { hasTmdb } from '../lib/tmdb'

const link = (href, text) => <a href={href} target="_blank" rel="noreferrer">{text}</a>

// Where the film data comes from. TMDB asks for this exact notice, and its streaming availability
// data is supplied by JustWatch, which asks to be named.
export default function Credits() {
  if (!hasTmdb) return <p className="fine">Showing 30 sample titles. Add a TMDB key to see real catalogs (see the README).</p>
  return (
    <p className="fine">
      This product uses the {link('https://www.themoviedb.org', 'TMDB')} API but is not endorsed or certified by TMDB.
      Titles, posters and ratings come from TMDB. Streaming availability data is provided by {link('https://www.justwatch.com', 'JustWatch')}.
    </p>
  )
}
