import { serviceName } from '../lib/services'
import { hueOf } from '../lib/storage'

export default function Shortlist({ liked, winnerId, onRemove, onPick, onClear, onBack }) {
  return (
    <main className="list">
      <h1>Your shortlist</h1>
      <div className="rows">
        {liked.length === 0 && (
          <div className="row">
            <div className="t"><b>Nothing kept yet</b><span>Swipe right on anything that looks good.</span></div>
          </div>
        )}
        {liked.map((c) => (
          <div className={`row ${winnerId === c.id ? 'winner' : ''}`} key={c.id}>
            {c.poster
              ? <img className="swatch" src={c.poster} alt="" />
              : <div className="swatch" style={{ '--h': hueOf(c.title) }} />}
            <div className="t">
              <b>{c.title}</b>
              <span>{c.svcs.map(serviceName).join(' / ')}{c.year ? ` · ${c.year}` : ''} · {c.genre}</span>
            </div>
            <button className="x" type="button" aria-label={`Remove ${c.title}`} onClick={() => onRemove(c.id)}>✕</button>
          </div>
        ))}
      </div>
      <div className="pickbar">
        <button className="cta" type="button" disabled={liked.length === 0} onClick={onPick}>Pick one for me</button>
        <div className="pickrow">
          <button className="linkbtn" type="button" onClick={onBack}>Back to swiping</button>
          {liked.length > 0 && <button className="linkbtn" type="button" onClick={onClear}>Clear list</button>}
        </div>
      </div>
    </main>
  )
}
