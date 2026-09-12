/**
 * Offline answer simulator.
 *
 * Produces varied, plausible answers per model "persona" and streams them with
 * realistic timing (time-to-first-token, decode speed, jitter) so the app is
 * fully usable with zero API keys. Swap to `live` mode in Settings to hit real
 * endpoints instead.
 */

import type { Category, ModelDef } from './types'
import { clamp, hashString, mulberry32 } from './utils'

export type Topic =
  | 'react'
  | 'python'
  | 'systems'
  | 'game'
  | 'design'
  | 'math'
  | 'writing'
  | 'analysis'
  | 'generic'

interface Keywords {
  has: (...words: string[]) => boolean
  subject: string
}

function keywords(prompt: string): Keywords {
  const p = prompt.toLowerCase()
  const words = p.split(/[^a-z0-9+#.]+/).filter((w) => w.length > 2)
  const stop = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'you', 'your', 'are', 'can',
    'how', 'what', 'why', 'would', 'should', 'about', 'into', 'then', 'there', 'their', 'them',
  ])
  const subject =
    words.filter((w) => !stop.has(w)).slice(0, 3).join(' ') || 'this'
  return {
    has: (...ws: string[]) => ws.some((w) => p.includes(w)),
    subject,
  }
}

export function classify(prompt: string): { category: Category; topic: Topic } {
  const k = keywords(prompt)

  if (k.has('python', 'pandas', 'numpy', 'dataframe', 'csv', 'jupyter', 'script', 'automate'))
    return { category: 'coding', topic: 'python' }
  if (k.has('rust', 'c++', 'go ', 'golang', 'kubernetes', 'docker', 'database', 'sql', 'postgres', 'api', 'backend', 'server', 'queue', 'cache'))
    return { category: 'coding', topic: 'systems' }
  if (k.has('react', 'component', 'tsx', 'jsx', 'vue', 'svelte', 'tailwind', 'css', 'html', 'frontend', 'landing page', 'dashboard', 'ui '))
    return { category: 'coding', topic: 'react' }
  if (k.has('game', 'canvas', 'sprite', 'physics', 'player', 'level', 'shader'))
    return { category: 'creative', topic: 'game' }
  if (k.has('prove', 'probability', 'equation', 'solve', 'math', 'integral', 'derivative', 'puzzle', 'how much', 'how many', 'sum of', 'prime'))
    return { category: 'math', topic: 'math' }
  if (k.has('poem', 'story', 'write', 'essay', 'copy', 'tagline', 'announce', 'email', 'tweet', 'post', 'script for'))
    return { category: 'creative', topic: 'writing' }
  if (k.has('design', 'mockup', 'figma', 'brand', 'logo', 'layout', 'typography', 'color', 'ux'))
    return { category: 'creative', topic: 'design' }
  if (k.has('compare', 'trade-off', 'tradeoff', 'analyze', 'review', 'plan', 'strategy', 'should we', 'architecture', 'refactor'))
    return { category: 'reasoning', topic: 'analysis' }
  if (k.has('code', 'function', 'bug', 'debug', 'implement', 'algorithm', 'class'))
    return { category: 'coding', topic: 'systems' }

  return { category: 'overall', topic: 'generic' }
}

/* ------------------------------------------------------------------ *
 * Phrase pools
 * ------------------------------------------------------------------ */

const OPENERS: Record<'cold' | 'neutral' | 'warm', string[]> = {
  cold: [
    'Direct answer first, details after.',
    'Here is the implementation.',
    'Short version, then the reasoning.',
    'Breaking this into the parts that matter.',
  ],
  neutral: [
    'Good task — there are two reasonable ways to do this, and one of them is clearly better for your case.',
    "Let's build this properly rather than the quick hack you'll rewrite next week.",
    'I’ll walk through the approach, then give you working code you can drop in.',
    'The interesting part here isn’t the code, it’s the structure around it.',
  ],
  warm: [
    'Love this one — let’s make it genuinely good. ✨',
    'Happy to dig in! Here’s how I’d approach it.',
    'Fun brief. Let’s build something you’d actually want to ship.',
    'Great question — and there’s a neat trick that makes this much simpler.',
  ],
}

