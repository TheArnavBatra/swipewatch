import Icon from './Icon'
import Credits from './Credits'
import { LanguagePicker, ServicePicker } from './Choosers'

export default function Assistant({ ai, aiOn, onAiOn, profile, tasteCount, onMood, services, ind, onServices, onInd, gems, onGems }) {
  return (
    <main className="setup assistant">
      <div className="setup-body">
        <div className="hero">
          <h1>Not sure? <em>Ask</em>.</h1>
          <p className="lede">Describe how you feel and get a short list for right now, sorted to your taste.</p>
        </div>

        <ServicePicker id="ask" services={services} onChange={onServices} />
        <LanguagePicker id="ask" ind={ind} onChange={onInd} />

        <label className="switchrow">
          <span><b>Include hidden gems</b><small>Lesser-known titles can show up in your list</small></span>
          <span className="switch">
            <input type="checkbox" role="switch" checked={gems} onChange={(e) => onGems(e.target.checked)} /><i />
          </span>
        </label>

        {(ai === 'ready' || ai === 'nokey') && (
          <button className="moodcard" type="button" onClick={onMood}>
            <span className="moodcard-icon"><Icon name="chat" size={20} /></span>
            <span className="moodcard-text">
              <b>Tell me how you feel</b>
              <small>{ai === 'ready' ? "I'll line up a list for right now." : 'Needs a free Gemini key. Tap to see how.'}</small>
            </span>
            <Icon name="arrow" size={18} />
          </button>
        )}
        {ai === 'off' && (
          <p className="lede">The AI needs the app's own server, and it is not answering. Start it with <code>npm run dev</code> and reload.</p>
        )}
        {ai === 'checking' && <p className="lede">Checking the AI connection…</p>}

        {ai === 'ready' && (
          <label className="switchrow">
            <span><b>Learn from my swipes</b><small>Gemini reads the titles you keep and skip to spot patterns</small></span>
            <span className="switch">
              <input type="checkbox" role="switch" checked={aiOn} onChange={(e) => onAiOn(e.target.checked)} /><i />
            </span>
          </label>
        )}

        {aiOn && profile?.summary ? (
          <p className="insight"><b>What the AI noticed</b>{profile.summary}</p>
        ) : ai === 'ready' && (
          <p className="fine">{tasteCount < 10 ? 'Swipe on about 10 titles and the AI will start describing your taste here.' : 'Your taste reading will appear here after a few more swipes.'}</p>
        )}
        <div className="credits"><Credits /></div>
      </div>
    </main>
  )
}
