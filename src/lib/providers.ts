/**
 * Provider layer.
 *
 * One entry point — `streamAnswer()` — used by the battle engine. It routes to:
 *   • the offline simulator (default, zero config, zero network)
 *   • an OpenAI-compatible /chat/completions endpoint (OpenAI, OpenRouter,
 *     Groq, Together, vLLM, LM Studio, Ollama …)
 *   • the Anthropic /v1/messages endpoint
 *
 * Requests go through `transport()`, which uses Tauri's HTTP plugin inside the
 * desktop window so provider CORS policies don't block us.
 */

import type { ModelDef, ModelRoute, ProviderConfig, ProviderId, Settings } from './types'
import { composeAnswer, streamSimulated } from './simulator'
import { transport } from './platform'
import { clamp } from './utils'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamRequest {
  model: ModelDef
  route: ModelRoute
  messages: ChatMessage[]
  settings: Settings
  signal?: AbortSignal
  /** varies the simulated answer between identical prompts */
  salt?: number
  onFirstToken?: (ttftMs: number) => void
  onChunk: (chunk: string) => void
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly provider?: string,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

export function routeFor(model: ModelDef, settings: Settings): ModelRoute {
  return (
    settings.routes[model.id] ?? {
      provider: model.provider,
      wireId: model.id,
      enabled: true,
    }
  )
}

export function providerConfig(id: ProviderId, settings: Settings): ProviderConfig {
  return (
    settings.providers[id] ?? {
      enabled: false,
      apiKey: '',
      baseUrl: DEFAULT_BASE_URL[id],
    }
  )
}

export const DEFAULT_BASE_URL: Record<ProviderId, string> = {
  mock: '',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  openrouter: 'https://openrouter.ai/api/v1',
  custom: 'http://127.0.0.1:11434/v1',
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  mock: 'Simulator (offline)',
  openai: 'OpenAI-compatible',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  custom: 'Custom / local',
}

export const PROVIDER_HINTS: Record<ProviderId, string> = {
  mock: 'No key needed. Answers are generated locally by a persona-based simulator.',
  openai: 'Anything speaking /chat/completions: OpenAI, Groq, Together, vLLM, LM Studio, Ollama.',
  anthropic: 'Anthropic Messages API. Browser mode needs CORS; the desktop build uses the native HTTP plugin.',
  openrouter: 'One key for hundreds of models. Use the full `org/model` id as the wire id.',
  custom: 'Point at your own gateway or a local server. Defaults to Ollama.',
}

export async function streamAnswer(req: StreamRequest): Promise<void> {
  const { model, route, settings } = req

  if (settings.mode === 'simulated' || route.provider === 'mock') {
    const text = composeAnswer(
      req.messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n\n'),
      model,
      req.salt ?? 0,
    )
    await streamSimulated({
      text,
      model,
      signal: req.signal,
      salt: req.salt ?? 0,
      onFirstToken: req.onFirstToken,
      onChunk: req.onChunk,
    })
    return
  }

  const cfg = providerConfig(route.provider, settings)
  if (!cfg.baseUrl) {
    throw new ProviderError(
      `No base URL configured for ${PROVIDER_LABELS[route.provider]}. Open Settings → Providers.`,
      undefined,
      route.provider,
    )
  }
  if (route.provider !== 'custom' && !cfg.apiKey) {
    throw new ProviderError(
      `Missing API key for ${PROVIDER_LABELS[route.provider]}. Open Settings → Providers.`,
      undefined,
      route.provider,
    )
  }

  switch (route.provider) {
    case 'anthropic':
      return streamAnthropic(req, cfg)
    case 'openai':
    case 'openrouter':
    case 'custom':
      return streamOpenAI(req, cfg)
    default:
      throw new ProviderError(`Unknown provider "${route.provider}"`, undefined, route.provider)
  }
}

/* ---------------- OpenAI-compatible ---------------- */

async function streamOpenAI(req: StreamRequest, cfg: ProviderConfig): Promise<void> {
  const { model, route, settings, signal, onChunk } = req
  const url = joinUrl(cfg.baseUrl, '/chat/completions')

  const system = settings.systemPrompt.trim()
  const messages: ChatMessage[] = [
    ...(system ? [{ role: 'system' as const, content: system }] : []),
    ...req.messages,
  ]

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`
  if (route.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/vlalikoffc/vlarena'
    headers['X-Title'] = 'vlarena'
  }

  const started = performance.now()
  const fetcher = await transport()
  const res = await fetcher(url, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model: route.wireId || model.id,
      messages,
      stream: true,
      temperature: clamp(settings.temperature, 0, 2),
      max_tokens: clamp(Math.round(settings.maxTokens), 16, 128_000),
    }),
  })

  await assertOk(res, route.provider)

  let first = true
  await readSSE(res, (data) => {
    if (data === '[DONE]') return
    let json: any
    try {
      json = JSON.parse(data)
    } catch {
      return
    }
    const choice = json.choices?.[0]
    const delta: string =
      choice?.delta?.content ??
      choice?.delta?.text ??
      choice?.text ??
      ''
    if (!delta) return
    if (first) {
      first = false
      req.onFirstToken?.(performance.now() - started)
    }
    onChunk(delta)
  })
}

/* ---------------- Anthropic ---------------- */

async function streamAnthropic(req: StreamRequest, cfg: ProviderConfig): Promise<void> {
  const { model, route, settings, signal, onChunk } = req
  const url = joinUrl(cfg.baseUrl, '/v1/messages')

  const system = settings.systemPrompt.trim()
  const messages = req.messages.filter((m) => m.role !== 'system')

  const started = performance.now()
  const fetcher = await transport()
  const res = await fetcher(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(cfg.apiKey ? { 'x-api-key': cfg.apiKey } : {}),
      'anthropic-version': '2023-06-01',
      // Required when calling the API straight from a webview.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    signal,
    body: JSON.stringify({
      model: route.wireId || model.id,
      system: system || undefined,
      messages,
      stream: true,
      temperature: clamp(settings.temperature, 0, 1),
      max_tokens: clamp(Math.round(settings.maxTokens), 16, 64_000),
    }),
  })

  await assertOk(res, route.provider)

  let first = true
  await readSSE(res, (data) => {
    let json: any
    try {
      json = JSON.parse(data)
    } catch {
      return
    }
    if (json.type === 'content_block_delta') {
      const text: string = json.delta?.text ?? json.delta?.partial_json ?? ''
      if (!text) return
      if (first) {
        first = false
        req.onFirstToken?.(performance.now() - started)
      }
      onChunk(text)
    }
  })
}

/* ---------------- shared SSE plumbing ---------------- */

async function assertOk(res: Response, provider: string): Promise<void> {
  if (res.ok) return
  let detail = ''
  try {
    detail = (await res.text()).slice(0, 400)
  } catch {
    /* ignore */
  }
  if (res.status === 401 || res.status === 403) {
    throw new ProviderError(`Auth rejected (${res.status}). Check the API key in Settings.`, res.status, provider)
  }
  if (res.status === 404) {
    throw new ProviderError(`Endpoint not found (${res.status}). Check the base URL / model id.`, res.status, provider)
  }
  if (res.status === 429) {
    throw new ProviderError('Rate limited (429). Slow down or raise your quota.', res.status, provider)
  }
  throw new ProviderError(
    `Provider error ${res.status}${detail ? ` — ${detail}` : ''}`,
    res.status,
    provider,
  )
}

async function readSSE(
  res: Response,
  onData: (data: string) => void,
): Promise<void> {
  if (!res.body) throw new ProviderError('Provider returned an empty body')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })

    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const raw = buf.slice(0, nl)
      buf = buf.slice(nl + 1)
      const line = raw.replace(/\r$/, '').trim()
      if (!line || line.startsWith(':')) continue
      if (line.startsWith('data:')) onData(line.slice(5).trim())
    }
  }
  const tail = buf.trim()
  if (tail.startsWith('data:')) onData(tail.slice(5).trim())
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, '')
  // Anthropic's base already contains /v1 in some setups; avoid doubling.
  if (path.startsWith('/v1/') && b.endsWith('/v1')) return b + path.slice(3)
  return b + path
}
