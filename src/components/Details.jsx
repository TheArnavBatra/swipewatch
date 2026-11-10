import { useEffect, useRef, useState } from 'react'
import { fetchDetails, hasTmdb } from '../lib/tmdb'
import { serviceName } from '../lib/services'
import { hueOf } from '../lib/storage'

const runtimeText = (m) => (m ? `${Math.floor(m / 60)}h ${m % 60}m` : null)

export default function Details({ item, onClose }) {
  const [state, setState] = useState({ status: 'loading', data: null })
  const closeRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    let active = true
    fetchDetails(item)
      .then((data) => active && setState({ status: data ? 'ready' : 'basic', data }))
      .catch(() => active && setState({ status: 'error', data: null }))
    return () => { active = false }
  }, [item])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const { status, data } = state
  const meta = [item.year, runtimeText(data?.runtime), data?.languages?.[0]].filter(Boolean).join(' · ')
  const genres = data?.genres?.length ? data.genres : [item.genre]

  return (
    <div className="sheet-wrap">
      <button className="sheet-backdrop" type="button" aria-label="Close details" tabIndex={-1} onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label={`Details for ${item.title}`}>
        <header className="sheet-head">
          {item.poster
            ? <img className="sheet-poster" src={item.poster} alt="" />
            : <div className="sheet-poster" style={{ '--h': hueOf(item.title), background: 'linear-gradient(155deg, hsl(var(--h) 62% 42%), hsl(calc(var(--h) + 40) 70% 18%))' }} />}
          <div className="sheet-title">
            <h2>{item.title}</h2>
            {meta && <p>{meta}</p>}
            <p>On {item.svcs.map(serviceName).join(' and ')}</p>
          </div>
          <button ref={closeRef} className="sheet-close" type="button" aria-label="Close details" onClick={onClose}>✕</button>
        </header>

        <div className="ratings">
          {(data?.imdb || null) && (
            <div className="rating imdb"><b>★ {data.imdb.rating}</b><span>IMDb{data.imdb.votes ? ` · ${data.imdb.votes} votes` : ''}</span></div>
          )}
          {(data?.tmdbRating ?? item.rating) && (
            <div className="rating"><b>★ {data?.tmdbRating ?? item.rating}</b><span>TMDB{data?.tmdbVotes ? ` · ${data.tmdbVotes.toLocaleString()} votes` : ''}</span></div>
          )}
        </div>

        <div className="chips">
          {genres.map((g) => <span className="pill" key={g}>{g}</span>)}
        </div>

        {data?.tagline && <p className="tagline">{data.tagline}</p>}
        <p className="overview">{data?.overview || item.blurb}</p>

        {status === 'loading' && <p className="fine" role="status">Loading cast and details…</p>}
        {status === 'error' && <p className="error" role="alert">Could not load cast and details. Check your connection and try again.</p>}
        {status === 'basic' && !hasTmdb && <p className="fine">Cast, director and trailer need a TMDB key. See the README.</p>}

        {data?.director?.length > 0 && (
          <div className="block"><h3>Director</h3><p>{data.director.join(', ')}</p></div>
        )}

        {data?.cast?.length > 0 && (
          <div className="block">
            <h3>Cast</h3>
            <ul className="cast">
              {data.cast.map((c) => (
                <li key={c.name + (c.role ?? '')}>
                  {c.photo
                    ? <img src={c.photo} alt="" loading="lazy" />
                    : <span className="noface" aria-hidden="true">{c.name[0]}</span>}
                  <div><b>{c.name}</b>{c.role && <span>{c.role}</span>}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data?.countries?.length > 0 && (
          <div className="block"><h3>Made in</h3><p>{data.countries.join(', ')}</p></div>
        )}

        {(data?.trailerUrl || data?.imdbUrl) && (
          <div className="links">
            {data.trailerUrl && <a href={data.trailerUrl} target="_blank" rel="noopener noreferrer">Watch trailer</a>}
            {data.imdbUrl && <a href={data.imdbUrl} target="_blank" rel="noopener noreferrer">Open on IMDb</a>}
          </div>
        )}
      </section>
    </div>
  )
}
