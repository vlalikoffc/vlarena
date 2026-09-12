/**
 * Elo / Bradley-Terry rating math.
 *
 * Multi-lane battles are reduced to pairwise results: for every ordered pair
 * (i, j) we score 1 / 0.5 / 0 depending on placement, then apply the standard
 * Elo update against the expected score. This is the same shape LMSYS uses for
 * multi-model battles and keeps deltas bounded regardless of lane count.
 */

import type { Category, Rating } from './types'
import { clamp } from './utils'

export const BASE_ELO = 1200
export const K_FACTOR = 24
/** Per-battle rating noise, used for the confidence band. */
const RATING_SD = 220
const HISTORY_LEN = 40

export function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400))
}

/** 95% confidence half-width; shrinks as ~1/√n and never collapses to 0. */
export function confidenceInterval(votes: number): number {
  return clamp((1.96 * RATING_SD) / Math.sqrt(votes + 1), 1.5, 60)
}

export interface Placement {
  modelId: string
  /** 0 = best. Equal placements express a tie. */
  placement: number
}

export function computeDeltas(
  ratings: Record<string, Rating>,
  placements: Placement[],
  category: Category,
  k: number = K_FACTOR,
): Record<string, number> {
  const n = placements.length
  if (n < 2) return {}

  const eloOf = (id: string): number => {
    const r = ratings[id]
    if (!r) return BASE_ELO
    return category === 'overall' ? r.elo : (r.byCategory[category]?.elo ?? r.elo)
  }

  const deltas: Record<string, number> = {}
  for (const p of placements) {
    let sum = 0
    for (const q of placements) {
      if (p.modelId === q.modelId) continue
      const score = p.placement < q.placement ? 1 : p.placement > q.placement ? 0 : 0.5
      sum += score - expectedScore(eloOf(p.modelId), eloOf(q.modelId))
    }
    deltas[p.modelId] = (k / (n - 1)) * sum
  }
  return deltas
}

export function emptyRating(modelId: string, seed: number): Rating {
  const byCategory = {} as Rating['byCategory']
  for (const c of ['overall', 'coding', 'creative', 'reasoning', 'math'] as Category[]) {
    byCategory[c] = { elo: seed, votes: 0 }
  }
  return {
    modelId,
    elo: seed,
    votes: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    byCategory,
    history: [seed],
  }
}

export interface ApplyResult {
  modelId: string
  before: number
  after: number
  delta: number
}

/** Applies deltas to overall + per-category ratings, returns what changed. */
export function applyDeltas(
  ratings: Record<string, Rating>,
  deltas: Record<string, number>,
  category: Category,
  winLoss: Record<string, 'win' | 'loss' | 'tie'>,
): { next: Record<string, Rating>; results: ApplyResult[] } {
  const next: Record<string, Rating> = { ...ratings }
  const results: ApplyResult[] = []

  for (const [modelId, raw] of Object.entries(deltas)) {
    const prev = next[modelId] ?? emptyRating(modelId, BASE_ELO)
    const before = prev.elo
    // Round to 1 decimal internally so repeated tiny updates still accumulate.
    const delta = Math.round(raw * 10) / 10
    const elo = before + delta
    const cat = prev.byCategory[category] ?? { elo: before, votes: 0 }
    const outcome = winLoss[modelId] ?? 'tie'

    const rating: Rating = {
      ...prev,
      elo: Math.round(elo * 10) / 10,
      votes: prev.votes + 1,
      wins: prev.wins + (outcome === 'win' ? 1 : 0),
      losses: prev.losses + (outcome === 'loss' ? 1 : 0),
      ties: prev.ties + (outcome === 'tie' ? 1 : 0),
      byCategory: {
        ...prev.byCategory,
        [category]: { elo: Math.round((cat.elo + delta) * 10) / 10, votes: cat.votes + 1 },
      },
      history: [...prev.history, Math.round(elo)].slice(-HISTORY_LEN),
    }
    next[modelId] = rating
    results.push({ modelId, before, after: rating.elo, delta })
  }

  return { next, results }
}

export interface LeaderboardRow {
  modelId: string
  rating: Rating
  elo: number
  ci: number
  rank: number
  winRate: number
}

export function rankModels(
  ratings: Record<string, Rating>,
  category: Category = 'overall',
  minVotes = 0,
): LeaderboardRow[] {
  const rows = Object.values(ratings)
    .filter((r) => (category === 'overall' ? r.votes : (r.byCategory[category]?.votes ?? 0)) >= minVotes)
    .map((rating) => {
      const cat = category === 'overall' ? null : rating.byCategory[category]
      const elo = cat ? cat.elo : rating.elo
      const votes = cat ? cat.votes : rating.votes
      return {
        modelId: rating.modelId,
        rating,
        elo: Math.round(elo),
        ci: confidenceInterval(votes),
        rank: 0,
        winRate: rating.votes ? rating.wins / rating.votes : 0,
      }
    })

  rows.sort((a, b) => b.elo - a.elo)
  rows.forEach((r, i) => (r.rank = i + 1))
  return rows
}

/** Win probability of `a` over `b`, exposed for the "matchup" widget. */
export function winProbability(a: number, b: number): number {
  return expectedScore(a, b)
}
