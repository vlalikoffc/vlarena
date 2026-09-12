import { useMemo, useState } from 'react'
import { useApp } from '../store/store'
import { useAnyStreaming, laneKey } from '../store/lanes'
import { ModelPane } from './ModelPane'
import { Composer } from './Composer'
import { Icon } from './Icons'
import { OrgTile } from './Bits'
import { getModel, SUGGESTIONS } from '../lib/models'
import { battleToMarkdown, copyText, downloadFile } from '../lib/export'
import { cn, formatDelta, formatMs, formatTokensPerSec, LANE_KEYS, MOD } from '../lib/utils'
import type { LaneKey } from '../lib/utils'
import type { Battle, Turn, VoteKind } from '../lib/types'

export function BattleView() {
  const { state, actions, activeBattle } = useApp()
  const battle = activeBattle
  const latest = battle?.turns[battle.turns.length - 1]

  const keys = useMemo(() => {
    if (!latest) return []
    return battle!.laneOrder.map((l) => laneKey(latest.id, l))
  }, [battle, latest])

  const busy = useAnyStreaming(keys)

  if (!battle || battle.turns.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <EmptyState onPick={(p) => void actions.send(p)} lanes={state.settings.lanes} />
        <Composer battle={battle} busy={busy} />
      </div>
    )
  }

  const single = battle.turns.length === 1

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', single ? 'overflow-hidden' : 'overflow-y-auto')}>
      <BattleHeader battle={battle} busy={busy} />

      <div className={cn(single ? 'flex min-h-0 flex-1 flex-col gap-4 px-5 py-4' : 'flex flex-col gap-6 px-5 py-4')}>
        {battle.turns.map((turn, i) => (
          <TurnBlock
            key={turn.id}
            battle={battle}
            turn={turn}
            index={i}
            isLatest={i === battle.turns.length - 1}
            single={single}
          />
        ))}
      </div>

      <Composer battle={battle} busy={busy} />
    </div>
  )
}

/* ------------------------------------------------------------------ */

function BattleHeader({ battle, busy }: { battle: Battle; busy: boolean }) {
  const { state, actions } = useApp()
  const [copied, setCopied] = useState(false)
  const models = battle.laneOrder.map((l) => getModel(battle.models[l]!))

  const doCopy = async () => {
    const ok = await copyText(battleToMarkdown(battle))
    setCopied(ok)
    if (ok) setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-linesoft bg-bgsoft/40 px-5 py-2.5">
      <span className="chip border-brand/35 bg-brand/10 text-ink">
        <Icon name={state.settings.mode === 'live' ? 'bolt' : 'sparkles'} size={11} />
        {battle.category}
      </span>

      <div className="flex items-center gap-1.5">
        {models.map((m, i) => (
          <span key={m.id} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-[11px] text-faint">vs</span>}
            <span className="flex items-center gap-1.5 rounded-md border border-linesoft bg-panel px-1.5 py-0.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: `var(--accent-${LANE_KEYS[i] as LaneKey})` }}
              />
              <span className="text-[11.5px] font-medium text-ink2">
                {battle.revealed ? m.name : `Model ${LANE_KEYS[i]!.toUpperCase()}`}
              </span>
            </span>
          </span>
        ))}
      </div>

      {battle.simulated && (
        <span className="chip font-mono text-[10px] text-brand2/90" title="Answers came from the offline simulator">
          SIM
        </span>
      )}

      <div className="ml-auto flex items-center gap-1">
        <HeaderBtn
          icon="dice"
          label="New random models"
          onClick={() => actions.rerollModels(battle.id)}
          disabled={busy}
        />
        {!battle.revealed && (
          <HeaderBtn icon="eye" label="Reveal models" onClick={() => actions.reveal(battle.id)} />
        )}
        <HeaderBtn
          icon="refresh"
          label="Regenerate answers"
          onClick={() => void actions.regenerate(battle.turns[battle.turns.length - 1]!.id)}
          disabled={busy}
        />
        <HeaderBtn icon={copied ? 'check' : 'copy'} label="Copy as Markdown" onClick={() => void doCopy()} />
        <HeaderBtn
          icon="download"
          label="Download Markdown"
          onClick={() =>
            downloadFile(
              `vlarena-${battle.title.slice(0, 32).replace(/[^\w-]+/g, '_').toLowerCase()}.md`,
              battleToMarkdown(battle),
            )
          }
        />
        <span className="mx-1 h-4 w-px bg-line" />
        <HeaderBtn icon="plus" label="New battle" onClick={() => actions.newBattle()} />
      </div>
    </div>
  )
}

