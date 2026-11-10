import { useCallback, useEffect, useRef, useState } from 'react'
import SwipeCard from './SwipeCard'
import { reasonFor } from '../lib/taste'

const EXIT_MS = 260

export default function Deck({ queue, taste, mode, more, loadingMore, likedCount, canUndo, onSwipe, onUndo, onPick, onEdit }) {
  const [exit, setExit] = useState(null)
  const timer = useRef(null)
  const top = queue[0]
  const rewatch = mode === 'rewatch'

  useEffect(() => () => clearTimeout(timer.current), [])

  const decide = useCallback((dir) => {
    if (exit || !top) return
    setExit(dir)
    timer.current = setTimeout(() => {
      onSwipe(top, dir)
      setExit(null)
    }, EXIT_MS)
  }, [exit, top, onSwipe])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') decide('yes')
      else if (e.key === 'ArrowLeft') decide('no')
      else if (e.key === 'ArrowUp' && !rewatch) { e.preventDefault(); decide('watched') }
      else if (e.key === 'ArrowDown') { e.preventDefault(); decide('never') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [decide, rewatch])

  let empty
  if (loadingMore || more) {
    empty = (
      <>
        <h2>Finding more…</h2>
        <p>Loading the next batch of titles.</p>
      </>
    )
  } else if (likedCount) {
    empty = (
      <>
        <h2>That's the lot.</h2>
        <p>You kept {likedCount}. Let me choose between them.</p>
        <button className="cta" type="button" onClick={onPick}>Pick one for me</button>
      </>
    )
  } else if (rewatch) {
    empty = (
      <>
        <h2>Nothing left to rewatch.</h2>
        <p>Mark titles as watched while swiping and they'll show up here.</p>
        <button className="cta" type="button" onClick={onEdit}>Change filters</button>
      </>
    )
  } else {
    empty = (
      <>
        <h2>Nothing here.</h2>
        <p>No titles match, or you've seen them all. Try another service, or include hidden gems.</p>
        <button className="cta" type="button" onClick={onEdit}>Change filters</button>
      </>
    )
  }

  return (
    <main className="deck-wrap">
      <div className="meta">
        <span>{rewatch ? 'Rewatch · ' : ''}{queue.length}{more ? '+' : ''} left · {likedCount} kept</span>
        <button className="linkbtn" type="button" onClick={onEdit}>Change filters</button>
      </div>

      <div className="deck" aria-live="polite">
        {top ? (
          queue.slice(0, 3).map((item, i) => (
            <SwipeCard
              key={item.id} item={item} depth={i} exit={i === 0 ? exit : null}
              reason={reasonFor(taste, item)} onDecide={decide}
            />
          ))
        ) : (
          <div className="empty">{empty}</div>
        )}
      </div>

      <div className="actions">
        <button className="round small" type="button" aria-label="Undo last swipe" disabled={!canUndo} onClick={onUndo}>↶</button>
        <button className="round no" type="button" aria-label="Skip" disabled={!top} onClick={() => decide('no')}>✕</button>
        <button className="round yes" type="button" aria-label="Add to shortlist" disabled={!top} onClick={() => decide('yes')}>♥</button>
      </div>
      <div className="subactions">
        {!rewatch && (
          <button className="textbtn" type="button" disabled={!top} onClick={() => decide('watched')}>Already watched</button>
        )}
        <button className="textbtn danger" type="button" disabled={!top} onClick={() => decide('never')}>Never show again</button>
      </div>
      <p className="fine center">Drag or use arrow keys: left skips, right keeps{rewatch ? '' : ', up marks watched'}, down hides it for good.</p>
    </main>
  )
}
