/**
 * Domain types for vlarena.
 *
 * A "battle" is a conversation run against N models in parallel ("lanes").
 * Each user prompt opens a new `Turn`; every lane answers that turn and the
 * user votes on the round. Elo deltas are computed per turn.
 */

export type Category = 'overall' | 'coding' | 'creative' | 'reasoning' | 'math'

export const CATEGORIES: Category[] = ['overall', 'coding', 'creative', 'reasoning', 'math']

export type ProviderId = 'mock' | 'openai' | 'anthropic' | 'openrouter' | 'custom'

/** Behavioural fingerprint used by the built-in simulator. */
export interface Persona {
  /** 0..1 — how long the answers tend to be */
  verbosity: number
  /** 0..1 — headings, lists, tables */
  structure: number
  /** 0..1 — likelihood of including code blocks */
  codeBias: number
  /** 0..1 — casual tone, emoji, encouragement */
  warmth: number
  /** baseline time-to-first-token in ms */
  latency: number
  /** 0..1 — answer richness used by the simulator */
  quality: number
  /** 0..1 — variance in streaming speed */
  jitter: number
}

export interface ModelDef {
  id: string
  name: string
  org: string
  family: string
  released: string
  /** context window in tokens */
  context: number
  /** USD per million input tokens */
  priceIn: number
  /** USD per million output tokens */
  priceOut: number
  /** nominal decode speed, tokens/second */
  speed: number
  strengths: Category[]
  /** seeded Elo used before the user casts any real votes */
  seed: number
  /** provider adapter that can actually serve this model */
  provider: ProviderId
  persona: Persona
}

export interface Rating {
  modelId: string
  elo: number
  votes: number
  wins: number
  losses: number
  ties: number
  byCategory: Record<Category, { elo: number; votes: number }>
  /** trailing Elo samples, oldest → newest (sparkline) */
  history: number[]
}

export type LaneStatus = 'idle' | 'queued' | 'streaming' | 'done' | 'error' | 'aborted'

export interface LaneSnapshot {
  /** stable lane key ("a" | "b" | "c" | "d") */
  lane: string
  modelId: string
  status: LaneStatus
  text: string
  tokens: number
  ttftMs: number | null
  elapsedMs: number
  tokPerSec: number
  error?: string
}

export type VoteKind = 'best' | 'tie' | 'both-bad'

export interface Vote {
  kind: VoteKind
  lane?: string
  at: number
}

export interface Turn {
  id: string
  prompt: string
  at: number
  lanes: LaneSnapshot[]
  votes: Vote[]
  /** modelId → Elo change produced by this turn's votes */
  eloDeltas: Record<string, number>
}

export interface Battle {
  id: string
  createdAt: number
  updatedAt: number
  category: Category
  /** lane key → modelId, in lane order */
  models: Record<string, string>
  laneOrder: string[]
  turns: Turn[]
  /** models stay anonymous ("Model A/B/C") until revealed */
  revealed: boolean
  /** true when the answers came from the offline simulator */
  simulated: boolean
  title: string
}

export interface ProviderConfig {
  enabled: boolean
  apiKey: string
  baseUrl: string
}

/** Per-model override: which provider serves it and under what wire id. */
export interface ModelRoute {
  provider: ProviderId
  wireId: string
  enabled: boolean
}

export interface Settings {
  theme: 'dark' | 'light' | 'system'
  /** 'simulated' never touches the network; 'live' calls real providers */
  mode: 'simulated' | 'live'
  providers: Record<ProviderId, ProviderConfig>
  routes: Record<string, ModelRoute>
  lanes: number
  temperature: number
  maxTokens: number
  systemPrompt: string
  autoReveal: boolean
  reduceMotion: boolean
  showMetrics: boolean
}

export interface AppState {
  settings: Settings
  ratings: Record<string, Rating>
  battles: Battle[]
  /** id of the battle currently open, or null for a fresh one */
  activeBattleId: string | null
  version: number
}

export type Route = 'battle' | 'leaderboard' | 'history' | 'settings' | 'about'