function HeaderBtn({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="btn-ghost btn h-7 w-7 p-0"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      <Icon name={icon} size={14} />
    </button>
  )
}

/* ------------------------------------------------------------------ */

function TurnBlock({
  battle,
  turn,
  index,
  isLatest,
  single,
}: {
  battle: Battle
  turn: Turn
  index: number
  isLatest: boolean
  single: boolean
}) {
  const { state, actions } = useApp()
  const [focused, setFocused] = useState<string | null>(null)
  const vote = turn.votes[0]
  const voted: VoteKind | null = vote?.kind ?? null

  const lanes = focused ? [focused] : battle.laneOrder
  const cols = lanes.length >= 4 ? 2 : lanes.length
  const rows = lanes.length >= 4 ? 2 : 1

  return (
    <section className={cn('flex min-h-0 flex-col gap-3', single ? 'flex-1' : 'shrink-0')}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line bg-panel2 font-mono text-[10.5px] text-muted">
          {index + 1}
        </span>
        <p className="flex-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">{turn.prompt}</p>
        {!isLatest && (
          <button
            type="button"
            className="btn-ghost btn h-7 shrink-0 gap-1 px-2 text-[11px]"
            onClick={() => void actions.regenerate(turn.id)}
            title="Regenerate this round"
          >
            <Icon name="refresh" size={12} />
            redo
          </button>
        )}
      </div>

      <div
        className={cn('grid min-h-0 gap-3', single ? 'flex-1' : 'h-[440px]')}
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {lanes.map((lane) => (
          <ModelPane
            key={lane}
            turnId={turn.id}
            lane={lane}
            modelId={battle.models[lane]!}
            revealed={battle.revealed}
            isLatest={isLatest}
            voted={voted}
            winnerLane={vote?.lane}
            showMetrics={state.settings.showMetrics}
            focused={focused === lane}
            dimmed={focused !== null}
            onVote={(kind, l) => actions.vote(turn.id, kind, l)}
            onFocus={() => setFocused((f) => (f === lane ? null : lane))}
          />
        ))}
      </div>

      {isLatest && (
        <VoteBar
          battle={battle}
          turn={turn}
          voted={voted}
          winnerLane={vote?.lane}
          onVote={(kind, lane) => actions.vote(turn.id, kind, lane)}
        />
      )}
    </section>
  )
}

