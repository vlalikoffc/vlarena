/**
 * Application store: state, persistence, and the battle engine.
 *
 * Streaming never goes through the reducer (see `store/lanes.ts`); the reducer
 * owns durable data — battles, ratings, settings — plus UI chrome state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react'
import type { ReactNode } from 'react'

import type {
  AppState,
  Battle,
  Category,
  ModelRoute,
  Rating,
  Route,
  Settings,
  Turn,
  VoteKind,
} from '../lib/types'
import { MODELS, getModel } from '../lib/models'
import { applyDeltas, computeDeltas } from '../lib/elo'
import { classify } from '../lib/simulator'
import { ProviderError, routeFor, streamAnswer } from '../lib/providers'
import {
  STATE_VERSION,
  defaultRatings,
  defaultSettings,
  emptyBattle,
  seedHistory,
} from '../lib/seed'
import { estimateTokens, titleFromPrompt, uid } from '../lib/utils'
import { KEYS, kv } from '../lib/storage'
import { EMPTY_LANE, laneKey, laneStore } from './lanes'
import type { ChatMessage } from '../lib/providers'
import type { LiveLane } from './lanes'

export interface Toast {
  id: string
  kind: 'info' | 'success' | 'error'
  title: string
  body?: string
}

export interface State {
  hydrated: boolean
  route: Route
  settings: Settings
  ratings: Record<string, Rating>
  battles: Battle[]
  activeId: string | null
  sidebarCollapsed: boolean
  paletteOpen: boolean
  toasts: Toast[]
}

type Action =
  | { type: 'hydrate'; patch: Partial<State> }
  | { type: 'route'; route: Route }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'settings/route'; modelId: string; route: Partial<ModelRoute> }
  | { type: 'battle/create'; battle: Battle }
  | { type: 'battle/patch'; id: string; patch: Partial<Battle> }
  | { type: 'battle/delete'; id: string }
  | { type: 'battle/turn'; id: string; turn: Turn }
  | { type: 'battle/turnPatch'; id: string; turnId: string; patch: Partial<Turn> }
  | { type: 'battle/clear' }
  | { type: 'active'; id: string | null }
  | { type: 'ratings/set'; ratings: Record<string, Rating> }
  | { type: 'sidebar/toggle' }
  | { type: 'palette'; open: boolean }
  | { type: 'toast/push'; toast: Toast }
  | { type: 'toast/pop'; id: string }

const initialState: State = {
  hydrated: false,
  route: 'battle',
  settings: defaultSettings(),
  ratings: {},
  battles: [],
  activeId: null,
  sidebarCollapsed: false,
  paletteOpen: false,
  toasts: [],
}

function patchBattle(state: State, id: string, patch: Partial<Battle>): Battle[] {
  return state.battles.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b))
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrate':
      return { ...state, ...action.patch, hydrated: true }

    case 'route':
      return { ...state, route: action.route }

    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.patch } }

    case 'settings/route': {
      const model = getModel(action.modelId)
      const prev =
        state.settings.routes[action.modelId] ??
        ({ provider: model.provider, wireId: model.id, enabled: true } as ModelRoute)
      return {
        ...state,
        settings: {
          ...state.settings,
          routes: {
            ...state.settings.routes,
            [action.modelId]: { ...prev, ...action.route },
          },
        },
      }
    }

    case 'battle/create':
      return {
        ...state,
        battles: [action.battle, ...state.battles],
        activeId: action.battle.id,
      }

    case 'battle/patch':
      return { ...state, battles: patchBattle(state, action.id, action.patch) }

    case 'battle/delete': {
      const battles = state.battles.filter((b) => b.id !== action.id)
      return {
        ...state,
        battles,
        activeId: state.activeId === action.id ? (battles[0]?.id ?? null) : state.activeId,
      }
    }

    case 'battle/turn':
      return {
        ...state,
        battles: patchBattle(state, action.id, {
          turns: [...(state.battles.find((b) => b.id === action.id)?.turns ?? []), action.turn],
        }),
      }

    case 'battle/turnPatch':
      return {
        ...state,
        battles: state.battles.map((b) =>
          b.id === action.id
            ? {
                ...b,
                updatedAt: Date.now(),
                turns: b.turns.map((t) => (t.id === action.turnId ? { ...t, ...action.patch } : t)),
              }
            : b,
        ),
      }

    case 'battle/clear':
      return { ...state, battles: [], activeId: null }

    case 'active':
      return { ...state, activeId: action.id }

    case 'ratings/set':
      return { ...state, ratings: action.ratings }

    case 'sidebar/toggle':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed }

    case 'palette':
      return { ...state, paletteOpen: action.open }

    case 'toast/push':
      return { ...state, toasts: [...state.toasts.slice(-3), action.toast] }

    case 'toast/pop':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) }

    default:
      return state
  }
}

/* ------------------------------------------------------------------ */

