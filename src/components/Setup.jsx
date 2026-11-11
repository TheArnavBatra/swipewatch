import { useState } from 'react'
import { LanguagePicker, ServicePicker } from './Choosers'
import Credits from './Credits'

const hour = new Date().getHours()
const WHEN = hour >= 17 || hour < 4 ? 'tonight' : 'today'

export default function Setup({
  services, ind, mode, gems, watchedCount, tasteCount, canResume,
  onServices, onInd, onMode, onGems, onResetTaste, onStart, onResume, loading, error,
}) {
  const [confirmReset, setConfirmReset] = useState(false)
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

        <ServicePicker id="home" services={services} onChange={onServices} />
        <LanguagePicker id="home" ind={ind} onChange={onInd} />

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
          <Credits />
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
