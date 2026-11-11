import { useRef, useState } from 'react'
import ServiceMark from './ServiceMark'
import Icon from './Icon'
import { serviceOf } from '../lib/services'
import { hueOf } from '../lib/storage'
import { languageName } from '../lib/languages'

const SWIPE_X = 100
// Up and down are rarer and harder to take back by feel, so they need a longer pull.
const SWIPE_Y = 130
const TAP_SLOP = 8
const TAP_MS = 450
const EXIT = {
  yes: 'translate(135%, 6%) rotate(22deg)',
  no: 'translate(-135%, 6%) rotate(-22deg)',
  watched: 'translate(0, -125%) scale(0.92)',
  never: 'translate(0, 125%) scale(0.88) rotate(-5deg)',
}
// Cards waiting underneath sit slightly askew, like a pile of posters.
const REST = ['none', 'rotate(2.2deg) scale(0.97)', 'rotate(-2.6deg) scale(0.95)']
const clamp01 = (n) => Math.max(0, Math.min(1, n))

// The decision a drag of (x, y) stands for, or null while it is still undecided.
function verdict(x, y, allowWatched) {
  if (Math.abs(x) >= Math.abs(y)) return Math.abs(x) > SWIPE_X ? (x > 0 ? 'yes' : 'no') : null
  if (y < -SWIPE_Y) return allowWatched ? 'watched' : null
  return y > SWIPE_Y ? 'never' : null
}

export default function SwipeCard({ item, depth, exit, reason, allowWatched, onDecide, onInfo }) {
  const start = useRef(null)
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false })
  const isTop = depth === 0

  let transform = REST[depth] ?? REST[2]
  if (isTop && exit) transform = EXIT[exit]
  else if (isTop && (drag.x || drag.y)) transform = `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 20}deg)`

  const sideways = Math.abs(drag.x) >= Math.abs(drag.y)
  const stamp = {
    yes: exit === 'yes' ? 1 : sideways ? clamp01(drag.x / 90) : 0,
    no: exit === 'no' ? 1 : sideways ? clamp01(-drag.x / 90) : 0,
    seen: exit === 'watched' ? 1 : !sideways && allowWatched ? clamp01(-drag.y / 110) : 0,
    hide: exit === 'never' ? 1 : !sideways ? clamp01(drag.y / 110) : 0,
  }

  const onDown = (e) => {
    if (!isTop || exit) return
    start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, dx: 0, dy: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ x: 0, y: 0, active: true })
  }
  const onMove = (e) => {
    const s = start.current
    if (!s) return
    s.dx = e.clientX - s.x
    s.dy = e.clientY - s.y
    // With nothing to mark as watched, an upward pull only gives a little.
    if (s.dy < 0 && !allowWatched) s.dy *= 0.3
    setDrag({ x: s.dx, y: s.dy, active: true })
  }
  const release = () => {
    const s = start.current
    start.current = null
    setDrag({ x: 0, y: 0, active: false })
    return s
  }
  const onUp = (e) => {
    // Read from the ref: a fast flick can release before React re-renders with the latest drag state.
    const s = release()
    if (!s) return
    if (Math.hypot(s.dx, s.dy) < TAP_SLOP) {
      if (e.timeStamp - s.t < TAP_MS) onInfo(item)
      return
    }
    const dir = verdict(s.dx, s.dy, allowWatched)
    if (dir) onDecide(dir)
  }

  return (
    <article
      className={`card${drag.active ? ' drag' : ''}${isTop ? ' top' : ''}`}
      style={{ '--h': hueOf(item.title), transform, opacity: isTop && exit ? 0 : 1, zIndex: 10 - depth }}
      aria-hidden={!isTop}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={release}
    >
      {item.poster
        ? <img className="poster" src={item.poster} alt="" draggable="false" />
        : <span className="initial" aria-hidden="true">{item.title.replace(/[^A-Za-z0-9]/g, '').slice(0, 1)}</span>}

      <div className="card-top">
        <div className="badges">
          {item.svcs.map((id) => {
            const svc = serviceOf(id)
            return <span className="badge" key={id} style={{ '--dot': svc.dot }}><ServiceMark service={svc} size={16} />{svc.name}</span>
          })}
        </div>
        {isTop && (
          <button
            className="infobtn" type="button" aria-label={`More about ${item.title}`}
            onPointerDown={(e) => e.stopPropagation()} onClick={() => onInfo(item)}
          >
            <Icon name="info" strokeWidth="2.4" />
          </button>
        )}
      </div>

      <div className="card-info">
        {/* An AI reason is a whole phrase already; the model's own is a feature name. */}
        {item.why ? <div className="reason">{item.why}</div> : reason && <div className="reason">Because you like {reason}</div>}
        <h2>{item.title}</h2>
        <div className="sub">
          {item.rating && <span className="star"><Icon name="star" size={13} />{item.rating}</span>}
          {item.year && <span>{item.year}</span>}
          <span>{item.genre}</span>
          <span>{languageName(item)}</span>
        </div>
        <p>{item.blurb}</p>
      </div>

      <span className="stamp yes" style={{ opacity: stamp.yes }}>Keep</span>
      <span className="stamp no" style={{ opacity: stamp.no }}>Skip</span>
      <span className="stamp seen" style={{ opacity: stamp.seen }}>Seen it</span>
      <span className="stamp hide" style={{ opacity: stamp.hide }}>Never</span>
    </article>
  )
}
