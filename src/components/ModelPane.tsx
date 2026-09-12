import { memo, useState } from 'react'
import { Markdown } from './Markdown'
import { Icon } from './Icons'
import { OrgTile } from './Bits'
import { laneKey, useLiveLane } from '../store/lanes'
import { getModel } from '../lib/models'
import { cn, formatMs, formatTokensPerSec, LANE_LABELS } from '../lib/utils'
import type { LaneKey } from '../lib/utils'
import type { VoteKind } from '../lib/types'

export interface ModelPaneProps {
  turnId: string
  lane: string
  modelId: string
  revealed: boolean
  isLatest: boolean
  voted: VoteKind | null
  winnerLane?: string
  showMetrics: boolean
  focused: boolean
  dimmed: boolean
  onVote: (kind: VoteKind, lane?: string) => void
  onFocus: () => void
}

export const ModelPane = memo(function ModelPane({
  turnId,
  lane,
  modelId,
  revealed,
  isLatest,
  voted,
  winnerLane,
  showMetrics,
  focused,
  dimmed,
  onVote,
  onFocus,
}: ModelPaneProps) {
  const live = useLiveLane(laneKey(turnId, lane))
  const model = getModel(modelId)
  const [copied, setCopied] = useState(false)

  const accent = `var(--accent-${lane})`
  const label = revealed ? model.name : LANE_LABELS[lane as LaneKey]
  const streaming = live.status === 'streaming'
  const queued = live.status === 'queued'
  const errored = live.status === 'error'
  const won = voted === 'best' && winnerLane === lane

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(live.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* ignore */
    }
  }

  return (
    <article
      className={cn(
        'group relative flex min-h-0 flex-col overflow-hidden rounded-xl border bg-panel/55 backdrop-blur-sm transition-all duration-200',
        streaming ? 'border-transparent' : 'border-linesoft hover:border-line',
        won && 'border-good/45',
        dimmed && !focused && 'opacity-45 saturate-50',
        focused && 'shadow-[0_0_0_1px_var(--line),0_30px_80px_-50px_rgba(0,0,0,1)]',
      )}
      style={
        streaming || won
          ? {
              boxShadow: won
                ? `0 0 0 1px color-mix(in oklab, var(--good) 40%, transparent), 0 24px 70px -50px var(--good)`
                : `0 0 0 1px color-mix(in oklab, ${accent} 45%, transparent), 0 24px 70px -55px ${accent}`,
            }
          : undefined
      }
    >
      {/* accent bar */}
      <span
        className="absolute inset-x-0 top-0 h-[2px] origin-left transition-transform duration-300"
        style={{
          background: `linear-gradient(90deg, ${accent}, transparent 85%)`,
          transform: streaming ? 'scaleX(1)' : 'scaleX(0.28)',
          opacity: streaming ? 1 : 0.5,
        }}
      />

      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-linesoft px-3">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[11px] font-bold uppercase"
          style={{ color: accent, background: `color-mix(in oklab, ${accent} 15%, transparent)` }}
          title={revealed ? model.name : 'Hidden until you vote'}
        >
          {lane}
        </span>

        <div className="flex min-w-0 items-center gap-2">
          {revealed && <OrgTile org={model.org} size={18} />}
          <span className="truncate text-[12.5px] font-semibold text-ink">{label}</span>
          {revealed && (
            <span className="hidden truncate text-[11px] text-faint xl:inline">
              {model.org} · {model.family}
            </span>
          )}
        </div>

        {won && (
          <span className="chip border-good/40 bg-good/10 text-good">
            <Icon name="crown" size={11} strokeWidth={2} />
            won
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {streaming && (
            <span className="chip border-brand2/40 bg-brand2/10 font-mono text-[10px] text-brand2">
              <span className="h-1.5 w-1.5 rounded-full bg-brand2 animate-pulse-dot" />
              {formatTokensPerSec(live.tokPerSec)}
            </span>
          )}
          {errored && (
            <span className="chip border-bad/40 bg-bad/10 text-bad">
              <Icon name="alert" size={11} />
              error
            </span>
          )}
          {live.status === 'aborted' && <span className="chip text-warn">stopped</span>}
          {live.status === 'done' && !voted && isLatest && (
            <span className="chip text-good">
              <Icon name="check" size={11} strokeWidth={2.4} />
              done
            </span>
          )}

          <IconBtn label={focused ? 'Exit focus' : 'Focus this lane'} icon={focused ? 'x' : 'eye'} onClick={onFocus} />
          <IconBtn label={copied ? 'Copied' : 'Copy answer'} icon={copied ? 'check' : 'copy'} onClick={copy} />
        </div>
      </header>

      {showMetrics && (
        <div className="flex shrink-0 items-center gap-3 border-b border-linesoft/70 bg-bgsoft/40 px-3 py-1.5 font-mono text-[10.5px] text-faint">
          <Metric label="ttft" value={live.ttftMs ? formatMs(live.ttftMs) : '—'} />
          <Metric label="total" value={live.elapsedMs ? formatMs(live.elapsedMs) : '—'} />
          <Metric label="tokens" value={live.tokens ? String(live.tokens) : '—'} />
          <Metric label="speed" value={live.tokPerSec ? formatTokensPerSec(live.tokPerSec) : '—'} />
          {revealed && <Metric label="ctx" value={`${Math.round(model.context / 1000)}k`} />}
          <span className="ml-auto flex items-center gap-1">
            <Icon name="cpu" size={11} />
            {revealed ? model.id : 'blind'}
          </span>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        {queued && (
          <div className="space-y-2 pt-1">
            {[92, 78, 85, 60].map((w, i) => (
              <div key={i} className="skeleton h-2.5 rounded-full opacity-60" style={{ width: `${w}%` }} />
            ))}
            <p className="pt-2 text-[11.5px] text-faint">Waiting for {label}…</p>
          </div>
        )}

        {errored && (
          <div className="rounded-lg border border-bad/35 bg-bad/8 p-3">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-bad">
              <Icon name="alert" size={13} />
              Request failed
            </p>
            <p className="mt-1 break-words font-mono text-[11.5px] leading-relaxed text-ink2">
              {live.error ?? 'Unknown error'}
            </p>
            <p className="mt-2 text-[11px] text-faint">
              In SIM mode this never happens — switch back in Settings if you were testing a live key.
            </p>
          </div>
        )}

        {!queued && !errored && live.text && (
          <div className={cn(streaming && 'caret')}>
            <Markdown text={live.text} />
          </div>
        )}

        {!queued && !errored && !live.text && live.status === 'idle' && (
          <p className="pt-1 text-[11.5px] text-faint">Idle.</p>
        )}
      </div>

      {isLatest && !voted && live.status === 'done' && (
        <footer className="shrink-0 border-t border-linesoft bg-bgsoft/40 p-2">
          <button
            type="button"
            onClick={() => onVote('best', lane)}
            className="btn h-8 w-full gap-1.5 text-[12px] font-semibold"
            style={{ borderColor: `color-mix(in oklab, ${accent} 40%, var(--line))` }}
          >
            <Icon name="crown" size={13} />
            {revealed ? `Vote ${model.name}` : `Vote ${LANE_LABELS[lane as LaneKey]}`}
            <span className="kbd ml-1">{lane.toUpperCase()}</span>
          </button>
        </footer>
      )}
    </article>
  )
})

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-faint/70">{label}</span>
      <span className="tabular text-ink2">{value}</span>
    </span>
  )
}

function IconBtn({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-md text-faint opacity-0 transition-all hover:bg-raised hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
    >
      <Icon name={icon} size={13} />
    </button>
  )
}
