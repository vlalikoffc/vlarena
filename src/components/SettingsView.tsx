import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useApp } from '../store/store'
import { Icon } from './Icons'
import { OrgTile } from './Bits'
import { MODELS, getModel } from '../lib/models'
import { DEFAULT_BASE_URL, PROVIDER_HINTS, PROVIDER_LABELS, routeFor, streamAnswer } from '../lib/providers'
import { downloadFile } from '../lib/export'
import { isTauri } from '../lib/platform'
import { KEYS, kv } from '../lib/storage'
import { cn, estimateTokens, MOD } from '../lib/utils'
import type { AppState, ProviderId } from '../lib/types'
import { STATE_VERSION, defaultSettings } from '../lib/seed'

const PROVIDERS: ProviderId[] = ['openai', 'anthropic', 'openrouter', 'custom']

const TEST_WIRE_ID: Record<ProviderId, string> = {
  mock: 'simulated',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
  openrouter: 'openai/gpt-4o-mini',
  custom: 'llama3.2',
}

type TestState = { status: 'idle' } | { status: 'running' } | { status: 'ok'; ms: number; tokens: number } | { status: 'error'; message: string }

export function SettingsView() {
  const { state, actions } = useApp()
  const s = state.settings

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-6 py-6">
        <h1 className="flex items-center gap-2 text-[26px] font-semibold tracking-[-0.02em] text-ink">
          <Icon name="sliders" size={22} />
          Settings
        </h1>
        <p className="mt-1 text-[12.5px] text-muted">
          Everything is stored locally{isTauri() ? ' in the OS app-data directory' : ' in this browser'} — API keys
          never leave your machine.
        </p>

        <Section
          title="Mode"
          icon="bolt"
          description="Simulated runs entirely offline. Live calls the providers below with your keys."
        >
          <div className="flex gap-2">
            {(['simulated', 'live'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => actions.patchSettings({ mode })}
                className={cn(
                  'flex flex-1 flex-col gap-1 rounded-xl border p-3 text-left transition-all',
                  s.mode === mode ? 'border-brand/55 bg-brand/10' : 'border-line bg-panel/50 hover:border-line hover:bg-panel2',
                )}
              >
                <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
                  <Icon name={mode === 'live' ? 'bolt' : 'sparkles'} size={14} />
                  {mode === 'live' ? 'Live providers' : 'Offline simulator'}
                </span>
                <span className="text-[11.5px] leading-relaxed text-muted">
                  {mode === 'live'
                    ? 'Real streaming responses from OpenAI-compatible or Anthropic endpoints you configure.'
                    : 'Persona-based local generation with realistic timing. Zero keys, zero network.'}
                </span>
              </button>
            ))}
          </div>
        </Section>

        <Section
          title="Providers"
          icon="key"
          description="Add a key for whichever endpoint you want in the rotation."
        >
          <div className="grid gap-3 md:grid-cols-2">
            {PROVIDERS.map((id) => (
              <ProviderCard key={id} id={id} />
            ))}
          </div>
        </Section>

        <Section
          title="Routing"
          icon="layers"
          description="Which provider serves each model, and under what wire id."
        >
          <RoutingTable />
        </Section>

        <Section title="Generation" icon="cpu" description="Defaults applied to every lane.">
          <div className="grid gap-4 md:grid-cols-2">
            <Slider
              label="Temperature"
              value={s.temperature}
              min={0}
              max={2}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(v) => actions.patchSettings({ temperature: v })}
            />
            <Slider
              label="Max output tokens"
              value={s.maxTokens}
              min={256}
              max={16384}
              step={256}
              format={(v) => String(v)}
              onChange={(v) => actions.patchSettings({ maxTokens: v })}
            />
          </div>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-[11.5px] font-medium text-ink2">System prompt</span>
            <textarea
              className="field min-h-[92px] resize-y font-mono text-[11.5px] leading-relaxed"
              value={s.systemPrompt}
              onChange={(e) => actions.patchSettings({ systemPrompt: e.target.value })}
            />
            <span className="mt-1 block text-[10.5px] text-faint">
              Sent to live providers only. The simulator ignores it.
            </span>
          </label>
        </Section>

        <Section title="Battle" icon="swords" description="How rounds are set up and scored.">
          <div className="grid gap-2 md:grid-cols-2">
            <Toggle
              label="Reveal models automatically after voting"
              description="Turn this off to keep a fully blind leaderboard run."
              checked={s.autoReveal}
              onChange={(v) => actions.patchSettings({ autoReveal: v })}
            />
            <Toggle
              label="Show performance metrics"
              description="Time to first token, decode speed, token count, elapsed."
              checked={s.showMetrics}
              onChange={(v) => actions.patchSettings({ showMetrics: v })}
            />
            <div className="flex items-center justify-between rounded-xl border border-line bg-panel/50 px-3 py-2.5">
              <div>
                <p className="text-[12.5px] font-medium text-ink">Default lanes</p>
                <p className="text-[11px] text-faint">How many models answer each prompt</p>
              </div>
              <div className="flex items-center gap-0.5 rounded-lg border border-line bg-bgsoft p-0.5">
                {[2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => actions.patchSettings({ lanes: n })}
                    className={cn(
                      'h-7 w-7 rounded-md font-mono text-[11.5px] transition-all',
                      s.lanes === n ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <Toggle
              label="Reduce motion"
              description="Disable streaming animations and transitions."
              checked={s.reduceMotion}
              onChange={(v) => actions.patchSettings({ reduceMotion: v })}
            />
          </div>
        </Section>

        <Section title="Appearance" icon="sun" description="Theme follows the OS unless you pin it.">
          <div className="flex gap-2">
            {(['dark', 'light', 'system'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => actions.patchSettings({ theme: t })}
                className={cn(
                  'flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[12.5px] font-medium capitalize transition-all',
                  s.theme === t ? 'border-brand/55 bg-brand/10 text-ink' : 'border-line bg-panel/50 text-muted hover:text-ink',
                )}
              >
                <Icon name={t === 'dark' ? 'moon' : t === 'light' ? 'sun' : 'monitor'} size={14} />
                {t}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Data" icon="download" description="Export, import, or wipe everything.">
          <div className="flex flex-wrap gap-2">
            <ActionButton icon="download" label="Export all data (JSON)" onClick={() => exportData(state)} />
            <ImportButton />
            <ActionButton icon="refresh" label="Reset ratings to seed" onClick={actions.resetRatings} />
            <ActionButton
              icon="trash"
              label="Clear battle history"
              danger
              onClick={() => {
                if (confirm('Delete all battles? Ratings are kept.')) actions.clearHistory()
              }}
            />
          </div>
          <p className="mt-3 text-[10.5px] leading-relaxed text-faint">
            Storage backend:{' '}
            <span className="font-mono">
              {isTauri() ? 'tauri-plugin-store → vlarena.json (app data dir)' : 'window.localStorage'}
            </span>
            . Battles are capped at the 200 most recent.
          </p>
        </Section>

        <Section title="Keyboard" icon="keyboard" description="Everything is reachable without the mouse.">
          <div className="grid gap-x-6 gap-y-1.5 md:grid-cols-2">
            {SHORTCUTS.map(([keys, label]) => (
              <div key={label} className="flex items-center justify-between border-b border-linesoft/60 py-1.5 last:border-0">
                <span className="text-[12px] text-ink2">{label}</span>
                <span className="flex gap-1">
                  {keys.map((k) => (
                    <span key={k} className="kbd">
                      {k}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <div className="h-8" />
      </div>
    </div>
  )
}

const SHORTCUTS: Array<[string[], string]> = [
  [[MOD, 'K'], 'Command palette'],
  [[MOD, 'N'], 'New battle'],
  [[MOD, '↵'], 'Send prompt'],
  [[MOD, 'B'], 'Toggle sidebar'],
  [[MOD, ','], 'Settings'],
  [[MOD, 'R'], 'Reveal models'],
  [['1', '…', '4'], 'Vote lane best'],
  [['T'], 'Vote tie'],
  [['B'], 'Vote both bad'],
  [['Esc'], 'Stop streaming / close'],
]

/* ------------------------------------------------------------------ */

function Section({
  title,
  icon,
  description,
  children,
}: {
  title: string
  icon: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-panel2 text-muted">
          <Icon name={icon} size={13} />
        </span>
        <h2 className="text-[14px] font-semibold tracking-tight text-ink">{title}</h2>
        {description && <span className="text-[11.5px] text-faint">— {description}</span>}
      </div>
      {children}
    </section>
  )
}

function ProviderCard({ id }: { id: ProviderId }) {
  const { state, actions } = useApp()
  const cfg = state.settings.providers[id] ?? { enabled: false, apiKey: '', baseUrl: DEFAULT_BASE_URL[id] }
  const [show, setShow] = useState(false)
  const [test, setTest] = useState<TestState>({ status: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  const routed = useMemo(
    () => MODELS.filter((m) => routeFor(m, state.settings).provider === id),
    [state.settings, id],
  )

  const runTest = async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setTest({ status: 'running' })
    const wireId = TEST_WIRE_ID[id]
    const model = { ...getModel('probe'), id: 'probe', name: wireId, provider: id, speed: 60 }
    const started = performance.now()
    let text = ''
    try {
      await streamAnswer({
        model,
        route: { provider: id, wireId, enabled: true },
        messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
        settings: { ...state.settings, mode: 'live', systemPrompt: '' },
        signal: ctrl.signal,
        onChunk: (c) => (text += c),
      })
      setTest({ status: 'ok', ms: Math.round(performance.now() - started), tokens: estimateTokens(text) })
    } catch (err) {
      setTest({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-all',
        cfg.enabled ? 'border-brand/40 bg-brand/[0.05]' : 'border-linesoft bg-panel/45',
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-bgsoft text-muted">
          <Icon name={id === 'anthropic' ? 'shield' : id === 'openrouter' ? 'layers' : 'cpu'} size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-ink">{PROVIDER_LABELS[id]}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-faint">{PROVIDER_HINTS[id]}</p>
        </div>
        <Toggle
          label={`Enable ${PROVIDER_LABELS[id]}`}
          checked={cfg.enabled}
          onChange={(v) =>
            actions.patchSettings({ providers: { ...state.settings.providers, [id]: { ...cfg, enabled: v } } })
          }
          compact
        />
      </div>

      <div className={cn('grid gap-2 transition-opacity', cfg.enabled ? 'mt-3 opacity-100' : 'pointer-events-none mt-3 opacity-35')}>
        <label className="block">
          <span className="mb-1 block text-[10.5px] uppercase tracking-wider text-faint">Base URL</span>
          <input
            className="field h-8 font-mono text-[11.5px]"
            value={cfg.baseUrl}
            placeholder={DEFAULT_BASE_URL[id]}
            onChange={(e) =>
              actions.patchSettings({
                providers: { ...state.settings.providers, [id]: { ...cfg, baseUrl: e.target.value } },
              })
            }
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10.5px] uppercase tracking-wider text-faint">API key</span>
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              className="field h-8 pr-16 font-mono text-[11.5px]"
              value={cfg.apiKey}
              placeholder="sk-…"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) =>
                actions.patchSettings({
                  providers: { ...state.settings.providers, [id]: { ...cfg, apiKey: e.target.value } },
                })
              }
            />
            <button
              type="button"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 font-mono text-[10px] text-faint hover:bg-raised hover:text-ink"
              onClick={() => setShow((v) => !v)}
            >
              {show ? 'hide' : 'show'}
            </button>
          </div>
        </label>

        <div className="flex items-center gap-2">
          <button type="button" className="btn h-7 gap-1.5 px-2 text-[11.5px]" onClick={() => void runTest()} disabled={test.status === 'running'}>
            <Icon name={test.status === 'running' ? 'refresh' : 'play'} size={11} className={test.status === 'running' ? 'animate-spin' : undefined} />
            {test.status === 'running' ? 'Testing…' : 'Test connection'}
          </button>
          {test.status === 'ok' && (
            <span className="flex items-center gap-1 font-mono text-[11px] text-good">
              <Icon name="check" size={11} strokeWidth={2.4} />
              {test.ms}ms · {test.tokens} tok
            </span>
          )}
          {test.status === 'error' && (
            <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-bad" title={test.message}>
              {test.message}
            </span>
          )}
          <span className="ml-auto text-[10.5px] text-faint">
            {routed.length} model{routed.length === 1 ? '' : 's'} routed
          </span>
        </div>
      </div>
    </div>
  )
}

function RoutingTable() {
  const { state, actions } = useApp()
  const [filter, setFilter] = useState('')

  const models = MODELS.filter((m) => !filter || `${m.name} ${m.org} ${m.id}`.toLowerCase().includes(filter.toLowerCase()))
  const anyCustom = Object.keys(state.settings.routes).length > 0

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <label className="relative flex-1">
          <Icon name="search" size={12} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
          <input
            className="field h-8 pl-7 text-[12px]"
            placeholder="Filter models…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        {anyCustom && (
          <button
            type="button"
            className="btn h-8 gap-1.5 text-[11.5px]"
            onClick={() => actions.patchSettings({ routes: {} })}
          >
            <Icon name="refresh" size={12} />
            Reset routing
          </button>
        )}
      </div>

      <div className="max-h-[320px] overflow-y-auto rounded-xl border border-linesoft">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-bgsoft text-[10px] uppercase tracking-wider text-faint">
            <tr className="border-b border-linesoft">
              <th className="px-3 py-2 text-left font-medium">Model</th>
              <th className="px-3 py-2 text-left font-medium">Provider</th>
              <th className="px-3 py-2 text-left font-medium">Wire id</th>
              <th className="w-16 px-3 py-2 text-center font-medium">On</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => {
              const route = routeFor(m, state.settings)
              return (
                <tr key={m.id} className="border-b border-linesoft/50 last:border-0 hover:bg-panel2/50">
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <OrgTile org={m.org} size={18} />
                      <span className="font-medium text-ink2">{m.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      className="field h-7 w-40 py-0 text-[11.5px]"
                      value={route.provider}
                      onChange={(e) => actions.setModelRoute(m.id, { provider: e.target.value as ProviderId })}
                    >
                      {(Object.keys(PROVIDER_LABELS) as ProviderId[]).map((p) => (
                        <option key={p} value={p}>
                          {PROVIDER_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="field h-7 w-52 font-mono text-[11px]"
                      value={route.wireId}
                      onChange={(e) => actions.setModelRoute(m.id, { wireId: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <Toggle
                      label={`Enable ${m.name}`}
                      compact
                      checked={route.enabled}
                      onChange={(v) => actions.setModelRoute(m.id, { enabled: v })}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
        Wire id is what goes over the network — e.g. <span className="font-mono">gpt-5.2</span> for OpenAI or{' '}
        <span className="font-mono">anthropic/claude-opus-4.6</span> on OpenRouter. In simulated mode routing is
        ignored.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function Toggle({
  label,
  description,
  checked,
  onChange,
  compact,
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || undefined}
      onClick={() => onChange(!checked)}
      className={cn(
        compact
          ? 'shrink-0'
          : 'flex items-center justify-between gap-3 rounded-xl border border-line bg-panel/50 px-3 py-2.5 text-left transition-colors hover:bg-panel2',
      )}
    >
      {!compact && (
        <span className="min-w-0">
          <span className="block text-[12.5px] font-medium text-ink">{label}</span>
          {description && <span className="mt-0.5 block text-[11px] leading-snug text-faint">{description}</span>}
        </span>
      )}
      <span
        className={cn(
          'relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-brand' : 'bg-line',
        )}
      >
        <span
          className={cn(
            'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[15px]' : 'translate-x-[3px]',
          )}
        />
      </span>
    </button>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <label className="block rounded-xl border border-line bg-panel/50 px-3 py-2.5">
      <span className="flex items-center justify-between">
        <span className="text-[12.5px] font-medium text-ink">{label}</span>
        <span className="tabular font-mono text-[11.5px] text-brand2">{format(value)}</span>
      </span>
      <input
        type="range"
        className="mt-2 w-full accent-[var(--brand)]"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

function ActionButton({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button type="button" className={cn('btn h-8 gap-1.5 px-3 text-[12px]', danger && 'hover:border-bad/50 hover:text-bad')} onClick={onClick}>
      <Icon name={icon} size={13} />
      {label}
    </button>
  )
}

function ImportButton() {
  const { actions } = useApp()
  const ref = useRef<HTMLInputElement>(null)

  const onFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as AppState
      if (!parsed || !Array.isArray(parsed.battles)) throw new Error('not a vlarena export')
      await kv().set(KEYS.state, {
        version: STATE_VERSION,
        settings: { ...defaultSettings(), ...(parsed.settings ?? {}) },
        ratings: parsed.ratings ?? {},
        battles: parsed.battles,
        activeBattleId: null,
      })
      actions.toast({ kind: 'success', title: 'Data imported', body: 'Reloading…' })
      setTimeout(() => window.location.reload(), 700)
    } catch (err) {
      actions.toast({
        kind: 'error',
        title: 'Import failed',
        body: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return (
    <>
      <button type="button" className="btn h-8 gap-1.5 px-3 text-[12px]" onClick={() => ref.current?.click()}>
        <Icon name="download" size={13} className="rotate-180" />
        Import JSON
      </button>
      <input
        ref={ref}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onFile(f)
          e.target.value = ''
        }}
      />
    </>
  )
}

function exportData(state: ReturnType<typeof useApp>['state']) {
  const payload: AppState = {
    version: STATE_VERSION,
    settings: state.settings,
    ratings: state.ratings,
    battles: state.battles,
    activeBattleId: state.activeId,
  }
  downloadFile(`vlarena-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json')
}
