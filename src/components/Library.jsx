import { useState } from 'react'
import Icon from './Icon'
import { serviceName } from '../lib/services'
import { hueOf } from '../lib/storage'

const TABS = [
  { id: 'shortlist', label: 'Shortlist' },
  { id: 'watched', label: 'Seen' },
  { id: 'never', label: 'Hidden' },
]
const EMPTY = {
  shortlist: ['Nothing kept yet', 'Swipe right on anything that looks good and it lands here.'],
  watched: ['Nothing marked as seen', 'Tap Seen it on a card. It stays out of your deck, and you can line it up for a rewatch later.'],
  never: ['Nothing hidden', 'Titles you never want to see again wait here, in case you change your mind.'],
}
const VERDICT = { liked: 'You liked it', meh: 'Not for you' }
const facts = (c) => [c.svcs.map(serviceName).join(' / '), c.year, c.genre].filter(Boolean).join(' · ')

function Thumb({ item }) {
  return item.poster
    ? <img className="thumb" src={item.poster} alt="" loading="lazy" />
    : <span className="thumb" style={{ '--h': hueOf(item.title) }} />
}

export default function Library({
  liked, watched, blocked, winnerId,
  onPick, onClear, onBack, onRemoveLiked, onMarkWatched, onUnwatch, onRewatch, onRestore, onInfo,
}) {
  const [tab, setTab] = useState('shortlist')
  const [confirmClear, setConfirmClear] = useState(false)
  const lists = { shortlist: liked, watched, never: blocked }
  const likedIds = new Set(liked.map((c) => c.id))
  const winner = tab === 'shortlist' ? liked.find((c) => c.id === winnerId) : null
  // Newest first. The pick is already shown on its ticket, so it is left out of the rows.
  const items = [...lists[tab]].reverse().filter((c) => c.id !== winner?.id)

  const open = (id) => { setTab(id); setConfirmClear(false) }
  const clear = () => {
    if (confirmClear) onClear()
    setConfirmClear(!confirmClear)
  }

  const actions = (c) => {
    if (tab === 'shortlist') {
      return (
        <>
          <button className="btn" type="button" onClick={() => onMarkWatched(c)}>Seen it</button>
          <button className="linkbtn" type="button" onClick={() => onRemoveLiked(c.id)}>Remove</button>
        </>
      )
    }
    if (tab === 'watched') {
      const queued = likedIds.has(c.id)
      return (
        <>
          <button className="btn" type="button" disabled={queued} onClick={() => onRewatch(c)}>{queued ? 'On your shortlist' : 'Rewatch'}</button>
          <button className="linkbtn" type="button" onClick={() => onUnwatch(c.id)}>Not seen</button>
        </>
      )
    }
    return <button className="btn" type="button" onClick={() => onRestore(c.id)}>Bring back</button>
  }

  return (
    <main className="list">
      <div className="list-head">
        <h1>Library</h1>
        {tab === 'shortlist' && liked.length > 0 && (
          <button className="linkbtn" type="button" onClick={clear}>{confirmClear ? 'Tap again to clear' : 'Clear shortlist'}</button>
        )}
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className={`tab${tab === t.id ? ' on' : ''}`} onClick={() => open(t.id)}
          >
            {t.label}<span>{lists[t.id].length}</span>
          </button>
        ))}
      </div>

      {winner && (
        <div className="ticket" key={winner.id} role="status">
          <Thumb item={winner} />
          <div className="ticket-body">
            <div className="ticket-kicker">Tonight's pick</div>
            <h2>{winner.title}</h2>
            <p>{facts(winner)}</p>
            <div className="ticket-acts">
              <button className="btn solid" type="button" onClick={() => onInfo(winner)}>Details</button>
              <button className="btn" type="button" onClick={() => onMarkWatched(winner)}>Seen it</button>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 && !winner ? (
        <div className="blank">
          <h2>{EMPTY[tab][0]}</h2>
          <p>{EMPTY[tab][1]}</p>
        </div>
      ) : (
        <ul className="rows">
          {items.map((c) => (
            <li className="row" key={c.id}>
              <button className="thumbbtn" type="button" tabIndex={-1} aria-hidden="true" onClick={() => onInfo(c)}>
                <Thumb item={c} />
              </button>
              <div className="t">
                <button className="titlebtn" type="button" onClick={() => onInfo(c)}>{c.title}</button>
                <span className="meta">
                  {facts(c)}
                  {tab === 'watched' && VERDICT[c.like] && <> · <span className="verdict">{VERDICT[c.like]}</span></>}
                </span>
                <div className="rowacts">{actions(c)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="pickbar">
        {tab === 'shortlist' && liked.length > 0 && (
          <button className="btn primary big" type="button" onClick={onPick}>
            <Icon name="shuffle" />{winner && liked.length > 1 ? 'Pick another' : 'Pick one for me'}
          </button>
        )}
        {tab === 'shortlist' && liked.length === 0 && (
          <button className="btn big" type="button" onClick={onBack}>Go find something</button>
        )}
      </div>
    </main>
  )
}
