import { useState } from 'react'
import Icon from './Icon'
import { INDUSTRIES, SERVICES } from '../lib/services'
import { hasTmdb } from '../lib/tmdb'

const hour = new Date().getHours()
const WHEN = hour >= 17 || hour < 4 ? 'tonight' : 'today'

export default function Setup({
  services, ind, mode, gems, watchedCount, tasteCount, canResume,
  onServices, onInd, onMode, onGems, onResetTaste, onStart, onResume, loading, error,
}) {
  const [confirmReset, setConfirmReset] = useState(false)
  const toggle = (id) =>
    onServices(services.includes(id) ? services.filter((s) => s !== id) : [...services, id])
  const rewatch = mode === 'rewatch'
  const nothingToRewatch = rewatch && watchedCount === 0
  const resetTaste = () => {
    if (confirmReset) onResetTaste()
    setConfirmReset(!confirmReset)
  }

  return (
    <main className="setup">
      <div className="setup-body">
        <div className="hero">
          <h1>What are we <em>watching</em> {WHEN}?</h1>
          <p className="lede">Pick where you stream and what you're in the mood for, then swipe until something sticks.</p>
        </div>

        <section className="field">
          <h2 id="f-services">Where do you watch?</h2>
          <div className="svcs" role="group" aria-labelledby="f-services">
            {SERVICES.map((s) => (
              <label className="svc" key={s.id} style={{ '--dot': s.dot }}>
                <input type="checkbox" checked={services.includes(s.id)} onChange={() => toggle(s.id)} />
                <span><i /><Icon name="check" size={16} strokeWidth="2.6" />{s.name}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="field">
          <h2 id="f-language">Language</h2>
          <div className="seg" role="radiogroup" aria-labelledby="f-language">
            {INDUSTRIES.map((i) => (
              <label key={i.id}>
                <input type="radio" name="ind" checked={ind === i.id} onChange={() => onInd(i.id)} />
                <span>{i.name}<small>{i.sub}</small></span>
              </label>
            ))}
          </div>
        </section>

        <section className="field">
          <h2 id="f-mode">In the mood for</h2>
          <div className="seg" role="radiogroup" aria-labelledby="f-mode">
            <label>
              <input type="radio" name="mode" checked={!rewatch} onChange={() => onMode('new')} />
              <span>Something new<small>Not seen yet</small></span>
            </label>
            <label>
              <input type="radio" name="mode" checked={rewatch} onChange={() => onMode('rewatch')} />
              <span>A rewatch<small>{watchedCount ? `${watchedCount} seen so far` : 'Nothing seen yet'}</small></span>
            </label>
          </div>
        </section>

        {!rewatch && (
          <label className="switchrow">
            <span><b>Include hidden gems</b><small>Lesser-known titles, and a much bigger deck</small></span>
            <span className="switch">
              <input type="checkbox" role="switch" checked={gems} onChange={(e) => onGems(e.target.checked)} /><i />
            </span>
          </label>
        )}

        <div className="credits">
          {tasteCount > 0 && (
            <p className="fine">
              Tuned to your taste from {tasteCount} {tasteCount === 1 ? 'swipe' : 'swipes'}.{' '}
              <button className="linkbtn" type="button" onClick={resetTaste}>
                {confirmReset ? 'Tap again to reset' : 'Start over'}
              </button>
            </p>
          )}
          <p className="fine">
            {hasTmdb
              ? 'Titles, posters and streaming availability for India come from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.'
              : 'Showing 30 sample titles. Add a TMDB key to see real catalogs (see the README).'}
          </p>
        </div>
      </div>

      <div className="setup-foot">
        {error && <p className="error" role="alert">{error}</p>}
        {nothingToRewatch && <p className="fine">Nothing to rewatch yet. Mark titles as seen while swiping and they'll show up here.</p>}
        {services.length === 0 && <p className="fine">Choose at least one service to start.</p>}
        <button
          className="btn primary big" type="button"
          disabled={services.length === 0 || loading || nothingToRewatch} onClick={onStart}
        >
          {loading ? 'Finding titles…' : rewatch ? 'Start rewatching' : 'Start swiping'}
        </button>
        {canResume && !loading && (
          <button className="linkbtn resume" type="button" onClick={onResume}>Back to the deck you had</button>
        )}
      </div>
    </main>
  )
}
