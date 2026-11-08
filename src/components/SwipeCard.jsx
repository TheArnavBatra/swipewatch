import { useRef, useState } from 'react'
import { serviceName } from '../lib/services'
import { hueOf } from '../lib/storage'

const THRESHOLD = 100

export default function SwipeCard({ item, depth, exit, onDecide }) {
  const start = useRef(null)
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false })
  const isTop = depth === 0

  let transform = `translateY(${depth * 10}px) scale(${1 - depth * 0.04})`
  let opacity = depth > 1 ? 0.6 : 1
  if (isTop && exit) {
    const sign = exit === 'yes' ? 1 : -1
    transform = `translate(${sign * 520}px, 40px) rotate(${sign * 24}deg)`
    opacity = 0
  } else if (isTop && (drag.x || drag.y)) {
    transform = `translate(${drag.x}px, ${drag.y}px) rotate(${drag.x / 18}deg)`
  }

  const yesOpacity = exit === 'yes' ? 1 : Math.max(0, Math.min(1, drag.x / 90))
  const noOpacity = exit === 'no' ? 1 : Math.max(0, Math.min(1, -drag.x / 90))

  const onDown = (e) => {
    if (!isTop || exit) return
    start.current = { x: e.clientX, y: e.clientY }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ x: 0, y: 0, active: true })
  }
  const onMove = (e) => {
    if (!start.current) return
    const x = e.clientX - start.current.x
    start.current.dx = x
    setDrag({ x, y: (e.clientY - start.current.y) * 0.3, active: true })
  }
  const onUp = () => {
    if (!start.current) return
    // Read from the ref: a fast flick can release before React re-renders with the latest drag state.
    const dx = start.current.dx ?? 0
    start.current = null
    if (Math.abs(dx) > THRESHOLD) onDecide(dx > 0 ? 'yes' : 'no')
    setDrag({ x: 0, y: 0, active: false })
  }

  const hue = hueOf(item.title)
  const meta = [item.year, item.rating ? `★ ${item.rating}` : null].filter(Boolean).join(' · ')

  return (
    <div
      className={`card ${drag.active ? 'drag' : ''} ${isTop ? 'top' : ''}`}
      style={{ '--h': hue, transform, opacity, zIndex: 10 - depth }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {item.poster && <img className="poster" src={item.poster} alt="" draggable="false" />}
      {!item.poster && <span className="big">{item.title.replace(/[^A-Za-z0-9]/g, '').slice(0, 1)}</span>}
      <div className="tags">
        {item.svcs.map((s) => <span className="tag svc" key={s}>{serviceName(s)}</span>)}
        <span className="tag">{item.ind === 'bollywood' ? 'Hindi' : 'English'}</span>
        <span className="tag">{item.genre}</span>
      </div>
      <div className="info">
        <h2>{item.title}</h2>
        {meta && <div className="sub">{meta}</div>}
        <p>{item.blurb}</p>
      </div>
      <span className="stamp yes" style={{ opacity: yesOpacity }}>WATCH</span>
      <span className="stamp no" style={{ opacity: noOpacity }}>SKIP</span>
    </div>
  )
}
