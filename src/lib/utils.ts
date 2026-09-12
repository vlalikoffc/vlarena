/** Small helpers shared across the app. */

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export function uid(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14)
  return prefix ? `${prefix}_${rnd}` : rnd
}

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Deterministic PRNG so simulated runs are reproducible per seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Naive token estimate (~4 chars/token for English, closer to ~3 for code). */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.round(text.length / 3.7))
}

export function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return `${Math.round(n)}`
}

export function formatDelta(n: number): string {
  const r = Math.round(n)
  if (r === 0) return '±0'
  return r > 0 ? `+${r}` : `${r}`
}

export function formatMs(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return '—'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export function formatTokensPerSec(v: number): string {
  if (!isFinite(v) || v <= 0) return '—'
  return `${v.toFixed(v < 10 ? 1 : 0)} tok/s`
}

export function formatRelative(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatClock(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Derive a stable display title from a prompt. */
export function titleFromPrompt(prompt: string): string {
  const clean = prompt.replace(/\s+/g, ' ').trim()
  if (!clean) return 'Untitled battle'
  return clean.length > 64 ? `${clean.slice(0, 64).trimEnd()}…` : clean
}

export const LANE_KEYS = ['a', 'b', 'c', 'd'] as const
export type LaneKey = (typeof LANE_KEYS)[number]

export const LANE_LABELS: Record<LaneKey, string> = {
  a: 'Model A',
  b: 'Model B',
  c: 'Model C',
  d: 'Model D',
}

export const LANE_ACCENTS: Record<LaneKey, string> = {
  a: 'var(--accent-a)',
  b: 'var(--accent-b)',
  c: 'var(--accent-c)',
  d: 'var(--accent-d)',
}

export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent)
}

export const MOD = isMac() ? '⌘' : 'Ctrl'

export function highlightQuery(text: string, query: string): Array<[string, boolean]> {
  if (!query.trim()) return [[text, false]]
  const out: Array<[string, boolean]> = []
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  let i = 0
  while (i < text.length) {
    const hit = lower.indexOf(q, i)
    if (hit === -1) {
      out.push([text.slice(i), false])
      break
    }
    if (hit > i) out.push([text.slice(i, hit), false])
    out.push([text.slice(hit, hit + q.length), true])
    i = hit + q.length
  }
  return out
}
