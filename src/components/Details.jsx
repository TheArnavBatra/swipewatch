import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { fetchDetails, hasTmdb } from '../lib/tmdb'
import { serviceOf } from '../lib/services'
import { hueOf } from '../lib/storage'

const runtimeText = (m) => (!m ? null : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`)

function Fact({ value, label, star }) {
  return (
    <div className="fact">
      <b>{star && <Icon name="star" size={16} />}{value}</b>
      <span>{label}</span>
    </div>
  )
}

// onDecide is set only when the sheet was opened from the card on top of the deck.
export default function Details({ item, onClose, onDecide, allowWatched }) {
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
    const opener = document.activeElement
    closeRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      // Hand focus back to whatever opened the sheet, if it is still on the page.
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  const { status, data } = state
  const meta = [item.year, runtimeText(data?.runtime), data?.languages?.[0]].filter(Boolean).join(' · ')
  const genres = data?.genres?.length ? data.genres : [item.genre]
  const backdrop = data?.backdrop ?? item.backdrop
  const tmdbRating = data?.tmdbRating ?? item.rating

  return (
    <div className="sheet-wrap">
      <button className="sheet-backdrop" type="button" aria-label="Close details" tabIndex={-1} onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label={`Details for ${item.title}`} style={{ '--h': hueOf(item.title) }}>
        <button ref={closeRef} className="sheet-close" type="button" aria-label="Close details" onClick={onClose}>
          <Icon name="x" />
        </button>

        <div className="sheet-scroll">
          {/* A wide still when TMDB has one. Otherwise the poster, blurred into a backdrop. */}
          <div className={`sheet-hero${backdrop ? '' : ' soft'}`}>
            {(backdrop || item.poster) && <img src={backdrop || item.poster} alt="" />}
          </div>
          <div className="sheet-headline">
            {item.poster ? <img className="sheet-poster" src={item.poster} alt="" /> : <span className="sheet-poster" />}
            <div className="sheet-title">
              <h2>{item.title}</h2>
              {meta && <p>{meta}</p>}
            </div>
          </div>

          <div className="sheet-body">
            {(data?.imdb || tmdbRating) && (
              <div className="facts">
                {data?.imdb && <Fact star value={data.imdb.rating} label={`IMDb${data.imdb.votes ? ` · ${data.imdb.votes} votes` : ''}`} />}
                {tmdbRating && <Fact star value={tmdbRating} label={`TMDB${data?.tmdbVotes ? ` · ${data.tmdbVotes.toLocaleString()} votes` : ''}`} />}
              </div>
            )}

            <div className="where">
              {item.svcs.map((id) => {
                const svc = serviceOf(id)
                return <span className="badge" key={id} style={{ '--dot': svc.dot }}><i />{svc.name}</span>
              })}
              {genres.map((g) => <span className="pill" key={g}>{g}</span>)}
            </div>

            {data?.tagline && <p className="tagline">{data.tagline}</p>}
            <p className="overview">{data?.overview || item.blurb}</p>

            {status === 'loading' && (
              <div className="block" role="status">
                <span className="sr">Loading cast and details…</span>
                <div className="cast ghost" aria-hidden="true"><i /><i /><i /><i /></div>
              </div>
            )}
            {status === 'error' && <p className="error" role="alert">Could not load cast and details. Check your connection and try again.</p>}
            {status === 'basic' && !hasTmdb && <p className="fine">Cast, director and trailer need a TMDB key. See the README.</p>}

            {data?.director?.length > 0 && (
              <div className="block"><h3>Directed by</h3><p>{data.director.join(', ')}</p></div>
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
                      <b>{c.name}</b>
                      {c.role && <span>{c.role}</span>}
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
                {data.trailerUrl && (
                  <a className="btn primary" href={data.trailerUrl} target="_blank" rel="noopener noreferrer"><Icon name="play" size={18} />Watch trailer</a>
                )}
                {data.imdbUrl && (
                  <a className="btn" href={data.imdbUrl} target="_blank" rel="noopener noreferrer">Open on IMDb<Icon name="external" size={16} /></a>
                )}
              </div>
            )}
          </div>
        </div>

        {onDecide && (
          <footer className="sheet-foot">
            <button className="btn" type="button" onClick={() => onDecide('no')}><Icon name="x" size={18} />Skip</button>
            {allowWatched && <button className="btn" type="button" onClick={() => onDecide('watched')}><Icon name="eye" size={18} />Seen it</button>}
            <button className="btn primary" type="button" onClick={() => onDecide('yes')}><Icon name="heart" size={18} />Keep</button>
          </footer>
        )}
      </section>
    </div>
  )
}