function VoteBar({
  battle,
  turn,
  voted,
  winnerLane,
  onVote,
}: {
  battle: Battle
  turn: Turn
  voted: VoteKind | null
  winnerLane?: string
  onVote: (kind: VoteKind, lane?: string) => void
}) {
  const { state } = useApp()

  if (voted) {
    return (
      <div className="flex animate-rise flex-wrap items-center gap-3 rounded-xl border border-good/25 bg-good/5 px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-good">
          <Icon name={voted === 'best' ? 'crown' : voted === 'tie' ? 'scale' : 'thumbsDown'} size={14} />
          {voted === 'best'
            ? `${battle.revealed ? getModel(turn.lanes.find((l) => l.lane === winnerLane)?.modelId ?? '').name : `Model ${winnerLane?.toUpperCase()}`} wins`
            : voted === 'tie'
              ? 'Tie — no rating change'
              : 'Both bad — no rating change'}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          {battle.laneOrder.map((lane) => {
            const id = battle.models[lane]!
            const d = turn.eloDeltas[id] ?? 0
            const rating = state.ratings[id]
            return (
              <span key={lane} className="flex items-center gap-1.5 rounded-md border border-linesoft bg-panel px-2 py-1">
                {battle.revealed && <OrgTile org={getModel(id).org} size={16} />}
                <span className="text-[11.5px] font-medium text-ink2">
                  {battle.revealed ? getModel(id).name : `Model ${lane.toUpperCase()}`}
                </span>
                <span
                  className={cn(
                    'tabular font-mono text-[11px] font-semibold animate-pop',
                    d > 0.05 ? 'text-good' : d < -0.05 ? 'text-bad' : 'text-faint',
                  )}
                >
                  {formatDelta(d)}
                </span>
                {rating && <span className="tabular font-mono text-[10.5px] text-faint">{Math.round(rating.elo)}</span>}
              </span>
            )
          })}
        </div>

        <span className="ml-auto text-[10.5px] text-faint">
          K=24 · pairwise Elo · {battle.category}
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel/50 px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-faint">
        <Icon name="scale" size={13} />
        Verdict
      </span>

      <div className="flex flex-wrap items-center gap-1.5">
        {battle.laneOrder.map((lane, i) => (
          <button
            key={lane}
            type="button"
            className="btn h-8 gap-1.5 px-2.5 text-[12px] font-medium"
            style={{ borderColor: `color-mix(in oklab, var(--accent-${lane}) 35%, var(--line))` }}
            onClick={() => onVote('best', lane)}
            title={`Vote ${battle.revealed ? getModel(battle.models[lane]!).name : `Model ${lane.toUpperCase()}`} best (${i + 1})`}
          >
            <Icon name="crown" size={12} />
            {battle.revealed ? getModel(battle.models[lane]!).name : `Model ${lane.toUpperCase()}`}
            <span className="kbd">{i + 1}</span>
          </button>
        ))}

        <span className="mx-1 h-5 w-px bg-line" />

        <button type="button" className="btn h-8 gap-1.5 px-2.5 text-[12px]" onClick={() => onVote('tie')}>
          <Icon name="scale" size={12} />
          Tie
          <span className="kbd">T</span>
        </button>
        <button type="button" className="btn h-8 gap-1.5 px-2.5 text-[12px]" onClick={() => onVote('both-bad')}>
          <Icon name="thumbsDown" size={12} />
          Both bad
          <span className="kbd">B</span>
        </button>
      </div>

      {!battle.revealed && (
        <span className="ml-auto text-[10.5px] text-faint">
          Blind round · <span className="kbd">{MOD}</span> <span className="kbd">R</span> to reveal
        </span>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function EmptyState({ onPick, lanes }: { onPick: (prompt: string) => void; lanes: number }) {
  const { state, actions } = useApp()
  const cards = SUGGESTIONS.slice(0, 8)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8">
      <div className="pointer-events-none absolute inset-0 grain opacity-[0.35]" />

      <div className="relative z-10 w-full max-w-3xl text-center">
        <span className="chip mx-auto mb-5 border-brand/30 bg-brand/10 text-ink2">
          <Icon name="swords" size={12} />
          Battle Mode · {lanes} models · anonymous
        </span>

        <h1 className="text-[42px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink">
          Experience the <span className="text-gradient">frontier</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[13.5px] leading-relaxed text-muted">
          One prompt, {lanes} models answering side by side — names hidden until you vote. Ratings update
          with pairwise Elo, so the leaderboard is yours, not the internet&apos;s.
        </p>

        <div className="mt-4 flex items-center justify-center gap-3 text-[11px] text-faint">
          <span className="flex items-center gap-1.5">
            <Icon name="shield" size={12} />
            keys stay on this machine
          </span>
          <span className="opacity-40">·</span>
          <span className="flex items-center gap-1.5">
            <Icon name={state.settings.mode === 'live' ? 'bolt' : 'sparkles'} size={12} />
            {state.settings.mode === 'live' ? 'live providers' : 'offline simulator'}
          </span>
          <span className="opacity-40">·</span>
          <button
            type="button"
            className="flex items-center gap-1.5 underline-offset-2 hover:text-ink2 hover:underline"
            onClick={() => actions.setRoute('settings')}
          >
            <Icon name="key" size={12} />
            bring your own key
          </button>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-2 text-left md:grid-cols-4">
          {cards.map((s) => (
            <button
              key={s.title}
              type="button"
              onClick={() => onPick(s.prompt)}
              className="group flex animate-rise flex-col gap-2 rounded-xl border border-linesoft bg-panel/60 p-3 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:bg-panel2"
              style={{ animationDelay: `${cards.indexOf(s) * 22}ms` }}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-linesoft bg-bgsoft text-muted transition-colors group-hover:text-ink"
                style={{ color: `var(--accent-${LANE_KEYS[cards.indexOf(s) % 4] as LaneKey})` }}
              >
                <Icon name={s.icon} size={14} />
              </span>
              <span className="text-[12px] font-semibold text-ink">{s.title}</span>
              <span className="line-clamp-2 text-[11px] leading-snug text-faint">{s.prompt}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

/** Compact per-lane performance summary, used in the history detail view. */
export function LaneMetricsRow({ turn, battle }: { turn: Turn; battle: Battle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {turn.lanes.map((l) => {
        const m = getModel(l.modelId)
        return (
          <span key={l.lane} className="chip gap-1.5 font-mono text-[10.5px]">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: `var(--accent-${l.lane as LaneKey})` }}
            />
            {battle.revealed ? m.name : `Model ${l.lane.toUpperCase()}`}
            <span className="text-faint">{formatMs(l.ttftMs ?? 0)}</span>
            <span className="text-faint">{formatTokensPerSec(l.tokPerSec)}</span>
          </span>
        )
      })}
    </div>
  )
}
