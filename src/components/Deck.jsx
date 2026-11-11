import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import Icon from './Icon'
import SwipeCard from './SwipeCard'
import { reasonFor } from '../lib/taste'

const EXIT_MS = 260
// The swipe hint is for a first visit. It steps aside once the gestures have clearly landed.
const HINT_UNTIL = 3

function Action({ icon, label, hint, title, size, tone = '', ...rest }) {
  return (
    <button className={`act ${tone}`} type="button" title={title} aria-label={title} {...rest}>
      <span className="disc"><Icon name={icon} size={size} /></span>
      <span>{label}{hint && <span className="key" aria-hidden="true">{hint}</span>}</span>
    </button>
  )
}

export default function Deck({
  ref, queue, taste, mode, label, more, loadingMore, paused, likedCount, canUndo,
  onSwipe, onUndo, onPick, onEdit, onInfo, onMood, onLeaveMood, stashed, nearCount, onNear,
}) {
  const [exit, setExit] = useState(null)
  const [done, setDone] = useState(0)
  const timer = useRef(null)
  const top = queue[0]
  const rewatch = mode === 'rewatch'

  useEffect(() => () => clearTimeout(timer.current), [])

  const decide = useCallback((dir) => {
    if (exit || !top || (dir === 'watched' && rewatch)) return
    setExit(dir)
    timer.current = setTimeout(() => {
      onSwipe(top, dir)
      setExit(null)
      setDone((n) => n + 1)
    }, EXIT_MS)
  }, [exit, top, rewatch, onSwipe])

  // Lets the details sheet decide on the card it was opened from.
  useImperativeHandle(ref, () => ({ decide }), [decide])

  useEffect(() => {
    if (paused) return undefined
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'i' && top) onInfo(top)
      else if (e.key === 'u' && canUndo) onUndo()
      else if (e.key === 'ArrowRight') decide('yes')
      else if (e.key === 'ArrowLeft') decide('no')
      else if (e.key === 'ArrowUp') { e.preventDefault(); decide('watched') }
      else if (e.key === 'ArrowDown') { e.preventDefault(); decide('never') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [decide, paused, top, canUndo, onInfo, onUndo])

  const waiting = loadingMore || more
  let empty
  if (waiting) {
    empty = (<><h2>Finding more…</h2><p>Loading the next batch of titles.</p></>)
  } else if (mode === 'mood') {
    empty = (
      <>
        <h2>{nearCount ? "That's every match." : "That's the list."}</h2>
        <p>
          {nearCount
            ? 'That is everything that fits what you asked for. The closest others say how they differ.'
            : likedCount ? `You've kept ${likedCount} so far.` : 'Nothing caught your eye? Try describing it another way.'}
        </p>
        {nearCount > 0 && (
          <button className="btn primary" type="button" onClick={onNear}>
            Show {nearCount} closest {nearCount === 1 ? 'match' : 'matches'}
          </button>
        )}
        {likedCount > 0 && (
          <button className={`btn${nearCount ? '' : ' primary'}`} type="button" onClick={onPick}><Icon name="shuffle" />Pick one for me</button>
        )}
        <button className="btn" type="button" onClick={onMood}>Try another mood</button>
        <button className="linkbtn" type="button" onClick={onLeaveMood}>{stashed ? 'Back to your deck' : 'Change filters'}</button>
      </>
    )
  } else if (likedCount) {
    empty = (
      <>
        <h2>That's the lot.</h2>
        <p>You kept {likedCount}. Let me choose between them.</p>
        <button className="btn primary" type="button" onClick={onPick}><Icon name="shuffle" />Pick one for me</button>
      </>
    )
  } else if (rewatch) {
    empty = (
      <>
        <h2>Nothing left to rewatch.</h2>
        <p>Mark titles as seen while swiping and they'll show up here.</p>
        <button className="btn" type="button" onClick={onEdit}>Change filters</button>
      </>
    )
  } else {
    empty = (
      <>
        <h2>Nothing here.</h2>
        <p>No titles match, or you've seen them all. Try another service, or include hidden gems.</p>
        <button className="btn" type="button" onClick={onEdit}>Change filters</button>
      </>
    )
  }

  return (
    <main className="deck-wrap">
      <div className="deckbar">
        {mode === 'mood' ? (
          <button className="filterchip" type="button" aria-label={`Change your mood. Now showing ${label}`} onClick={onMood}>
            <Icon name="chat" size={18} /><span>{label}</span>
          </button>
        ) : (
          <button className="filterchip" type="button" aria-label={`Change filters. Now showing ${label}`} onClick={onEdit}>
            <Icon name="sliders" size={18} /><span>{label}</span>
          </button>
        )}
        <div className="deckmeta">
          {onMood && mode !== 'mood' && (
            <button className="moodbtn" type="button" title="Describe your mood" aria-label="Describe your mood" onClick={onMood}>
              <Icon name="chat" size={18} />
            </button>
          )}
          {top && <span className="count">{queue.length}{more ? '+' : ''} left</span>}
        </div>
      </div>

      <div className="deck" aria-live="polite">
        {top ? (
          queue.slice(0, 3).map((item, i) => (
            <SwipeCard
              key={item.id} item={item} depth={i} exit={i === 0 ? exit : null} allowWatched={!rewatch}
              reason={reasonFor(taste, item)} onDecide={decide} onInfo={onInfo}
            />
          ))
        ) : (
          <div className={`empty${waiting ? ' loading' : ''}`}>{empty}</div>
        )}
      </div>

      <div className="actions">
        <Action icon="ban" label="Never" hint="↓" title="Never show this again" disabled={!top} onClick={() => decide('never')} />
        <Action icon="x" label="Skip" hint="←" title="Skip for now" size={28} tone="big" disabled={!top} onClick={() => decide('no')} />
        {!rewatch && (
          <Action icon="eye" label="Seen it" hint="↑" title="Already seen it" disabled={!top} onClick={() => decide('watched')} />
        )}
        <Action icon="heart" label="Keep" hint="→" title="Keep on your shortlist" size={28} tone="big keep" disabled={!top} onClick={() => decide('yes')} />
        <Action icon="undo" label="Undo" hint="U" title="Undo the last swipe" disabled={!canUndo} onClick={onUndo} />
      </div>
      {top && taste.n < HINT_UNTIL && done < HINT_UNTIL && (
        <p className="hint">Swipe right to keep, left to skip. Tap the card for more.</p>
      )}
    </main>
  )
}
