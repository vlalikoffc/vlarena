/**
 * Model catalog.
 *
 * The names below are a *sample* catalog used to seed the offline simulator —
 * Elo seeds, prices and speeds are illustrative placeholders, not measured
 * benchmarks. Edit this file freely, or override the routing per model in
 * Settings → Routing to point any row at a real endpoint you own a key for.
 */

import type { Category, ModelDef, ProviderId } from './types'

type ModelSeed = Omit<ModelDef, 'id'> & { id?: string }

function m(
  id: string,
  name: string,
  org: string,
  family: string,
  released: string,
  context: number,
  priceIn: number,
  priceOut: number,
  speed: number,
  seed: number,
  strengths: Category[],
  provider: ProviderId,
  persona: ModelSeed['persona'],
): ModelDef {
  return { id, name, org, family, released, context, priceIn, priceOut, speed, seed, strengths, provider, persona }
}

export const MODELS: ModelDef[] = [
  m('gpt-5.2', 'GPT-5.2', 'OpenAI', 'GPT-5', '2026-08', 400_000, 1.25, 10, 82, 1364, ['reasoning', 'coding', 'overall'], 'openai', {
    verbosity: 0.62, structure: 0.8, codeBias: 0.85, warmth: 0.3, latency: 620, quality: 0.95, jitter: 0.25,
  }),
  m('gpt-5.2-mini', 'GPT-5.2 mini', 'OpenAI', 'GPT-5', '2026-08', 400_000, 0.15, 0.9, 168, 1281, ['coding', 'reasoning'], 'openai', {
    verbosity: 0.4, structure: 0.7, codeBias: 0.8, warmth: 0.35, latency: 320, quality: 0.78, jitter: 0.2,
  }),
  m('o5-reasoning', 'o5 Reasoning', 'OpenAI', 'o-series', '2026-06', 200_000, 3, 15, 44, 1352, ['math', 'reasoning'], 'openai', {
    verbosity: 0.75, structure: 0.9, codeBias: 0.6, warmth: 0.1, latency: 1500, quality: 0.96, jitter: 0.4,
  }),
  m('claude-opus-4.6', 'Claude Opus 4.6', 'Anthropic', 'Claude 4', '2026-07', 500_000, 5, 25, 68, 1372, ['creative', 'coding', 'reasoning', 'overall'], 'anthropic', {
    verbosity: 0.78, structure: 0.85, codeBias: 0.8, warmth: 0.55, latency: 700, quality: 0.97, jitter: 0.2,
  }),
  m('claude-sonnet-4.6', 'Claude Sonnet 4.6', 'Anthropic', 'Claude 4', '2026-05', 500_000, 1.5, 7.5, 122, 1331, ['coding', 'creative'], 'anthropic', {
    verbosity: 0.55, structure: 0.78, codeBias: 0.82, warmth: 0.5, latency: 420, quality: 0.88, jitter: 0.22,
  }),
  m('claude-haiku-4.5', 'Claude Haiku 4.5', 'Anthropic', 'Claude 4', '2026-02', 200_000, 0.4, 2, 190, 1244, ['creative', 'overall'], 'anthropic', {
    verbosity: 0.32, structure: 0.55, codeBias: 0.5, warmth: 0.65, latency: 240, quality: 0.72, jitter: 0.18,
  }),
  m('gemini-3-pro', 'Gemini 3 Pro', 'Google DeepMind', 'Gemini 3', '2026-06', 2_000_000, 1.1, 8, 96, 1349, ['reasoning', 'math', 'overall'], 'openai', {
    verbosity: 0.85, structure: 0.72, codeBias: 0.68, warmth: 0.4, latency: 780, quality: 0.93, jitter: 0.3,
  }),
  m('gemini-3-flash', 'Gemini 3 Flash', 'Google DeepMind', 'Gemini 3', '2026-06', 1_000_000, 0.1, 0.6, 210, 1276, ['overall', 'creative'], 'openai', {
    verbosity: 0.45, structure: 0.6, codeBias: 0.5, warmth: 0.6, latency: 260, quality: 0.75, jitter: 0.25,
  }),
  m('grok-4.1', 'Grok 4.1', 'xAI', 'Grok 4', '2026-07', 256_000, 1.5, 9, 110, 1318, ['reasoning', 'creative'], 'openai', {
    verbosity: 0.6, structure: 0.5, codeBias: 0.6, warmth: 0.85, latency: 520, quality: 0.86, jitter: 0.35,
  }),
  m('deepseek-v3.2', 'DeepSeek V3.2', 'DeepSeek', 'V3', '2026-04', 128_000, 0.14, 0.28, 74, 1305, ['coding', 'math'], 'openai', {
    verbosity: 0.7, structure: 0.75, codeBias: 0.9, warmth: 0.2, latency: 640, quality: 0.87, jitter: 0.28,
  }),
  m('qwen3-max', 'Qwen3 Max', 'Alibaba', 'Qwen3', '2026-03', 262_144, 0.4, 1.6, 88, 1298, ['coding', 'math', 'overall'], 'openai', {
    verbosity: 0.66, structure: 0.82, codeBias: 0.85, warmth: 0.3, latency: 560, quality: 0.85, jitter: 0.24,
  }),
  m('kimi-k2.5', 'Kimi K2.5', 'Moonshot AI', 'K2', '2026-05', 256_000, 0.6, 2.2, 92, 1289, ['reasoning', 'coding'], 'openai', {
    verbosity: 0.72, structure: 0.68, codeBias: 0.78, warmth: 0.35, latency: 600, quality: 0.84, jitter: 0.3,
  }),
  m('llama-4.1-405b', 'Llama 4.1 405B', 'Meta', 'Llama 4', '2026-01', 128_000, 0.8, 1.4, 58, 1258, ['creative', 'overall'], 'openai', {
    verbosity: 0.58, structure: 0.45, codeBias: 0.55, warmth: 0.6, latency: 700, quality: 0.76, jitter: 0.35,
  }),
  m('mistral-large-3', 'Mistral Large 3', 'Mistral AI', 'Large 3', '2026-02', 128_000, 0.9, 2.7, 104, 1266, ['creative', 'reasoning'], 'openai', {
    verbosity: 0.5, structure: 0.62, codeBias: 0.6, warmth: 0.45, latency: 480, quality: 0.79, jitter: 0.26,
  }),
  m('glm-5', 'GLM-5', 'Zhipu AI', 'GLM', '2026-04', 200_000, 0.35, 1.2, 96, 1240, ['coding', 'overall'], 'openai', {
    verbosity: 0.52, structure: 0.7, codeBias: 0.8, warmth: 0.3, latency: 520, quality: 0.73, jitter: 0.3,
  }),
  m('phi-5-mini', 'Phi-5 mini', 'Microsoft', 'Phi', '2026-03', 128_000, 0.05, 0.2, 240, 1187, ['math', 'overall'], 'openai', {
    verbosity: 0.28, structure: 0.5, codeBias: 0.6, warmth: 0.4, latency: 180, quality: 0.6, jitter: 0.2,
  }),
]

