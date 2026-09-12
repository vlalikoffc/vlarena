import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useApp } from '../store/store'
import { Icon } from './Icons'
import { appInfo } from '../lib/platform'
import type { AppInfo } from '../lib/platform'
import { MODELS } from '../lib/models'
import { MOD } from '../lib/utils'
import { STATE_VERSION } from '../lib/seed'

const BUILD_COMMANDS = `npm install          # web deps
npm run icons        # generate platform icons from app-icon.png
npm run tauri dev    # native window + hot reload
npm run tauri build  # .dmg / .msi+.exe / .deb+.AppImage`

export function AboutView() {
  const { state } = useApp()
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void appInfo().then(setInfo)
  }, [])

  const votes = state.battles.reduce((n, b) => n + b.turns.reduce((m, t) => m + t.votes.length, 0), 0)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand2 text-white shadow-xl shadow-brand/30">
            <Icon name="logo" size={26} strokeWidth={2.2} />
          </span>
          <div>
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">vlarena</h1>
            <p className="text-[12px] text-muted">
              Desktop LLM battle arena · v{info?.version ?? '0.1.0'} · {info?.platform ?? 'web'} on{' '}
              {info?.os ?? 'unknown'}
            </p>
          </div>
        </div>

        <p className="mt-5 text-[13.5px] leading-relaxed text-ink2">
          vlarena sends one prompt to several frontier models at the same time and keeps their identities hidden
          until you judge the answers. Your verdict moves a local Elo rating, so after a while the leaderboard
          reflects <em>your</em> preferences on <em>your</em> prompts — not a crowd-sourced average.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat label="Models in catalog" value={String(MODELS.length)} icon="cpu" />
          <Stat label="Battles stored" value={String(state.battles.length)} icon="message" />
          <Stat label="Votes cast" value={String(votes)} icon="crown" />
        </div>

        <Section title="How the rating works" icon="chart">
          <ul className="ml-4 list-disc space-y-1.5 text-[12.5px] leading-relaxed text-ink2">
            <li>
              Each battle is reduced to pairwise results: the lane you crown beats every other lane, everything
              else draws.
            </li>
            <li>
              Deltas use the standard Elo update against the expected score, K=24, normalised by lane count so a
              4-way battle can&apos;t swing four times harder than a duel.
            </li>
            <li>
              Ratings are tracked overall and per category (coding, creative, reasoning, math). The confidence
              band is <span className="font-mono">1.96 · σ / √votes</span> and tightens as you vote.
            </li>
            <li>
              Seed ratings in <span className="font-mono">src/lib/models.ts</span> are illustrative placeholders.
              They are replaced by your own history as soon as you start voting — and you can reset at any time.
            </li>
          </ul>
        </Section>

        <Section title="Privacy" icon="shield">
          <p className="text-[12.5px] leading-relaxed text-ink2">
            No telemetry, no accounts, no server. Battles, ratings and API keys live in{' '}
            <span className="font-mono text-[11.5px]">
              {info?.platform === 'tauri' ? 'the OS app-data directory (tauri-plugin-store)' : 'this browser’s localStorage'}
            </span>
            . In <strong>simulated</strong> mode the app makes zero network requests; in <strong>live</strong> mode
            it talks only to the endpoints you configure.
          </p>
        </Section>

        <Section title="Stack" icon="layers">
          <div className="grid gap-1.5 sm:grid-cols-2">
            {[
              ['Tauri v2', 'native window, Rust core, ~8 MB installer'],
              ['React 19 + TypeScript', 'strict mode, no any-leaks'],
              ['Tailwind CSS v4', 'token-driven dark/light themes'],
              ['Vite 7', 'dev server shared with the webview'],
              ['Custom markdown + highlighter', 'streaming-safe, zero deps'],
              ['plugin-store / plugin-http', 'persistence + CORS-free provider calls'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline gap-2 rounded-lg border border-linesoft bg-panel/50 px-3 py-2">
                <span className="text-[12px] font-semibold text-ink">{k}</span>
                <span className="text-[11px] text-faint">{v}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Keyboard" icon="keyboard">
          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {[
              [[MOD, 'K'], 'Command palette'],
              [[MOD, 'N'], 'New battle'],
              [[MOD, '↵'], 'Send prompt'],
              [[MOD, 'B'], 'Toggle sidebar'],
              [[MOD, ','], 'Settings'],
              [[MOD, 'R'], 'Reveal models'],
              [['1…4'], 'Crown a lane'],
              [['T'], 'Tie'],
              [['B'], 'Both bad'],
              [['Esc'], 'Stop / close'],
            ].map(([keys, label]) => (
              <div key={label as string} className="flex items-center justify-between border-b border-linesoft/60 py-1.5">
                <span className="text-[12px] text-ink2">{label as string}</span>
                <span className="flex gap-1">
                  {(keys as string[]).map((k) => (
                    <span key={k} className="kbd">
                      {k}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Build it yourself" icon="terminal">
          <div className="md-pre">
            <pre className="px-3 py-2.5 font-mono text-[11.5px] leading-relaxed">
              <code>{BUILD_COMMANDS}</code>
            </pre>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
            The same UI runs as a plain web app: <span className="font-mono">npm run dev</span> → http://localhost:1420.
            GitHub Actions in <span className="font-mono">.github/workflows/desktop.yml</span> builds signed-ready
            artifacts for macOS (arm64/x64), Windows and Linux on every tag.
          </p>
        </Section>

        <p className="mt-8 border-t border-linesoft pt-4 text-[10.5px] leading-relaxed text-faint">
          State schema v{STATE_VERSION} · not affiliated with arena.ai — inspired by its Battle Mode. Model names,
          prices and seed ratings in the catalog are sample data for the offline simulator.
        </p>
      </div>
    </div>
  )
}

function Stat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-xl border border-linesoft bg-panel/50 p-3">
      <span className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-faint">
        <Icon name={icon} size={12} />
        {label}
      </span>
      <span className="tabular mt-1 block font-mono text-[22px] font-semibold text-ink">{value}</span>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold tracking-tight text-ink">
        <span className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-panel2 text-muted">
          <Icon name={icon} size={13} />
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}
