import { useState } from 'react'
import { serviceName } from '../lib/services'
import { hueOf } from '../lib/storage'

const EMPTY = {
  shortlist: ['Nothing kept yet', 'Swipe right on anything that looks good.'],
  watched: ['Nothing marked watched', 'Tap "Already watched" on a card. It stays out of your deck, and you can rewatch it from here.'],
  never: ['Nothing hidden', 'Titles you mark "Never show again" appear here so you can bring them back.'],
}

export default function Library({
  liked, watched, blocked, winnerId,
  onPick, onClear, onBack, onRemoveLiked, onMarkWatched, onUnwatch, onRewatch, onRestore, onInfo,
}) {
  const [tab, setTab] = useState('shortlist')
  const lists = { shortlist: liked, watched, never: blocked }
  const items = [...lists[tab]].reverse()
  const likedIds = new Set(liked.map((c) => c.id))

  const actions = (c) => {
    if (tab === 'shortlist') {
      return [
        { label: 'Watched', onClick: () => onMarkWatched(c) },
        { label: 'Remove', onClick: () => onRemoveLiked(c.id) },
      ]
    }
    if (tab === 'watched') {
      return [
        { label: likedIds.has(c.id) ? 'On shortlist' : 'Rewatch', onClick: () => onRewatch(c), disabled: likedIds.has(c.id) },
        { label: 'Not watched', onClick: () => onUnwatch(c.id) },
      ]
    }
    return [{ label: 'Restore', onClick: () => onRestore(c.id) }]
  }

  const tabs = [
    { id: 'shortlist', label: 'Shortlist', n: liked.length },
    { id: 'watched', label: 'Watched', n: watched.length },
    { id: 'never', label: 'Never show', n: blocked.length },
  ]

  return (
    <main className="list">
      <h1>Your library</h1>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}
          >
            {t.label} <span>{t.n}</span>
          </button>
        ))}
      </div>

      <div className="rows">
        {items.length === 0 && (
          <div className="row">
            <div className="t"><b>{EMPTY[tab][0]}</b><span>{EMPTY[tab][1]}</span></div>
          </div>
        )}
        {items.map((c) => (
          <div className={`row ${tab === 'shortlist' && winnerId === c.id ? 'winner' : ''}`} key={c.id}>
            {c.poster
              ? <img className="swatch" src={c.poster} alt="" />
              : <div className="swatch" style={{ '--h': hueOf(c.title) }} />}
            <div className="t">
              <b>{c.title}</b>
              <span>
                {c.svcs.map(serviceName).join(' / ')}{c.year ? ` · ${c.year}` : ''} · {c.genre}
                {tab === 'watched' && c.like === 'liked' ? ' · You liked it' : ''}
                {tab === 'watched' && c.like === 'meh' ? ' · Not for you' : ''}
              </span>
            </div>
            <div className="rowacts">
              <button type="button" className="rowbtn" onClick={() => onInfo(c)}>Info</button>
              {actions(c).map((a) => (
                <button key={a.label} type="button" className="rowbtn" disabled={a.disabled} onClick={a.onClick}>{a.label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="pickbar">
        {tab === 'shortlist' && (
          <button className="cta" type="button" disabled={liked.length === 0} onClick={onPick}>Pick one for me</button>
        )}
        <div className="pickrow">
          <button className="linkbtn" type="button" onClick={onBack}>Back to swiping</button>
          {tab === 'shortlist' && liked.length > 0 && <button className="linkbtn" type="button" onClick={onClear}>Clear list</button>}
        </div>
      </div>
    </main>
  )
}