const CLOSERS: Record<'cold' | 'neutral' | 'warm', string[]> = {
  cold: [
    'That covers the core. Ask if you want the edge cases handled.',
    'Done. The rest is polish.',
    'Ship it, measure, then optimise.',
  ],
  neutral: [
    'If you tell me the constraints (traffic, team size, deadline) I can narrow this to one recommendation.',
    'The next step would be a spike: build the smallest version end-to-end and see where it hurts.',
    'Happy to go deeper on any single piece — each of these is a rabbit hole worth one more pass.',
  ],
  warm: [
    'Want me to take any of these further? I can go deep on whichever part is most useful. 🙌',
    'That should get you most of the way — ping me if anything breaks, I’ll fix it with you.',
    'Good luck with the build! This is the kind of project that stays fun if you keep the scope tight.',
  ],
}

const ANALYSIS_POINTS = [
  'Separate the *state* from the *rendering*. Most of the complexity you described is really state management wearing a UI costume.',
  'Every extra abstraction costs a reader something. Add one only when it removes more confusion than it creates.',
  'The failure mode here is silent: it works in dev, degrades under load, and the logs say nothing. Instrument the boundary first.',
  'Optimise for the second version, not the first. You will rewrite ~30% of this once you see it running.',
  'Latency budgets beat micro-optimisations. Decide the number, then work backwards to what’s allowed to be slow.',
  'Caching is the cheapest win and the most common source of "why is this stale" bugs. Cache with an explicit invalidation rule or not at all.',
  'Type the boundary, not the middle. If the input and output shapes are enforced, the internals can stay simple.',
  'Concurrency here is a modelling problem: pick one owner for each piece of mutable state and everything else gets easier.',
]

const TRADEOFF_ROWS = [
  ['Simplicity', 'One file, no build step', 'Fast to ship, hard to test'],
  ['Structure', 'Components + hooks', 'More files, far easier to change'],
  ['Performance', 'Memoised selectors', 'Premature unless measured'],
  ['Portability', 'Standard APIs only', 'Slightly more code, no lock-in'],
]

/* ------------------------------------------------------------------ *
 * Code snippets
 * ------------------------------------------------------------------ */

function reactSnippet(subject: string, model: ModelDef): string {
  const name = titleCase(subject.split(' ').slice(-2).join(' ') || 'Arena')
  const comments = model.persona.codeBias > 0.8
  return `\`\`\`tsx
// ${name} — hero section
export function ${name}Hero({ tagline }: { tagline: string }) {
  return (
    <section className="relative isolate overflow-hidden bg-[#0a0b10] px-6 py-24">
      {/* ambient glow — cheap, sells the whole page */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[720px]
                   -translate-x-1/2 rounded-full bg-violet-600/25 blur-[120px]"
      />
      <div className="relative mx-auto max-w-3xl text-center">
        <span className="chip mb-5">v0.1 · public beta</span>
        <h1 className="text-5xl font-semibold tracking-tight text-white">
          {tagline}
        </h1>
        <p className="mt-4 text-lg text-slate-400">
          Run frontier models side by side, vote on the answer, watch Elo move.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <button className="btn btn-primary px-5 py-2.5">Get started</button>
          <button className="btn px-5 py-2.5">Read the docs</button>
        </div>
      </div>
    </section>
  )
}
${comments ? `\n// Keep hero copy in one place so marketing can edit without touching layout.\nexport const HERO_COPY = {\n  tagline: 'Experience the frontier',\n  cta: 'Start a battle',\n} as const\n` : ''}\`\`\``
}

function pythonSnippet(subject: string): string {
  return `\`\`\`python
"""${titleCase(subject)} — small, testable, no magic."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import csv


@dataclass(slots=True)
class Row:
    model: str
    elo: float
    votes: int

    @property
    def ci95(self) -> float:
        """95% confidence half-width, shrinks as 1/sqrt(n)."""
        return 1.96 * 220 / (self.votes + 1) ** 0.5


def load(path: Path) -> list[Row]:
    with path.open(newline="", encoding="utf-8") as fh:
        return [
            Row(r["model"], float(r["elo"]), int(r["votes"]))
            for r in csv.DictReader(fh)
        ]


def top(rows: list[Row], n: int = 5) -> list[Row]:
    return sorted(rows, key=lambda r: r.elo, reverse=True)[:n]


if __name__ == "__main__":
    for row in top(load(Path("ratings.csv"))):
        print(f"{row.model:<22} {row.elo:7.1f} ±{row.ci95:4.1f}  ({row.votes} votes)")
\`\`\``
}

