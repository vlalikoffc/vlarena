/**
 * Seed data: defaults + a small "already played" history so the app never
 * opens on an empty screen. Everything here is clearly marked simulated.
 */

import type { Battle, Category, Rating, Settings, Turn } from './types'
import { MODELS, getModel, pickLanes, SUGGESTIONS } from './models'
import { BASE_ELO, computeDeltas, applyDeltas, emptyRating } from './elo'
import { composeAnswer, classify } from './simulator'
import { LANE_KEYS, estimateTokens, hashString, mulberry32, titleFromPrompt, uid } from './utils'
import { DEFAULT_BASE_URL } from './providers'

export const STATE_VERSION = 1

export function defaultSettings(): Settings {
  return {
    theme: 'dark',
    mode: 'simulated',
    providers: {
      mock: { enabled: true, apiKey: '', baseUrl: '' },
      openai: { enabled: false, apiKey: '', baseUrl: DEFAULT_BASE_URL.openai },
      anthropic: { enabled: false, apiKey: '', baseUrl: DEFAULT_BASE_URL.anthropic },
      openrouter: { enabled: false, apiKey: '', baseUrl: DEFAULT_BASE_URL.openrouter },
      custom: { enabled: false, apiKey: '', baseUrl: DEFAULT_BASE_URL.custom },
    },
    routes: {},
    lanes: 2,
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt:
      'You are competing in a blind head-to-head battle. Another model answers the same prompt. Be concrete, be correct, and show your reasoning where it matters.',
    autoReveal: true,
    reduceMotion: false,
    showMetrics: true,
  }
}

/** Seeded ratings with a plausible vote count and a trailing history curve. */
export function defaultRatings(): Record<string, Rating> {
  const out: Record<string, Rating> = {}
  for (const model of MODELS) {
    const rng = mulberry32(hashString(model.id))
    const votes = Math.round(900 + rng() * 7400)
    const r = emptyRating(model.id, model.seed)

    // Random walk back from the current rating so sparklines have shape.
    const history: number[] = []
    let cur = model.seed - (rng() * 46 - 12)
    for (let i = 0; i < 26; i++) {
      cur += (rng() - 0.46) * 11
      cur = cur * 0.82 + model.seed * 0.18
      history.push(Math.round(cur))
    }
    history.push(model.seed)
    r.history = history

    r.votes = votes
    r.wins = Math.round(votes * (0.34 + rng() * 0.26))
    r.ties = Math.round(votes * (0.06 + rng() * 0.12))
    r.losses = votes - r.wins - r.ties

    for (const [cat, entry] of Object.entries(r.byCategory)) {
      const strong = model.strengths.includes(cat as Category)
      entry.elo = Math.round(model.seed + (strong ? 14 + rng() * 12 : -(rng() * 18)))
      entry.votes = Math.round(votes * (0.35 + rng() * 0.4))
    }
    out[model.id] = r
  }
  return out
}

export interface SeedResult {
  battles: Battle[]
  ratings: Record<string, Rating>
}

/** Builds a handful of finished battles and folds their votes into ratings. */
export function seedHistory(ratingsIn: Record<string, Rating>): SeedResult {
  let ratings = { ...ratingsIn }
  const battles: Battle[] = []
  const now = Date.now()

  const picks = [
    { prompt: SUGGESTIONS[0]!.prompt, lanes: 2, ago: 1000 * 60 * 26, voted: 'best' as const },
    { prompt: SUGGESTIONS[5]!.prompt, lanes: 3, ago: 1000 * 60 * 60 * 5, voted: 'best' as const },
    { prompt: SUGGESTIONS[2]!.prompt, lanes: 2, ago: 1000 * 60 * 60 * 29, voted: 'tie' as const },
    { prompt: SUGGESTIONS[6]!.prompt, lanes: 4, ago: 1000 * 60 * 60 * 52, voted: null },
    { prompt: SUGGESTIONS[7]!.prompt, lanes: 2, ago: 1000 * 60 * 60 * 78, voted: 'best' as const },
  ]

  picks.forEach((p, index) => {
    const rng = mulberry32(hashString(p.prompt) + index)
    const chosen = pickLanes({ n: p.lanes, category: classify(p.prompt).category, rng })
    const laneKeys: string[] = LANE_KEYS.slice(0, p.lanes)
    const turnId = uid('turn')
    const models: Record<string, string> = {}
    laneKeys.forEach((k, i) => (models[k] = chosen[i]!.id))

    const lanes = laneKeys.map((lane, i) => {
      const model = chosen[i]!
      const text = composeAnswer(p.prompt, model, index)
      const ttft = Math.round(model.persona.latency * (0.8 + rng() * 0.6))
      const tokens = estimateTokens(text)
      const elapsed = ttft + (tokens / model.speed) * 1000 * (0.85 + rng() * 0.4)
      return {
        lane,
        modelId: model.id,
        status: 'done' as const,
        text,
        tokens,
        ttftMs: ttft,
        elapsedMs: Math.round(elapsed),
        tokPerSec: Math.round((tokens / ((elapsed - ttft) / 1000)) * 10) / 10,
      }
    })

    const category = classify(p.prompt).category
    const votes: Turn['votes'] = []
    let eloDeltas: Record<string, number> = {}

    if (p.voted) {
      const winnerLane = p.voted === 'tie' ? undefined : laneKeys[Math.floor(rng() * laneKeys.length)]
      votes.push({ kind: p.voted, ...(winnerLane ? { lane: winnerLane } : {}), at: now - p.ago + 45_000 })

      const placements = laneKeys.map((lane) => ({
        modelId: models[lane]!,
        placement: winnerLane ? (lane === winnerLane ? 0 : 1) : 0,
      }))
      eloDeltas = computeDeltas(ratings, placements, category)
      const winLoss: Record<string, 'win' | 'loss' | 'tie'> = {}
      for (const lane of laneKeys) {
        winLoss[models[lane]!] = winnerLane ? (lane === winnerLane ? 'win' : 'loss') : 'tie'
      }
      ratings = applyDeltas(ratings, eloDeltas, category, winLoss).next
    }

    const turn: Turn = { id: turnId, prompt: p.prompt, at: now - p.ago, lanes, votes, eloDeltas }
    battles.push({
      id: uid('btl'),
      createdAt: now - p.ago,
      updatedAt: now - p.ago + 60_000,
      category,
      models,
      laneOrder: laneKeys,
      turns: [turn],
      revealed: !!p.voted,
      simulated: true,
      title: titleFromPrompt(p.prompt),
    })
  })

  return { battles, ratings }
}

export function emptyBattle(laneCount: number, category: Battle['category'] = 'overall'): Battle {
  const keys: string[] = LANE_KEYS.slice(0, laneCount)
  const chosen = pickLanes({ n: laneCount })
  const models: Record<string, string> = {}
  keys.forEach((k, i) => (models[k] = chosen[i]?.id ?? MODELS[i % MODELS.length]!.id))
  return {
    id: uid('btl'),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    category,
    models,
    laneOrder: keys,
    turns: [],
    revealed: false,
    simulated: true,
    title: 'New battle',
  }
}

export { BASE_ELO, getModel }