export interface Actions {
  setRoute: (route: Route) => void
  patchSettings: (patch: Partial<Settings>) => void
  setModelRoute: (modelId: string, route: Partial<ModelRoute>) => void
  toggleSidebar: () => void
  setPalette: (open: boolean) => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void

  newBattle: (laneCount?: number) => Battle
  send: (prompt: string, battleId?: string) => Promise<void>
  stop: (battleId?: string) => void
  regenerate: (turnId: string) => Promise<void>
  vote: (turnId: string, kind: VoteKind, lane?: string) => void
  reveal: (battleId?: string) => void
  setCategory: (category: Category) => void
  setLaneModel: (battleId: string, lane: string, modelId: string) => void
  rerollModels: (battleId: string) => void
  openBattle: (id: string) => void
  deleteBattle: (id: string) => void
  clearHistory: () => void
  resetRatings: () => void
  isStreaming: (battleId?: string) => boolean
}

interface Ctx {
  state: State
  actions: Actions
  activeBattle: Battle | null
}

const AppContext = createContext<Ctx | null>(null)

export function useApp(): Ctx {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp() must be used inside <AppProvider>')
  return ctx
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const stateRef = useRef(state)
  stateRef.current = state

  const controllers = useRef(new Map<string, AbortController>())
  const starts = useRef(new Map<string, number>())
  const ticker = useRef<number | null>(null)

  /* ---------------- toasts ---------------- */

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = uid('t')
    dispatch({ type: 'toast/push', toast: { ...t, id } })
    window.setTimeout(() => dispatch({ type: 'toast/pop', id }), t.kind === 'error' ? 7000 : 3600)
  }, [])

  const dismissToast = useCallback((id: string) => dispatch({ type: 'toast/pop', id }), [])

  /* ---------------- hydration ---------------- */

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const stored = await kv().get<AppState>(KEYS.state)
      if (cancelled) return
      let loaded: Battle[]
      if (stored && stored.version === STATE_VERSION && Array.isArray(stored.battles)) {
        loaded = stored.battles
        dispatch({
          type: 'hydrate',
          patch: {
            settings: { ...defaultSettings(), ...stored.settings },
            ratings: stored.ratings ?? defaultRatings(),
            battles: loaded,
            activeId: stored.activeBattleId ?? null,
          },
        })
      } else {
        const ratings = defaultRatings()
        const seeded = seedHistory(ratings)
        loaded = seeded.battles
        dispatch({
          type: 'hydrate',
          patch: { ratings: seeded.ratings, battles: loaded, activeId: null },
        })
      }
      // Re-hydrate live lanes for the persisted turns so panes render instantly.
      // (stateRef is not usable here — dispatch hasn't re-rendered yet.)
      for (const b of loaded) {
        for (const t of b.turns) {
          for (const l of t.lanes) {
            laneStore.ensure(laneKey(t.id, l.lane), {
              status: l.status,
              text: l.text,
              tokens: l.tokens,
              ttftMs: l.ttftMs,
              elapsedMs: l.elapsedMs,
              tokPerSec: l.tokPerSec,
              ...(l.error ? { error: l.error } : {}),
            })
          }
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /* ---------------- persistence (debounced) ---------------- */

  useEffect(() => {
    if (!state.hydrated) return
    const t = window.setTimeout(() => {
      const payload: AppState = {
        version: STATE_VERSION,
        settings: state.settings,
        ratings: state.ratings,
        battles: state.battles.slice(0, 200),
        activeBattleId: state.activeId,
      }
      void kv().set(KEYS.state, payload)
    }, 400)
    return () => window.clearTimeout(t)
  }, [state.hydrated, state.settings, state.ratings, state.battles, state.activeId])

  /* ---------------- theme ---------------- */

  useEffect(() => {
    const apply = (mode: Settings['theme']) => {
      const resolved =
        mode === 'system'
          ? window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'light'
            : 'dark'
          : mode
      document.documentElement.dataset.theme = resolved
      try {
        localStorage.setItem('vlarena:theme', resolved)
      } catch {
        /* ignore */
      }
    }
    apply(state.settings.theme)
    if (state.settings.theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => apply('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [state.settings.theme])

  useEffect(() => {
    document.documentElement.classList.toggle('motion-reduce', state.settings.reduceMotion)
  }, [state.settings.reduceMotion])

  /* ---------------- streaming ticker ---------------- */

  const startTicker = useCallback(() => {
    if (ticker.current !== null) return
    ticker.current = window.setInterval(() => {
      const now = performance.now()
      for (const [key, startedAt] of starts.current) {
        const live = laneStore.snapshot(key)
        if (!live || (live.status !== 'streaming' && live.status !== 'queued')) continue
        const elapsed = now - startedAt
        const ttft = live.ttftMs ?? 0
        const decodeWindow = Math.max(1, elapsed - ttft) / 1000
        laneStore.update(key, {
          elapsedMs: elapsed,
          tokPerSec: live.tokens > 0 ? Math.round((live.tokens / decodeWindow) * 10) / 10 : 0,
        })
      }
    }, 200)
  }, [])

  const stopTickerIfIdle = useCallback(() => {
    if (starts.current.size === 0 && ticker.current !== null) {
      window.clearInterval(ticker.current)
      ticker.current = null
    }
  }, [])

  useEffect(
    () => () => {
      if (ticker.current !== null) window.clearInterval(ticker.current)
      controllers.current.forEach((c) => c.abort())
    },
    [],
  )

  /* ---------------- engine ---------------- */

  const isStreaming = useCallback((battleId?: string) => {
    for (const key of controllers.current.keys()) {
      if (!battleId || key.startsWith(`${battleId}:`)) return true
    }
    return false
  }, [])

  const newBattle = useCallback((laneCount?: number): Battle => {
    const battle = emptyBattle(laneCount ?? stateRef.current.settings.lanes)
    battle.simulated = stateRef.current.settings.mode === 'simulated'
    dispatch({ type: 'battle/create', battle })
    dispatch({ type: 'route', route: 'battle' })
    return battle
  }, [])

  const runLane = useCallback(
    async (battle: Battle, turn: Turn, lane: Turn['lanes'][number], signal: AbortSignal, salt: number) => {
      const st = stateRef.current
      const model = getModel(lane.modelId)
      const key = laneKey(turn.id, lane.lane)

      const messages: ChatMessage[] = []
      for (const prev of battle.turns) {
        if (prev.id === turn.id) continue
        messages.push({ role: 'user', content: prev.prompt })
        const answer = prev.lanes.find((l) => l.lane === lane.lane)
        if (answer?.text) messages.push({ role: 'assistant', content: answer.text })
      }
      messages.push({ role: 'user', content: turn.prompt })

      starts.current.set(key, performance.now())
      laneStore.set(key, { ...EMPTY_LANE, status: 'queued' })
      startTicker()

      let buffer = ''
      let scheduled = false
      let text = ''
      const flush = () => {
        scheduled = false
        if (!buffer) return
        text += buffer
        buffer = ''
        laneStore.update(key, { text, tokens: estimateTokens(text) })
      }
      const schedule = () => {
        if (!scheduled) {
          scheduled = true
          requestAnimationFrame(flush)
        }
      }

      try {
        await streamAnswer({
          model,
          route: routeFor(model, st.settings),
          messages,
          settings: st.settings,
          signal,
          salt,
          onFirstToken: (ttftMs) => laneStore.update(key, { status: 'streaming', ttftMs }),
          onChunk: (chunk) => {
            buffer += chunk
            schedule()
          },
        })
        flush()
        const live = laneStore.get(key)
        const elapsed = performance.now() - (starts.current.get(key) ?? performance.now())
        const decodeWindow = Math.max(1, elapsed - (live.ttftMs ?? 0)) / 1000
        laneStore.update(key, {
          status: signal.aborted ? 'aborted' : 'done',
          elapsedMs: elapsed,
          tokPerSec: live.tokens ? Math.round((live.tokens / decodeWindow) * 10) / 10 : 0,
        })
      } catch (err) {
        flush()
        const message =
          err instanceof DOMException && err.name === 'AbortError'
            ? 'Stopped'
            : err instanceof ProviderError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Unknown error'
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          toast({ kind: 'error', title: `${model.name} failed`, body: message })
        }
        laneStore.update(key, {
          status: signal.aborted ? 'aborted' : 'error',
          error: message,
          elapsedMs: performance.now() - (starts.current.get(key) ?? performance.now()),
        })
      } finally {
        starts.current.delete(key)
        stopTickerIfIdle()
      }
    },
    [startTicker, stopTickerIfIdle, toast],
  )

  const commitTurn = useCallback((battleId: string, turn: Turn) => {
    const lanes = turn.lanes.map((l) => {
      const live = laneStore.get(laneKey(turn.id, l.lane))
      return {
        ...l,
        status: live.status,
        text: live.text,
        tokens: live.tokens,
        ttftMs: live.ttftMs,
        elapsedMs: live.elapsedMs,
        tokPerSec: live.tokPerSec,
        ...(live.error ? { error: live.error } : {}),
      }
    })
    dispatch({ type: 'battle/turnPatch', id: battleId, turnId: turn.id, patch: { lanes } })
  }, [])

  const runTurn = useCallback(
    async (battle: Battle, turn: Turn, salt: number) => {
      const key = `${battle.id}:${turn.id}`
      const ctrl = new AbortController()
      controllers.current.set(key, ctrl)
      try {
        await Promise.allSettled(turn.lanes.map((lane) => runLane(battle, turn, lane, ctrl.signal, salt)))
      } finally {
        controllers.current.delete(key)
        commitTurn(battle.id, turn)
      }
    },
    [runLane, commitTurn],
  )

  const send = useCallback(
    async (prompt: string, battleId?: string) => {
      const text = prompt.trim()
      if (!text) return
      const st = stateRef.current

      let battle = battleId
        ? st.battles.find((b) => b.id === battleId)
        : st.activeId
          ? st.battles.find((b) => b.id === st.activeId)
          : undefined

      if (battle && isStreaming(battle.id)) {
        toast({ kind: 'info', title: 'Battle in progress', body: 'Stop the current round first.' })
        return
      }

      if (!battle) {
        battle = emptyBattle(st.settings.lanes)
        battle.simulated = st.settings.mode === 'simulated'
        dispatch({ type: 'battle/create', battle })
      }

      const category: Category = battle.turns.length ? battle.category : classify(text).category
      const turn: Turn = {
        id: uid('turn'),
        prompt: text,
        at: Date.now(),
        lanes: battle.laneOrder.map((lane) => ({
          lane,
          modelId: battle!.models[lane]!,
          status: 'queued',
          text: '',
          tokens: 0,
          ttftMs: null,
          elapsedMs: 0,
          tokPerSec: 0,
        })),
        votes: [],
        eloDeltas: {},
      }

      dispatch({
        type: 'battle/patch',
        id: battle.id,
        patch: {
          category,
          title: battle.turns.length ? battle.title : titleFromPrompt(text),
          simulated: battle.simulated || st.settings.mode === 'simulated',
        },
      })
      dispatch({ type: 'battle/turn', id: battle.id, turn })
      dispatch({ type: 'active', id: battle.id })
      dispatch({ type: 'route', route: 'battle' })

      await runTurn(battle, turn, battle.turns.length)
    },
    [isStreaming, runTurn, toast],
  )

  const stop = useCallback((battleId?: string) => {
    const st = stateRef.current
    const target = battleId ?? st.activeId
    for (const [key, ctrl] of controllers.current) {
      if (!target || key.startsWith(`${target}:`)) ctrl.abort()
    }
  }, [])

  const regenerate = useCallback(
    async (turnId: string) => {
      const st = stateRef.current
      const battle = st.battles.find((b) => b.turns.some((t) => t.id === turnId))
      const turn = battle?.turns.find((t) => t.id === turnId)
      if (!battle || !turn) return
      if (isStreaming(battle.id)) return

      const salt = battle.turns.indexOf(turn) + Math.floor(Math.random() * 1000)
      dispatch({
        type: 'battle/turnPatch',
        id: battle.id,
        turnId,
        patch: {
          votes: [],
          eloDeltas: {},
          lanes: turn.lanes.map((l) => ({
            ...l,
            status: 'queued',
            text: '',
            tokens: 0,
            ttftMs: null,
            elapsedMs: 0,
            tokPerSec: 0,
            error: undefined,
          })),
        },
      })
      for (const l of turn.lanes) laneStore.set(laneKey(turnId, l.lane), { ...EMPTY_LANE, status: 'queued' })
      await runTurn(battle, { ...turn, votes: [], eloDeltas: {} }, salt)
    },
    [isStreaming, runTurn],
  )

  const vote = useCallback(
    (turnId: string, kind: VoteKind, lane?: string) => {
      const st = stateRef.current
      const battle = st.battles.find((b) => b.turns.some((t) => t.id === turnId))
      const turn = battle?.turns.find((t) => t.id === turnId)
      if (!battle || !turn) return
      if (turn.votes.length) {
        toast({ kind: 'info', title: 'Already voted', body: 'Start a new round to vote again.' })
        return
      }
      if (isStreaming(battle.id)) {
        toast({ kind: 'info', title: 'Hold on', body: 'Wait for every model to finish (or press Stop).' })
        return
      }

      const winnerLane = kind === 'best' ? lane : undefined
      const placements = battle.laneOrder.map((l) => ({
        modelId: battle.models[l]!,
        placement: winnerLane ? (l === winnerLane ? 0 : 1) : 0,
      }))
      const deltas = computeDeltas(st.ratings, placements, battle.category)
      const winLoss: Record<string, 'win' | 'loss' | 'tie'> = {}
      for (const l of battle.laneOrder) {
        winLoss[battle.models[l]!] = winnerLane ? (l === winnerLane ? 'win' : 'loss') : 'tie'
      }
      const { next } = applyDeltas(st.ratings, deltas, battle.category, winLoss)

      dispatch({ type: 'ratings/set', ratings: next })
      dispatch({
        type: 'battle/turnPatch',
        id: battle.id,
        turnId,
        patch: { votes: [{ kind, ...(winnerLane ? { lane: winnerLane } : {}), at: Date.now() }], eloDeltas: deltas },
      })
      if (st.settings.autoReveal && !battle.revealed) {
        dispatch({ type: 'battle/patch', id: battle.id, patch: { revealed: true } })
      }
    },
    [isStreaming, toast],
  )

  const reveal = useCallback((battleId?: string) => {
    const st = stateRef.current
    const id = battleId ?? st.activeId
    if (!id) return
    dispatch({ type: 'battle/patch', id, patch: { revealed: true } })
  }, [])

  const setCategory = useCallback((category: Category) => {
    const st = stateRef.current
    if (!st.activeId) return
    dispatch({ type: 'battle/patch', id: st.activeId, patch: { category } })
  }, [])

  const setLaneModel = useCallback((battleId: string, lane: string, modelId: string) => {
    const st = stateRef.current
    const battle = st.battles.find((b) => b.id === battleId)
    if (!battle) return
    const models = { ...battle.models, [lane]: modelId }
    // Keep the battle honest: swapping a model invalidates earlier votes.
    dispatch({ type: 'battle/patch', id: battleId, patch: { models, revealed: true } })
  }, [])

  const rerollModels = useCallback((battleId: string) => {
    const st = stateRef.current
    const battle = st.battles.find((b) => b.id === battleId)
    if (!battle) return
    const fresh = emptyBattle(battle.laneOrder.length, battle.category)
    dispatch({
      type: 'battle/patch',
      id: battleId,
      patch: { models: fresh.models, revealed: false, turns: [] },
    })
  }, [])

  const openBattle = useCallback((id: string) => {
    dispatch({ type: 'active', id })
    dispatch({ type: 'route', route: 'battle' })
  }, [])

  const deleteBattle = useCallback(
    (id: string) => {
      const battle = stateRef.current.battles.find((b) => b.id === id)
      for (const t of battle?.turns ?? []) {
        for (const l of t.lanes) laneStore.delete(laneKey(t.id, l.lane))
      }
      dispatch({ type: 'battle/delete', id })
      toast({ kind: 'info', title: 'Battle deleted' })
    },
    [toast],
  )

  const clearHistory = useCallback(() => {
    laneStore.clear()
    dispatch({ type: 'battle/clear' })
    toast({ kind: 'info', title: 'History cleared' })
  }, [toast])

  const resetRatings = useCallback(() => {
    dispatch({ type: 'ratings/set', ratings: defaultRatings() })
    toast({ kind: 'success', title: 'Ratings reset', body: 'Back to the seeded leaderboard.' })
  }, [toast])

  const actions = useMemo<Actions>(
    () => ({
      setRoute: (route) => dispatch({ type: 'route', route }),
      patchSettings: (patch) => dispatch({ type: 'settings', patch }),
      setModelRoute: (modelId, route) => dispatch({ type: 'settings/route', modelId, route }),
      toggleSidebar: () => dispatch({ type: 'sidebar/toggle' }),
      setPalette: (open) => dispatch({ type: 'palette', open }),
      toast,
      dismissToast,
      newBattle,
      send,
      stop,
      regenerate,
      vote,
      reveal,
      setCategory,
      setLaneModel,
      rerollModels,
      openBattle,
      deleteBattle,
      clearHistory,
      resetRatings,
      isStreaming,
    }),
    [
      toast,
      dismissToast,
      newBattle,
      send,
      stop,
      regenerate,
      vote,
      reveal,
      setCategory,
      setLaneModel,
      rerollModels,
      openBattle,
      deleteBattle,
      clearHistory,
      resetRatings,
      isStreaming,
    ],
  )

  const activeBattle = useMemo(
    () => state.battles.find((b) => b.id === state.activeId) ?? null,
    [state.battles, state.activeId],
  )

  const value = useMemo<Ctx>(() => ({ state, actions, activeBattle }), [state, actions, activeBattle])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

/** Convenience selectors used across views. */
export function useSettings(): Settings {
  return useApp().state.settings
}

export function useRatings(): Record<string, Rating> {
  return useApp().state.ratings
}

export function modelCount(): number {
  return MODELS.length
}

export type { LiveLane }
