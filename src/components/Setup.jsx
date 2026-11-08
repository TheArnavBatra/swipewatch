import { INDUSTRIES, SERVICES } from '../lib/services'
import { hasTmdb } from '../lib/tmdb'

export default function Setup({
  services, ind, mode, gems, watchedCount,
  onServices, onInd, onMode, onGems, onStart, loading, error,
}) {
  const toggle = (id) =>
    onServices(services.includes(id) ? services.filter((s) => s !== id) : [...services, id])
  const rewatch = mode === 'rewatch'
  const nothingToRewatch = rewatch && watchedCount === 0

  return (
    <main className="setup">
      <div>
        <h1>Decide what to watch tonight.</h1>
        <p className="lede">Choose where you stream and what you're in the mood for. Then swipe until something sticks.</p>
      </div>

      <section className="group">
        <h2>Your streaming services</h2>
        <div className="chips">
          {SERVICES.map((s) => (
            <label className="chip" key={s.id} style={{ '--dot': s.dot }}>
              <input type="checkbox" checked={services.includes(s.id)} onChange={() => toggle(s.id)} />
              <span>{s.name}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="group">
        <h2>Language and industry</h2>
        <div className="seg">
          {INDUSTRIES.map((i) => (
            <label className="chip" key={i.id}>
              <input type="radio" name="ind" checked={ind === i.id} onChange={() => onInd(i.id)} />
              <span>{i.name}<small>{i.sub}</small></span>
            </label>
          ))}
        </div>
      </section>

      <section className="group">
        <h2>What are you after?</h2>
        <div className="seg two">
          <label className="chip">
            <input type="radio" name="mode" checked={!rewatch} onChange={() => onMode('new')} />
            <span>Something new<small>Titles you haven't marked</small></span>
          </label>
          <label className="chip">
            <input type="radio" name="mode" checked={rewatch} onChange={() => onMode('rewatch')} />
            <span>Rewatch<small>{watchedCount} on your Watched list</small></span>
          </label>
        </div>
      </section>

      {!rewatch && (
        <section className="group">
          <h2>How well-known?</h2>
          <div className="seg two">
            <label className="chip">
              <input type="radio" name="gems" checked={!gems} onChange={() => onGems(false)} />
              <span>Well-known only<small>100+ ratings</small></span>
            </label>
            <label className="chip">
              <input type="radio" name="gems" checked={gems} onChange={() => onGems(true)} />
              <span>Include hidden gems<small>10+ ratings, bigger deck</small></span>
            </label>
          </div>
        </section>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {nothingToRewatch && (
        <p className="fine">Nothing to rewatch yet. Tap "Already watched" on cards while swiping and they'll show up here.</p>
      )}
      <button className="cta" type="button" disabled={services.length === 0 || loading || nothingToRewatch} onClick={onStart}>
        {loading ? 'Finding titles…' : rewatch ? 'Start rewatching' : 'Start swiping'}
      </button>
      <p className="fine">
        {hasTmdb
          ? 'Titles and streaming availability from TMDB, for India.'
          : 'Showing 30 sample titles. Add a TMDB key to see real catalogs (see README).'}
      </p>
    </main>
  )
}
