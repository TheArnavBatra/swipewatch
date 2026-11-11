import { useCallback, useEffect, useRef, useState } from 'react'
import Setup from './components/Setup'
import Deck from './components/Deck'
import Library from './components/Library'
import Details from './components/Details'
import Icon from './components/Icon'
import Mood from './components/Mood'
import { aiPaused, aiStatus, askProfile } from './lib/ai'
import { buildMoodList } from './lib/mood'
import { profileInput } from './lib/profile'
import { SERVICES } from './lib/services'
import { createFeed, shuffle } from './lib/tmdb'
import { load, save } from './lib/storage'
import { emptyModel, favoriteGenres, learn, rank } from './lib/taste'

const REFILL_BELOW = 12
// The AI first reads their choices after this many swipes, then again after this many more.
const PROFILE_FIRST = 10
const PROFILE_EVERY = 20
const PROFILE_RETRY_MS = 10 * 60 * 1000
const SKIPPED_KEPT = 40
// A like made for a passing mood says less about long-term taste than one made in the usual deck.
const MOOD_LEARN = 0.5
const slimSkip = (t) => ({ id: t.id, title: t.title, year: t.year, genreIds: t.genreIds ?? [], ind: t.ind })
const has = (list, id) => list.some((x) => x.id === id)
// A card's one-line reason belongs to the list it came from, so it is not saved with the title.
const add = (list, item) => {
  if (has(list, item.id)) return list
  const kept = { ...item }
  delete kept.why
  return [...list, kept]
}
const drop = (list, id) => list.filter((x) => x.id !== id)
// Keep the card on top where it is, and order the cards behind it by the model.
const reorder = (model, queue, extra = []) =>
  queue.length ? [queue[0], ...rank(model, [...queue.slice(1), ...extra])] : rank(model, extra)

