import { useCallback, useEffect, useRef, useState } from 'react'
import SwipeCard from './SwipeCard'

const EXIT_MS = 260

export default function Deck({ queue, likedCount, canUndo, onSwipe, onUndo, onPick, onEdit }) {
  const [exit, setExit] = useState(null)
  const timer = useRef(null)
  const top = queue[0]

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
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [decide])

  return (
    <main className="deck-wrap">
      <div className="meta">
        <span>{queue.length} left · {likedCount} kept</span>
        <button className="linkbtn" type="button" onClick={onEdit}>Change filters</button>
      </div>

      <div className="deck" aria-live="polite">
        {top ? (
          queue.slice(0, 3).map((item, i) => (
            <SwipeCard key={item.id} item={item} depth={i} exit={i === 0 ? exit : null} onDecide={decide} />
          ))
        ) : (
          <div className="empty">
            {likedCount ? (
              <>
                <h2>That's the lot.</h2>
                <p>You kept {likedCount}. Let me choose between them.</p>
                <button className="cta" type="button" onClick={onPick}>Pick one for me</button>
              </>
            ) : (
              <>
                <h2>Nothing here.</h2>
                <p>No titles match, or you skipped everything. Try another service or industry.</p>
                <button className="cta" type="button" onClick={onEdit}>Change filters</button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="actions">
        <button className="round small" type="button" aria-label="Undo last swipe" disabled={!canUndo} onClick={onUndo}>↶</button>
        <button className="round no" type="button" aria-label="Skip" disabled={!top} onClick={() => decide('no')}>✕</button>
        <button className="round yes" type="button" aria-label="Add to shortlist" disabled={!top} onClick={() => decide('yes')}>♥</button>
      </div>
      <p className="fine center">Drag the card, or use the arrow keys. Left skips, right keeps.</p>
    </main>
  )
}
