import { useEffect, useRef } from 'react'
import Icon from './Icon'

const EXAMPLES = [
  'Tired, want something light',
  'Date night, nothing too heavy',
  "Can't sleep, something gripping",
  'Need a good cry',
  'Hyped, give me action',
  'Bored, surprise me',
]

function NeedsKey() {
  return (
    <div className="moodoff">
      <p>Mood picks use Google's Gemini, and this app has no key for it yet.</p>
      <ol>
        <li>Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>.</li>
        <li>Add a line <code>GEMINI_API_KEY=</code> followed by the key to <code>.env.local</code>.</li>
        <li>Restart <code>npm run dev</code>.</li>
      </ol>
    </div>
  )
}

export default function Mood({ ai, text, phase, step, error, inMood, stashed, onText, onSubmit, onCancel, onClose, onLeave }) {
  const field = useRef(null)
  const working = phase === 'working'

  // The box takes focus on open, Escape closes the sheet, and focus goes back to whatever opened it.
  useEffect(() => {
    const opener = document.activeElement
    field.current?.focus()
    return () => opener?.focus?.()
  }, [])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !working) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [working, onClose])

  const words = text.trim()
  const submit = () => { if (words.length >= 3 && !working) onSubmit(words) }

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-labelledby="mood-title">
      <button className="sheet-backdrop" type="button" tabIndex={-1} aria-label="Close" disabled={working} onClick={onClose} />
      <div className="sheet moodsheet">
        <div className="moodbody">
          <div className="moodhead">
            <h2 id="mood-title">How are you <em>feeling</em>?</h2>
            <button className="moodclose" type="button" aria-label="Close" disabled={working} onClick={onClose}><Icon name="x" size={18} /></button>
          </div>

          {ai === 'ready' ? (
            <>
              <p className="lede">Say it however you like. I'll line up a short list for right now, sorted to your taste.</p>
              <label className="sr" htmlFor="mood-text">Describe how you feel, or what you want to watch</label>
              <textarea
                id="mood-text" ref={field} className="moodfield" rows={3} maxLength={300} value={text} disabled={working}
                placeholder="Tired after a long day, want something light that won't make me think…"
                onChange={(e) => onText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}
              />
              <div className="moodchips">
                {EXAMPLES.map((x) => (
                  <button key={x} type="button" disabled={working} onClick={() => { onText(x); field.current?.focus() }}>{x}</button>
                ))}
              </div>
              <p className="fine">Your words and the titles being sorted go to Google's Gemini. On a free key, Google may use them to improve its products.</p>
            </>
          ) : ai === 'nokey' ? (
            <NeedsKey />
          ) : ai === 'off' ? (
            <p className="lede">Mood picks need the app's own server, and it is not answering. Start it with <code>npm run dev</code> and reload.</p>
          ) : (
            <p className="lede">Checking the AI connection…</p>
          )}
        </div>

        {ai === 'ready' && (
          <div className="moodfoot">
            {error && <p className="error" role="alert">{error}</p>}
            {working ? (
              <>
                <p className="moodstep" role="status">{step}</p>
                <button className="linkbtn moodback" type="button" onClick={onCancel}>Cancel</button>
              </>
            ) : (
              <button className="btn primary big" type="button" disabled={words.length < 3} onClick={submit}>Find my picks</button>
            )}
            {inMood && !working && (
              <button className="linkbtn moodback" type="button" disabled={working} onClick={onLeave}>
                {stashed ? 'Back to your usual deck' : 'Change filters'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