const RATE_PROMPT_MS = 7000
const LANGUAGE = { bollywood: 'Hindi', hollywood: 'English', both: 'Hindi + English' }
// A one-line summary of the filters a deck was started with, shown above the cards.
const describe = (services, ind, mode, gems) => {
  const names = SERVICES.filter((s) => services.includes(s.id)).map((s) => s.name)
  return [
    mode === 'rewatch' ? 'Rewatch' : null,
    names.length > 2 ? `${names.length} services` : names.join(' + '),
    LANGUAGE[ind],
    mode !== 'rewatch' && gems ? 'Hidden gems' : null,
  ].filter(Boolean).join(' · ')
}

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
  const [deckLabel, setDeckLabel] = useState('')
  const deckRef = useRef(null)
  const [queue, setQueue] = useState([])
  const [history, setHistory] = useState([])
  const [winnerId, setWinnerId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [more, setMore] = useState(false)
  const [error, setError] = useState('')
  const feedRef = useRef(null)
  const fetchingRef = useRef(false)
  const [skipped, setSkipped] = useState(() => load('rp.skipped', []))
  const libRef = useRef({ liked, watched, blocked, skipped })
  const [taste, setTaste] = useState(() => load('rp.taste', emptyModel()))
  const tasteRef = useRef(taste)
  const deckModeRef = useRef('new')
  const [ratePrompt, setRatePrompt] = useState(null)
  const [details, setDetails] = useState(null)
  const [profile, setProfile] = useState(() => load('rp.profile', null))
  const [aiOn, setAiOn] = useState(() => load('rp.ai', true))
  const [ai, setAi] = useState('checking')
  const [mood, setMood] = useState({ open: false, phase: 'idle', step: '', error: '', text: '' })
  const [stashed, setStashed] = useState(false)
  const [nearCount, setNearCount] = useState(0)
  const profileRef = useRef(profile)
  const profileTryRef = useRef(0)
  const epochRef = useRef(0)
  const aiOnRef = useRef(false)
  const stashRef = useRef(null)
  const nearRef = useRef([])
  const headRef = useRef('')
  const liveRef = useRef({})
  const moodRunRef = useRef(null)

  useEffect(() => save('rp.services', services), [services])
  useEffect(() => save('rp.ind', ind), [ind])
  useEffect(() => save('rp.gems', gems), [gems])
  useEffect(() => save('rp.liked', liked), [liked])
  useEffect(() => save('rp.watched', watched), [watched])
  useEffect(() => save('rp.blocked', blocked), [blocked])
  useEffect(() => save('rp.taste', taste), [taste])
  useEffect(() => save('rp.skipped', skipped), [skipped])
  useEffect(() => save('rp.profile', profile), [profile])
  useEffect(() => save('rp.ai', aiOn), [aiOn])
  useEffect(() => { libRef.current = { liked, watched, blocked, skipped } }, [liked, watched, blocked, skipped])
  useEffect(() => { liveRef.current = { queue, history, deckMode, deckLabel, more } })
  useEffect(() => { aiStatus().then(setAi) }, [])

  const start = async () => {
    setLoading(true)
    setError('')
    try {
      stashRef.current = null
      setStashed(false)
      nearRef.current = []
      setNearCount(0)
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
          lanes: () => (aiOnRef.current ? profileRef.current?.lanes ?? [] : []),
        })
        const first = await feed.next()
        feedRef.current = feed
        setQueue(rank(tasteRef.current, first))
        setMore(feed.hasMore())
      }
      setDeckMode(mode)
      setDeckLabel(describe(services, ind, mode, gems))
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
        // A mood list opened while this was loading: the titles go to the deck that was set aside.
        else if (stashRef.current?.feed === feed) stashRef.current.queue = reorder(tasteRef.current, stashRef.current.queue, items)
      })
      .catch(() => {
        // A failed refill ends the feed instead of retrying in a loop.
        if (feedRef.current === feed) feedRef.current = null
        else if (stashRef.current?.feed === feed) stashRef.current.feed = null
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
    // about tonight's mood for something already seen, so they teach nothing either. In a mood
    // list a skip only means "not for this mood", and a keep counts for half.
    const kind = deckModeRef.current
    let signal = kind === 'rewatch' ? undefined : { yes: 'yes', no: 'skip', never: 'never' }[dir]
    if (kind === 'mood' && signal === 'skip') signal = undefined
    const prevTaste = tasteRef.current
    const nextTaste = signal ? learn(prevTaste, item, signal, kind === 'mood' && signal === 'yes' ? MOOD_LEARN : 1) : prevTaste
    tasteRef.current = nextTaste
    setTaste(nextTaste)
    setQueue((q) => {
      const rest = q.filter((x) => x.id !== item.id)
      return kind === 'new' ? reorder(nextTaste, rest) : rest
    })
    // Skips are remembered, a few at a time, so the AI can see what they passed on.
    const skipLogged = kind === 'new' && dir === 'no'
    if (skipLogged) setSkipped((s) => [slimSkip(item), ...s.filter((x) => x.id !== item.id)].slice(0, SKIPPED_KEPT))
    setHistory((h) => [...h, { item, dir, prevTaste, skipLogged, wasLiked: has(l, item.id), wasWatched: has(w, item.id) }])
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
    // A mood list keeps the order it was given.
    setQueue((q) => (deckModeRef.current === 'new' ? reorder(next, q) : q))
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
    // The AI's read of their taste, and the skips it was built from, start over too.
    epochRef.current += 1
    profileRef.current = null
    setProfile(null)
    setSkipped([])
  }

  const undo = () => {
    const last = history[history.length - 1]
    if (!last) return
    const { item, dir, prevTaste, wasLiked, wasWatched, skipLogged } = last
    setHistory(history.slice(0, -1))
    if (skipLogged) setSkipped((s) => s.filter((x) => x.id !== item.id))
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
    // Asking again never lands on the same title while there is another to choose.
    const pool = liked.length > 1 ? liked.filter((c) => c.id !== winnerId) : liked
    setWinnerId(pool[Math.floor(Math.random() * pool.length)].id)
    setScreen('list')
  }

  const removeLiked = (id) => {
    setLiked((l) => drop(l, id))
    if (winnerId === id) setWinnerId(null)
  }

  // The AI reads their choices after the first few swipes, and again every so often. What comes
  // back is a short summary of their taste and a few searches (lanes) that feed the deck. It never
  // blocks anything: a failed try just waits for the next one.
  const aiUsable = ai === 'ready' && aiOn
  useEffect(() => { aiOnRef.current = aiUsable }, [aiUsable])
  useEffect(() => {
    if (!aiUsable || taste.n < PROFILE_FIRST) return
    const current = profileRef.current
    if (current && taste.n - current.n < PROFILE_EVERY) return
    if (aiPaused() || Date.now() - profileTryRef.current < PROFILE_RETRY_MS) return
    profileTryRef.current = Date.now()
    const epoch = epochRef.current
    const { liked: l, watched: w, blocked: b, skipped: s } = libRef.current
    askProfile(profileInput({ liked: l, skipped: s, blocked: b, watched: w, model: tasteRef.current }))
      .then(({ profile: p }) => {
        if (epoch !== epochRef.current) return
        const next = { ...p, n: tasteRef.current.n, at: Date.now() }
        profileRef.current = next
        setProfile(next)
      })
      .catch(() => undefined)
  }, [taste.n, aiUsable])

  const openMood = () => setMood((m) => ({ ...m, open: true, error: '', phase: m.phase === 'working' ? 'working' : 'idle' }))
  const closeMood = () => setMood((m) => (m.phase === 'working' ? m : { ...m, open: false, phase: 'idle', error: '' }))

  // A mood list is a temporary deck. The deck they had is set aside and comes back afterwards.
  const openMoodDeck = ({ list, near, headline, closest }) => {
    if (deckModeRef.current !== 'mood') {
      // Only a deck that is really there is set aside. Coming from the filters screen leaves nothing to return to.
      const live = liveRef.current
      const hadDeck = live.queue.length > 0 || live.history.length > 0
      stashRef.current = hadDeck
        ? { queue: live.queue, history: live.history, mode: live.deckMode, label: live.deckLabel, more: live.more, feed: feedRef.current }
        : null
      setStashed(hadDeck)
    }
    feedRef.current = null
    setQueue(list)
    setMore(false)
    setHistory([])
    setWinnerId(null)
    setRatePrompt(null)
    setDeckMode('mood')
    deckModeRef.current = 'mood'
    setDeckLabel(closest ? `Closest to: ${headline}` : headline)
    nearRef.current = near
    headRef.current = headline
    setNearCount(near.length)
    setScreen('deck')
  }

  // The looser matches take over once the exact ones are done, and each card says how it differs.
  const showNear = () => {
    setQueue(nearRef.current)
    setDeckLabel(`Closest to: ${headRef.current}`)
    nearRef.current = []
    setNearCount(0)
  }

  const findMood = async (text) => {
    setMood((m) => ({ ...m, text, phase: 'working', step: 'Reading your mood…', error: '' }))
    moodRunRef.current?.abort()
    const run = new AbortController()
    moodRunRef.current = run
    try {
      if (!services.length) throw new Error('Choose at least one service first, so the list only has things you can watch.')
      const { liked: l, watched: w, blocked: b } = libRef.current
      const result = await buildMoodList({
        text, services, ind, exclude: [...l, ...w, ...b].map((t) => t.id),
        model: tasteRef.current, profile: aiOnRef.current ? profileRef.current : null,
        onStep: (step) => { if (!run.signal.aborted) setMood((m) => ({ ...m, step })) },
        signal: run.signal,
      })
      if (run.signal.aborted) return
      openMoodDeck(result)
      setMood((m) => ({ ...m, open: false, phase: 'idle', step: '' }))
    } catch (e) {
      if (run.signal.aborted) return
      setMood((m) => ({ ...m, phase: 'error', error: e.message }))
    }
  }

  // Giving up on a search leaves the sheet open with their words still in it.
  const cancelMood = () => {
    moodRunRef.current?.abort()
    moodRunRef.current = null
    setMood((m) => ({ ...m, phase: 'idle', step: '', error: '' }))
  }

  const leaveMood = () => {
    const stash = stashRef.current
    stashRef.current = null
    setStashed(false)
    nearRef.current = []
    setNearCount(0)
    setMood((m) => ({ ...m, open: false, phase: 'idle', error: '' }))
    setRatePrompt(null)
    setHistory(stash?.history ?? [])
    setMore(stash?.feed ? stash.feed.hasMore() : false)
    feedRef.current = stash?.feed ?? null
    setDeckMode(stash?.mode ?? 'new')
    deckModeRef.current = stash?.mode ?? 'new'
    if (!stash) {
      setQueue([])
      setScreen('setup')
      return
    }
    // Whatever was decided in the mood list is not offered again. A rewatch deck is made of seen
    // titles, so only the hidden ones leave it.
    const { liked: l, watched: w, blocked: b } = libRef.current
    const gone = new Set((stash.mode === 'rewatch' ? b : [...l, ...w, ...b]).map((t) => t.id))
    setQueue(stash.queue.filter((t) => !gone.has(t.id)))
    setDeckLabel(stash.label)
  }

  const hasDeck = queue.length > 0 || history.length > 0
  const back = () => setScreen(hasDeck ? 'deck' : 'setup')
  // The sheet can decide for the card it was opened from, and only for that one.
  const decideFromDetails = (dir) => {
    setDetails(null)
    deckRef.current?.decide(dir)
  }
  const detailsOnTop = screen === 'deck' && details && queue[0]?.id === details.id
  const wash = queue[0]?.poster

  return (
    <>
    <div className="ambient" aria-hidden="true">
      <i className={screen === 'deck' && wash ? '' : 'off'} style={wash ? { backgroundImage: `url("${wash}")` } : undefined} />
    </div>
    <div className="app">
      <header className="topbar">
        {screen === 'list' ? (
          <button className="navbtn plain" type="button" onClick={back}><Icon name="back" size={18} />Back</button>
        ) : (
          <>
            <div className="brand">Swipe<em>watch</em></div>
            <button
              className="navbtn" type="button" aria-label={`Library, ${liked.length} on your shortlist`}
              onClick={() => setScreen('list')}
            >
              <Icon name="bookmark" size={18} />Library
              {liked.length > 0 && <span className="n" key={liked.length}>{liked.length}</span>}
            </button>
          </>
        )}
      </header>

      {screen === 'setup' && (
        <Setup
          services={services} ind={ind} mode={mode} gems={gems} watchedCount={watched.length}
          onServices={setServices} onInd={setInd} onMode={setMode} onGems={setGems}
          tasteCount={taste.n} onResetTaste={resetTaste}
          ai={ai} aiOn={aiOn} onAiOn={setAiOn} profile={profile} onMood={openMood}
          onStart={start} loading={loading} error={error}
          canResume={hasDeck} onResume={() => setScreen('deck')}
        />
      )}
      {screen === 'deck' && (
        <Deck
          ref={deckRef} label={deckLabel}
          queue={queue} mode={deckMode} more={more} loadingMore={loadingMore} taste={taste}
          paused={Boolean(details) || mood.open} onInfo={setDetails}
          likedCount={liked.length} canUndo={history.length > 0}
          onSwipe={swipe} onUndo={undo} onPick={pick} onEdit={() => setScreen('setup')}
          onMood={ai === 'off' ? null : openMood} onLeaveMood={leaveMood} stashed={stashed}
          nearCount={nearCount} onNear={showNear}
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
      {details && (
        <Details
          key={details.id} item={details} onClose={() => setDetails(null)}
          onDecide={detailsOnTop ? decideFromDetails : null} allowWatched={deckMode !== 'rewatch'}
        />
      )}
      {mood.open && (
        <Mood
          ai={ai} text={mood.text} phase={mood.phase} step={mood.step} error={mood.error}
          inMood={deckMode === 'mood' && screen === 'deck'} stashed={stashed}
          onText={(text) => setMood((m) => ({ ...m, text }))}
          onSubmit={findMood} onCancel={cancelMood} onClose={closeMood} onLeave={leaveMood}
        />
      )}
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
          onBack={back}
        />
      )}
    </div>
    </>
  )
}