function systemsSnippet(subject: string): string {
  return `\`\`\`ts
// ${titleCase(subject)}: single owner of state, explicit lifecycle.
type Status = 'idle' | 'running' | 'done' | 'error'

interface Job<T> {
  id: string
  status: Status
  result?: T
  error?: string
}

export class Runner<T> {
  private jobs = new Map<string, Job<T>>()
  private controller = new AbortController()

  async start(id: string, work: (signal: AbortSignal) => Promise<T>): Promise<Job<T>> {
    const job: Job<T> = { id, status: 'running' }
    this.jobs.set(id, job)
    try {
      job.result = await work(this.controller.signal)
      job.status = this.controller.signal.aborted ? 'error' : 'done'
    } catch (err) {
      job.status = 'error'
      job.error = err instanceof Error ? err.message : String(err)
    }
    return job
  }

  cancelAll(): void {
    this.controller.abort()
    this.controller = new AbortController()
  }

  snapshot(): Job<T>[] {
    return [...this.jobs.values()]
  }
}
\`\`\``
}

function gameSnippet(): string {
  return `\`\`\`html
<canvas id="c" width="800" height="600"></canvas>
<script>
const cv = document.getElementById('c'), ctx = cv.getContext('2d')
const keys = new Set()
addEventListener('keydown', e => keys.add(e.key))
addEventListener('keyup',   e => keys.delete(e.key))

const player = { x: 400, y: 500, r: 12, speed: 260 }
const shots = [], enemies = []
let last = performance.now(), spawn = 0

function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000)   // clamp: never tunnel
  last = now

  // --- input ---
  if (keys.has('ArrowLeft'))  player.x -= player.speed * dt
  if (keys.has('ArrowRight')) player.x += player.speed * dt
  player.x = Math.max(player.r, Math.min(cv.width - player.r, player.x))
  if (keys.has(' ') && shots.length < 8) shots.push({ x: player.x, y: player.y - 18, v: -520 })

  // --- update ---
  spawn += dt
  if (spawn > 0.7) { spawn = 0; enemies.push({ x: Math.random() * cv.width, y: -20, v: 90 + Math.random() * 80 }) }
  for (const s of shots) s.y += s.v * dt
  for (const e of enemies) e.y += e.v * dt

  // --- draw ---
  ctx.fillStyle = '#07080b'; ctx.fillRect(0, 0, cv.width, cv.height)
  ctx.fillStyle = '#22d3ee'; ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, 7); ctx.fill()
  ctx.fillStyle = '#7c5cff'
  for (const s of shots) ctx.fillRect(s.x - 2, s.y - 8, 4, 12)
  ctx.fillStyle = '#fb7185'
  for (const e of enemies) ctx.fillRect(e.x - 10, e.y - 10, 20, 20)

  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
<\/script>
\`\`\``
}

function mathSnippet(): string {
  return `\`\`\`python
# sanity check
from sympy import symbols, Eq, solve, Rational

ball = symbols('ball', positive=True)
sol = solve(Eq(ball + (ball + 1), Rational('1.10')), ball)
print(sol)          # [0.05]
print(float(sol[0]))  # 0.05
\`\`\``
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ')
    .slice(0, 40)
}

/* ------------------------------------------------------------------ *
 * Answer composition
 * ------------------------------------------------------------------ */

type Tone = 'cold' | 'neutral' | 'warm'

function toneOf(model: ModelDef): Tone {
  return model.persona.warmth > 0.6 ? 'warm' : model.persona.warmth < 0.35 ? 'cold' : 'neutral'
}

const pick = <T,>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)]!

const pickMany = <T,>(rng: () => number, arr: T[], n: number): T[] => {
  const copy = [...arr]
  const out: T[] = []
  while (out.length < n && copy.length) {
    out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]!)
  }
  return out
}

