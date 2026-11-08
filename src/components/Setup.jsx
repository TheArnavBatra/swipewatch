import { INDUSTRIES, SERVICES } from '../lib/services'
import { hasTmdb } from '../lib/tmdb'

export default function Setup({ services, ind, onServices, onInd, onStart, loading, error }) {
  const toggle = (id) =>
    onServices(services.includes(id) ? services.filter((s) => s !== id) : [...services, id])

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

      {error && <p className="error" role="alert">{error}</p>}
      <button className="cta" type="button" disabled={services.length === 0 || loading} onClick={onStart}>
        {loading ? 'Finding titles…' : 'Start swiping'}
      </button>
      <p className="fine">
        {hasTmdb
          ? 'Titles and streaming availability from TMDB, for India.'
          : 'Showing 30 sample titles. Add a TMDB key to see real catalogs (see README).'}
      </p>
    </main>
  )
}
