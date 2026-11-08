import { useCallback, useEffect, useState } from 'react'
import Setup from './components/Setup'
import Deck from './components/Deck'
import Shortlist from './components/Shortlist'
import { fetchTitles } from './lib/tmdb'
import { load, save } from './lib/storage'

export default function App() {
  const [screen, setScreen] = useState('setup')
  const [services, setServices] = useState(() => load('rp.services', ['netflix', 'prime']))
  const [ind, setInd] = useState(() => load('rp.ind', 'both'))
  const [liked, setLiked] = useState(() => load('rp.liked', []))
  const [queue, setQueue] = useState([])
  const [history, setHistory] = useState([])
  const [winnerId, setWinnerId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => save('rp.services', services), [services])
  useEffect(() => save('rp.ind', ind), [ind])
  useEffect(() => save('rp.liked', liked), [liked])

  const start = async () => {
    setLoading(true)
    setError('')
    try {
      const titles = await fetchTitles({ services, ind })
      const keptIds = new Set(liked.map((l) => l.id))
      setQueue(titles.filter((t) => !keptIds.has(t.id)))
      setHistory([])
      setWinnerId(null)
      setScreen('deck')
    } catch (e) {
      setError(`Could not load titles. ${e.message}. Check your connection and try again.`)
    } finally {
      setLoading(false)
    }
  }

  const swipe = useCallback((item, dir) => {
    setQueue((q) => q.filter((x) => x.id !== item.id))
    setHistory((h) => [...h, { item, dir }])
    if (dir === 'yes') setLiked((l) => [...l, item])
  }, [])

  const undo = () => {
    const last = history[history.length - 1]
    if (!last) return
    setHistory(history.slice(0, -1))
    setQueue((q) => [last.item, ...q])
    if (last.dir === 'yes') setLiked((l) => l.filter((x) => x.id !== last.item.id))
  }

  const pick = () => {
    if (!liked.length) return
    setWinnerId(liked[Math.floor(Math.random() * liked.length)].id)
    setScreen('list')
  }

  const remove = (id) => {
    setLiked((l) => l.filter((x) => x.id !== id))
    if (winnerId === id) setWinnerId(null)
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">swipe<i>watch</i></div>
        {screen !== 'setup' && (
          <button className="linkbtn" type="button" onClick={() => setScreen('list')}>
            Shortlist <b>{liked.length}</b>
          </button>
        )}
      </header>

      {screen === 'setup' && (
        <Setup
          services={services} ind={ind} onServices={setServices} onInd={setInd}
          onStart={start} loading={loading} error={error}
        />
      )}
      {screen === 'deck' && (
        <Deck
          queue={queue} likedCount={liked.length} canUndo={history.length > 0}
          onSwipe={swipe} onUndo={undo} onPick={pick} onEdit={() => setScreen('setup')}
        />
      )}
      {screen === 'list' && (
        <Shortlist
          liked={liked} winnerId={winnerId} onRemove={remove} onPick={pick}
          onClear={() => { setLiked([]); setWinnerId(null) }}
          onBack={() => setScreen(queue.length || history.length ? 'deck' : 'setup')}
        />
      )}
    </div>
  )
}