export function composeAnswer(prompt: string, model: ModelDef, seedSalt = 0): string {
  const rng = mulberry32(hashString(`${model.id}|${prompt}|${seedSalt}`))
  const { topic } = classify(prompt)
  const k = keywords(prompt)
  const p = model.persona
  const tone = toneOf(model)

  const parts: string[] = []
  parts.push(pick(rng, OPENERS[tone]))
  parts.push('')

  // How many structural sections this persona produces.
  const sections = clamp(Math.round(1.4 + p.structure * 2.4 + p.verbosity * 1.2), 2, 5)
  const nPoints = clamp(Math.round(2 + p.verbosity * 4 + p.quality * 2), 2, 6)

  if (topic === 'math') {
    parts.push('## Restating the problem')
    parts.push('')
    parts.push(
      `Let the unknown be \`x\`. The prompt gives us two constraints on \`${k.subject}\`, and the trick is not to solve it by intuition — intuition says one thing, algebra says another.`,
    )
    parts.push('')
    parts.push('## Step by step')
    parts.push('')
    parts.push('1. Define the variable explicitly and write down what "more than" means.')
    parts.push('2. Translate the sentence into an equation — no mental arithmetic yet.')
    parts.push('3. Solve, then substitute back to verify the original wording.')
    parts.push('')
    parts.push(
      'Let the ball cost `x`. Then the bat costs `x + 1.00`, and together they cost `x + (x + 1.00) = 1.10`. So `2x = 0.10`, giving **x = $0.05** and a bat at **$1.05**.',
    )
    parts.push('')
    parts.push(
      '> The intuitive answer ($0.10) fails the check: $1.10 + $0.10 = $1.20 ≠ $1.10. Substituting back is what catches it.',
    )
    if (p.codeBias > 0.55) {
      parts.push('')
      parts.push(mathSnippet())
    }
  } else if (topic === 'writing') {
    parts.push(`## Variant A — ${p.warmth > 0.5 ? 'playful' : 'tight'}`)
    parts.push('')
    parts.push(
      `> We built the thing we kept wishing existed. ${titleCase(k.subject)} is out today — no waitlist, no config file, no "coming soon".`,
    )
    parts.push('')
    parts.push('## Variant B — deadpan')
    parts.push('')
    parts.push(
      `> It runs. It is small. It does ${k.subject} without asking you to read a manual first.`,
    )
    parts.push('')
    parts.push('## Why these work')
    parts.push('')
    for (const pt of pickMany(rng, [
      'Specific nouns beat adjectives. "12 MB installer" reads as true; "lightning-fast" reads as marketing.',
      'One idea per sentence. Announcements get skimmed, so the first line has to carry the whole thing.',
      'Cut the throat-clearing. No "We\'re excited to announce" — start with the subject.',
      'End with a verb. The last word should tell the reader what to do next.',
    ], nPoints)) {
      parts.push(`- ${pt}`)
    }
  } else if (topic === 'design') {
    parts.push('## Direction')
    parts.push('')
    parts.push(
      `For **${titleCase(k.subject)}** I’d go dark-first with one accent family, a 4px spacing scale, and type doing most of the work. The glow/gradient treatment should read as ambience, never as decoration competing with content.`,
    )
    parts.push('')
    parts.push('## System')
    parts.push('')
    parts.push('| Token | Value | Used for |')
    parts.push('| --- | --- | --- |')
    parts.push('| `--bg` | `#0a0b10` | app canvas |')
    parts.push('| `--panel` | `#10131a` | cards, panes |')
    parts.push('| `--brand` | `#7c5cff` | primary actions |')
    parts.push('| `--brand-2` | `#22d3ee` | live/streaming state |')
    parts.push('| radius | `8 / 14 / 20` | control / card / modal |')
    parts.push('')
    for (const pt of pickMany(rng, ANALYSIS_POINTS, Math.max(2, nPoints - 2))) {
      parts.push(`- ${pt}`)
    }
  } else {
    // coding / analysis / generic — the common shape
    parts.push(p.structure > 0.6 ? '## Approach' : '**Approach.**')
    parts.push('')
    const steps = pickMany(rng, [
      `Pin down the shape of the data first — everything downstream is a consequence of that choice.`,
      `Start with the smallest end-to-end slice that proves the wiring, then widen it.`,
      `Make the failure states explicit. Idle / running / error is three UIs, not one.`,
      `Keep the streaming path cancellable from the very first commit — retrofitting abort is miserable.`,
      `Decide what is derived state and delete it. Anything recomputable from a source of truth should not be stored.`,
      `Put the network at the edge of the app, behind one interface, so the UI never learns about providers.`,
    ], clamp(Math.round(2 + p.structure * 3), 2, 4))
    steps.forEach((s, i) => parts.push(`${i + 1}. ${s}`))

    if (p.codeBias > 0.45) {
      parts.push('')
      parts.push(p.structure > 0.6 ? '## Implementation' : '**Code.**')
      parts.push('')
      if (topic === 'react') parts.push(reactSnippet(k.subject, model))
      else if (topic === 'python') parts.push(pythonSnippet(k.subject))
      else if (topic === 'game') parts.push(gameSnippet())
      else parts.push(systemsSnippet(k.subject))
    }

    if (sections >= 3) {
      parts.push('')
      parts.push(p.structure > 0.6 ? '## Trade-offs' : '**Trade-offs.**')
      parts.push('')
      if (p.structure > 0.78 && rng() > 0.35) {
        parts.push('| Axis | Option | Cost |')
        parts.push('| --- | --- | --- |')
        for (const [a, b, c] of TRADEOFF_ROWS.slice(0, 3)) parts.push(`| ${a} | ${b} | ${c} |`)
      } else {
        for (const pt of pickMany(rng, ANALYSIS_POINTS, nPoints)) parts.push(`- ${pt}`)
      }
    }

    if (sections >= 5 && p.verbosity > 0.6) {
      parts.push('')
      parts.push('## What I’d skip for now')
      parts.push('')
      for (const pt of pickMany(rng, [
        'Auth, multi-tenant anything, and a plugin system — all premature until one user has used it twice.',
        'Micro-benchmarking. Measure once it feels slow, not before.',
        'A custom design system. Use the tokens you already have and resist component #47.',
        'Server-side rendering, unless the content needs to be indexed.',
      ], 2)) {
        parts.push(`- ${pt}`)
      }
    }
  }

  parts.push('')
  parts.push(pick(rng, CLOSERS[tone]))

  let text = parts.join('\n').trim()

  // Persona-based length trimming: terse models drop the last structural block.
  if (p.verbosity < 0.42) {
    const cut = text.lastIndexOf('\n## ')
    if (cut > text.length * 0.45) text = text.slice(0, cut).trim()
  }

  return text
}