export const MODEL_BY_ID: Record<string, ModelDef> = Object.fromEntries(
  MODELS.map((x) => [x.id, x]),
)

export function getModel(id: string): ModelDef {
  return (
    MODEL_BY_ID[id] ??
    m(id, id, 'Custom', 'custom', '—', 128_000, 0, 0, 60, 1200, ['overall'], 'custom', {
      verbosity: 0.5,
      structure: 0.5,
      codeBias: 0.5,
      warmth: 0.4,
      latency: 500,
      quality: 0.7,
      jitter: 0.3,
    })
  )
}

export const ORGS = Array.from(new Set(MODELS.map((x) => x.org))).sort()

/** Deterministic org → hue, used for the little logo tiles. */
export function orgHue(org: string): number {
  let h = 0
  for (let i = 0; i < org.length; i++) h = (h * 31 + org.charCodeAt(i)) % 360
  return h
}

export function orgInitials(org: string): string {
  return org
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

export interface PickOptions {
  n: number
  category?: Category
  exclude?: string[]
  rng?: () => number
}

/**
 * Chooses n distinct models, biased toward the requested category and toward
 * a spread of orgs so a battle rarely shows three siblings.
 */
export function pickLanes({ n, category = 'overall', exclude = [], rng = Math.random }: PickOptions): ModelDef[] {
  const pool = MODELS.filter((x) => !exclude.includes(x.id))
  const scored = pool.map((x) => {
    let s = rng() * 1.4
    if (category !== 'overall' && x.strengths.includes(category)) s += 1.1
    s += (x.seed - 1150) / 400
    return { x, s }
  }).sort((a, b) => b.s - a.s)

  const chosen: ModelDef[] = []
  const usedOrgs = new Set<string>()
  for (const { x } of scored) {
    if (chosen.length >= n) break
    if (usedOrgs.has(x.org) && chosen.length < n - 1) continue
    chosen.push(x)
    usedOrgs.add(x.org)
  }
  // Fill up if the org filter was too strict.
  for (const { x } of scored) {
    if (chosen.length >= n) break
    if (!chosen.includes(x)) chosen.push(x)
  }
  return chosen.slice(0, n)
}

/** Prompt suggestions shown on the empty state, mirroring arena.ai. */
export const SUGGESTIONS: Array<{ icon: string; title: string; prompt: string; category: Category }> = [
  {
    icon: 'layout',
    title: 'Create a landing page',
    prompt:
      'Create a sleek, modern landing page for a desktop app that benchmarks LLMs. Give me the component structure and the hero section code.',
    category: 'coding',
  },
  {
    icon: 'chart',
    title: 'Build a dashboard',
    prompt: 'Turn this data into an interactive dashboard spec: layout, chart choices, and the state model. Include a code sketch.',
    category: 'coding',
  },
  {
    icon: 'gamepad',
    title: 'Make a game',
    prompt: 'Build a playable browser game — a top-down arena shooter in a single HTML file with canvas. Explain the game loop.',
    category: 'creative',
  },
  {
    icon: 'code',
    title: 'Design to code',
    prompt: 'Describe how you would convert a screenshot of a UI into production React + Tailwind code, step by step.',
    category: 'coding',
  },
  {
    icon: 'store',
    title: 'Launch a storefront',
    prompt: 'Create a beautiful online shop for a small coffee roaster: page structure, product schema, and checkout flow.',
    category: 'creative',
  },
  {
    icon: 'brain',
    title: 'Prove it',
    prompt:
      'A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost? Show the reasoning.',
    category: 'math',
  },
  {
    icon: 'terminal',
    title: 'Refactor this',
    prompt: 'Review a 400-line React component with nested useEffects and prop drilling. What is your refactoring plan?',
    category: 'reasoning',
  },
  {
    icon: 'sparkles',
    title: 'Write it well',
    prompt: 'Write a short, punchy announcement post for a desktop app launch. Two variants: playful and deadpan.',
    category: 'creative',
  },
]
