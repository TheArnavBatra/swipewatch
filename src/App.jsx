import { useCallback, useEffect, useRef, useState } from 'react'
import Setup from './components/Setup'
import Deck from './components/Deck'
import Library from './components/Library'
import Details from './components/Details'
import { createFeed, shuffle } from './lib/tmdb'
import { load, save } from './lib/storage'
import { emptyModel, favoriteGenres, learn, rank } from './lib/taste'

const REFILL_BELOW = 12
const has = (list, id) => list.some((x) => x.id === id)
const add = (list, item) => (has(list, item.id) ? list : [...list, item])
const drop = (list, id) => list.filter((x) => x.id !== id)
// Keep the card on top where it is, and order the cards behind it by the model.
const reorder = (model, queue, extra = []) =>
  queue.length ? [queue[0], ...rank(model, [...queue.slice(1), ...extra])] : rank(model, extra)

const RATE_PROMPT_MS = 7000

export default function App() {
  const [screen, setScreen] = useState('setup')
  const [services, setServices] = useState(() => load('rp.services', ['netflix', 'prime']))
  const [ind, setInd] = useState(() => load('rp.ind', 'both'))
  const [gems, setGems] = useState(() => load('rp.gems', false))
  const [mode, setMode] = useState('new')
  const [liked, setLiked] = useState(() => load('rp.liked', []))
  const [watched, setWatched] = useState(() => load('rp.watched', []))
  const [blocked, setBlocked] = useState(() => load('rp.blocked', []))
  const [deckMode, setDeckMode] = useState('new')
  const [queue, setQueue] = useState([])
  const [history, setHistory] = useState([])
  const [winnerId, setWinnerId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [more, setMore] = useState(false)
  const [error, setError] = useState('')
  const feedRef = useRef(null)
  const fetchingRef = useRef(false)
  const libRef = useRef({ liked, watched, blocked })
  const [taste, setTaste] = useState(() => load('rp.taste', emptyModel()))
  const tasteRef = useRef(taste)
  const deckModeRef = useRef('new')
  const [ratePrompt, setRatePrompt] = useState(null)
  const [details, setDetails] = useState(null)

  useEffect(() => save('rp.services', services), [services])
  useEffect(() => save('rp.ind', ind), [ind])
  useEffect(() => save('rp.gems', gems), [gems])
  useEffect(() => save('rp.liked', liked), [liked])
  useEffect(() => save('rp.watched', watched), [watched])
  useEffect(() => save('rp.blocked', blocked), [blocked])
  useEffect(() => save('rp.taste', taste), [taste])
  useEffect(() => { libRef.current = { liked, watched, blocked } }, [liked, watched, blocked])

  const start = async () => {
    setLoading(true)
    setError('')
    try {
      if (mode === 'rewatch') {
        const pool = watched.filter(
          (t) => t.svcs.some((s) => services.includes(s)) && (ind === 'both' || t.ind === ind),
        )
        feedRef.current = null
        setQueue(rank(tasteRef.current, shuffle(pool)))
        setMore(false)
      } else {
        const exclude = [...liked, ...watched, ...blocked].map((t) => t.id)
        const feed = createFeed({
          services, ind, exclude, minVotes: gems ? 10 : 100,
          favoriteGenres: () => favoriteGenres(tasteRef.current),
        })
        const first = await feed.next()
        feedRef.current = feed
        setQueue(rank(tasteRef.current, first))
        setMore(feed.hasMore())
      }
      setDeckMode(mode)
      deckModeRef.current = mode
      setHistory([])
      setWinnerId(null)
      setScreen('deck')
    } catch (e) {
      setError(`Could not load titles. ${e.message}. Check your connection and try again.`)
    } finally {
      setLoading(false)
    }
  }

  // Keep the deck topped up so it only ends when TMDB has no more titles for these filters.
  useEffect(() => {
    const feed = feedRef.current
    if (screen === 'setup' || !feed || fetchingRef.current || queue.length >= REFILL_BELOW || !feed.hasMore()) return
    fetchingRef.current = true
    setLoadingMore(true)
    feed.next()
      .then((items) => {
        if (feedRef.current === feed) setQueue((q) => reorder(tasteRef.current, q, items))
      })
      .catch(() => {
        // A failed refill ends the feed instead of retrying in a loop.
        if (feedRef.current === feed) feedRef.current = null
      })
      .finally(() => {
        fetchingRef.current = false
        setLoadingMore(false)
        setMore(feedRef.current?.hasMore() ?? false)
      })
  }, [queue.length, screen, loadingMore])

  const markWatched = (item) => {
    setWatched((w) => add(w, item))
    setLiked((l) => drop(l, item.id))
  }
  const markNever = (item) => {
    setBlocked((b) => add(b, item))
    setWatched((w) => drop(w, item.id))
    setLiked((l) => drop(l, item.id))
  }

  const swipe = useCallback((item, dir) => {
    const { liked: l, watched: w } = libRef.current
    // Watched teaches nothing by itself; the optional "Liked it" answer does. Rewatch swipes are
    // about tonight's mood for something already seen, so they teach nothing either.
    const learning = deckModeRef.current !== 'rewatch'
    const signal = learning ? { yes: 'yes', no: 'skip', never: 'never' }[dir] : undefined
    const prevTaste = tasteRef.current
    const nextTaste = signal ? learn(prevTaste, item, signal) : prevTaste
    tasteRef.current = nextTaste
    setTaste(nextTaste)
    setQueue((q) => {
      const rest = q.filter((x) => x.id !== item.id)
      return learning ? reorder(nextTaste, rest) : rest
    })
    setHistory((h) => [...h, { item, dir, prevTaste, wasLiked: has(l, item.id), wasWatched: has(w, item.id) }])
    setRatePrompt(dir === 'watched' ? item : null)
    if (dir === 'yes') setLiked((cur) => add(cur, item))
    else if (dir === 'watched') markWatched(item)
    else if (dir === 'never') markNever(item)
  }, [])

  const rate = (verdict) => {
    const item = ratePrompt
    if (!item) return
    setRatePrompt(null)
    setWatched((w) => w.map((x) => (x.id === item.id ? { ...x, like: verdict } : x)))
    const next = learn(tasteRef.current, item, verdict)
    tasteRef.current = next
    setTaste(next)
    setQueue((q) => reorder(next, q))
  }

  // The prompt fades on its own, so ignoring it leaves the title neutral.
  useEffect(() => {
    if (!ratePrompt) return
    const timer = setTimeout(() => setRatePrompt(null), RATE_PROMPT_MS)
    return () => clearTimeout(timer)
  }, [ratePrompt])

  const resetTaste = () => {
    const fresh = emptyModel()
    tasteRef.current = fresh
    setTaste(fresh)
  }

  const undo = () => {
    const last = history[history.length - 1]
    if (!last) return
    const { item, dir, prevTaste, wasLiked, wasWatched } = last
    setHistory(history.slice(0, -1))
    setRatePrompt(null)
    tasteRef.current = prevTaste
    setTaste(prevTaste)
    setQueue((q) => [item, ...q])
    if (dir === 'yes' && !wasLiked) setLiked((c) => drop(c, item.id))
    if (dir === 'watched') {
      if (!wasWatched) setWatched((c) => drop(c, item.id))
      if (wasLiked) setLiked((c) => add(c, item))
    }
    if (dir === 'never') {
      setBlocked((c) => drop(c, item.id))
      if (wasWatched) setWatched((c) => add(c, item))
      if (wasLiked) setLiked((c) => add(c, item))
    }
  }

  const pick = () => {
    if (!liked.length) return
    setWinnerId(liked[Math.floor(Math.random() * liked.length)].id)
    setScreen('list')
  }

  const removeLiked = (id) => {
    setLiked((l) => drop(l, id))
    if (winnerId === id) setWinnerId(null)
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">swipe<i>watch</i></div>
        {screen !== 'setup' && (
          <button className="linkbtn" type="button" onClick={() => setScreen('list')}>
            Library <b>{liked.length + watched.length + blocked.length}</b>
          </button>
        )}
      </header>

      {screen === 'setup' && (
        <Setup
          services={services} ind={ind} mode={mode} gems={gems} watchedCount={watched.length}
          onServices={setServices} onInd={setInd} onMode={setMode} onGems={setGems}
          tasteCount={taste.n} onResetTaste={resetTaste}
          onStart={start} loading={loading} error={error}
        />
      )}
      {screen === 'deck' && (
        <Deck
          queue={queue} mode={deckMode} more={more} loadingMore={loadingMore} taste={taste}
          paused={Boolean(details)} onInfo={setDetails}
          likedCount={liked.length} canUndo={history.length > 0}
          onSwipe={swipe} onUndo={undo} onPick={pick} onEdit={() => setScreen('setup')}
        />
      )}
      {screen === 'deck' && ratePrompt && (
        <div className="toast" role="status">
          <span>Did you like <b>{ratePrompt.title}</b>?</span>
          <div>
            <button type="button" onClick={() => rate('liked')}>Liked it</button>
            <button type="button" onClick={() => rate('meh')}>Not for me</button>
          </div>
        </div>
      )}
      {details && <Details key={details.id} item={details} onClose={() => setDetails(null)} />}
      {screen === 'list' && (
        <Library
          liked={liked} watched={watched} blocked={blocked} winnerId={winnerId}
          onPick={pick}
          onClear={() => { setLiked([]); setWinnerId(null) }}
          onRemoveLiked={removeLiked}
          onMarkWatched={markWatched}
          onUnwatch={(id) => setWatched((w) => drop(w, id))}
          onRewatch={(item) => setLiked((l) => add(l, item))}
          onRestore={(id) => setBlocked((b) => drop(b, id))}
          onInfo={setDetails}
          onBack={() => setScreen(queue.length || history.length ? 'deck' : 'setup')}
        />
      )}
    </div>
  )
}