/* ------------------------------------------------------------------ *
 * Streaming
 * ------------------------------------------------------------------ */

export interface StreamOptions {
  text: string
  model: ModelDef
  signal?: AbortSignal
  salt?: number
  /** Called once before the first chunk, with the simulated TTFT in ms. */
  onFirstToken?: (ttftMs: number) => void
  onChunk: (chunk: string) => void
}

/** Splits text into token-ish pieces (word + trailing whitespace). */
function tokenize(text: string): string[] {
  return text.match(/\S+\s*|\s+/g) ?? [text]
}

export async function streamSimulated(opts: StreamOptions): Promise<void> {
  const { text, model, signal, onChunk, onFirstToken } = opts
  const rng = mulberry32(hashString(`${model.id}|${text.length}|${opts.salt ?? 0}`))
  const p = model.persona

  const ttft = clamp(p.latency * (0.7 + rng() * 0.7), 90, 4000)
  await wait(ttft, signal)
  if (signal?.aborted) return
  onFirstToken?.(ttft)

  const tokens = tokenize(text)
  const perSecond = clamp(model.speed * (0.75 + rng() * 0.5), 12, 400)
  const baseDelay = 1000 / perSecond

  let i = 0
  while (i < tokens.length) {
    if (signal?.aborted) return
    // Emit 1–4 tokens per tick; longer runs for fast models.
    const burst = 1 + Math.floor(rng() * (2 + p.jitter * 4))
    let out = ''
    let emitted = 0
    while (emitted < burst && i < tokens.length) {
      out += tokens[i++]
      emitted++
    }
    onChunk(out)

    let delay = baseDelay * emitted * (1 + (rng() - 0.5) * p.jitter * 2)
    // Occasional "thinking" pause at a paragraph boundary.
    if (out.includes('\n\n') && rng() > 0.7) delay += 120 + rng() * 260
    await wait(clamp(delay, 4, 220), signal)
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
