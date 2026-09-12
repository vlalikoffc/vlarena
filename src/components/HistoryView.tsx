import { useMemo, useState } from 'react'
import { useApp } from '../store/store'
import { Icon } from './Icons'
import { OrgTile } from './Bits'
import { getModel } from '../lib/models'
import { cn, formatClock, formatRelative, highlightQuery } from '../lib/utils'
import type { Battle, Category } from '../lib/types'
import { CATEGORIES } from '../lib/types'

export function HistoryView() {
  const { state, actions } = useApp()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [onlyVoted, setOnlyVoted] = useState(false)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return state.battles
      .filter((b) => (category === 'all' ? true : b.category === category))
      .filter((b) => (onlyVoted ? b.turns.some((t) => t.votes.length) : true))
      .filter((b) => {
        if (!q) return true
        if (b.title.toLowerCase().includes(q)) return true
        if (b.laneOrder.some((l) => getModel(b.models[l]!).name.toLowerCase().includes(q))) return true
        return b.turns.some(
          (t) =>
            t.prompt.toLowerCase().includes(q) || t.lanes.some((l) => l.text.toLowerCase().includes(q)),
        )
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [state.battles, query, category, onlyVoted])

  const totalVotes = state.battles.reduce((n, b) => n + b.turns.reduce((m, t) => m + t.votes.length, 0), 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-linesoft bg-bgsoft/40 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-[20px] font-semibold tracking-[-0.02em] text-ink">
              <Icon name="history" size={18} />
              History
            </h1>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {state.battles.length} battles · {totalVotes} votes · full-text search over prompts and answers
            </p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="relative">
              <Icon
                name="search"
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                autoFocus
                className="field h-8 w-64 pl-7 text-[12px]"
                placeholder="Search prompts, answers, models…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-ink"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  <Icon name="x" size={12} />
                </button>
              )}
            </label>

            <button
              type="button"
              onClick={() => setOnlyVoted((v) => !v)}
              className={cn('btn h-8 gap-1.5 text-[12px]', onlyVoted && 'border-brand/50 bg-brand/12 text-ink')}
            >
              <Icon name="crown" size={12} />
              Voted only
            </button>

            <select
              className="field h-8 w-32 text-[12px]"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category | 'all')}
            >
              <option value="all">all categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {results.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Icon name="search" size={26} className="text-faint" />
            <p className="text-[13px] font-medium text-ink2">
              {state.battles.length === 0 ? 'No battles yet' : 'Nothing matches that search'}
            </p>
            <p className="max-w-sm text-[11.5px] leading-relaxed text-faint">
              {state.battles.length === 0
                ? 'Run your first battle and it will show up here with the full transcript.'
                : 'Try a shorter query, or clear the category filter.'}
            </p>
            {state.battles.length === 0 && (
              <button type="button" className="btn btn-primary mt-2 h-8 px-3 text-[12px]" onClick={() => actions.newBattle()}>
                <Icon name="plus" size={13} />
                New battle
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-2">
            {results.map((b) => (
              <BattleRow key={b.id} battle={b} query={query} active={state.activeId === b.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function BattleRow({ battle, query, active }: { battle: Battle; query: string; active: boolean }) {
  const { actions } = useApp()
  const [open, setOpen] = useState(false)
  const models = battle.laneOrder.map((l) => getModel(battle.models[l]!))
  const lastTurn = battle.turns[battle.turns.length - 1]
  const verdict = lastTurn?.votes[0]

  const snippet = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return lastTurn?.prompt.slice(0, 160) ?? ''
    const hay = [
      ...battle.turns.map((t) => t.prompt),
      ...battle.turns.flatMap((t) => t.lanes.map((l) => l.text)),
    ]
    for (const s of hay) {
      const i = s.toLowerCase().indexOf(q)
      if (i >= 0) return `${i > 40 ? '…' : ''}${s.slice(Math.max(0, i - 40), i + 120)}`
    }
    return battle.title
  }, [battle, query, lastTurn])

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border bg-panel/45 transition-all',
        active ? 'border-brand/45' : 'border-linesoft hover:border-line',
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <span className="mt-0.5 flex -space-x-1.5">
          {models.slice(0, 4).map((m, i) => (
            <span key={`${m.id}-${i}`} className="rounded-md ring-2 ring-panel">
              <OrgTile org={battle.revealed ? m.org : 'Hidden'} size={20} />
            </span>
          ))}
        </span>

        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => actions.openBattle(battle.id)}
        >
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-semibold text-ink">{battle.title}</span>
            <span className="chip shrink-0 text-[10px] capitalize">{battle.category}</span>
            {battle.simulated && <span className="chip shrink-0 font-mono text-[10px] text-brand2/90">sim</span>}
            {verdict && (
              <span className="chip shrink-0 border-good/35 bg-good/10 text-[10px] text-good">
                <Icon name={verdict.kind === 'best' ? 'crown' : verdict.kind === 'tie' ? 'scale' : 'thumbsDown'} size={10} />
                {verdict.kind === 'best'
                  ? battle.revealed
                    ? getModel(lastTurn!.lanes.find((l) => l.lane === verdict.lane)?.modelId ?? '').name
                    : `Model ${verdict.lane?.toUpperCase()}`
                  : verdict.kind}
              </span>
            )}
          </div>

          <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-muted">
            {highlightQuery(snippet, query).map(([part, hit], i) =>
              hit ? (
                <mark key={i} className="rounded bg-brand/25 px-0.5 text-ink">
                  {part}
                </mark>
              ) : (
                <span key={i}>{part}</span>
              ),
            )}
          </p>

          <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-faint">
            <span>{formatRelative(battle.updatedAt)}</span>
            <span className="opacity-40">·</span>
            <span>{formatClock(battle.createdAt)}</span>
            <span className="opacity-40">·</span>
            <span>{battle.turns.length} rounds</span>
            <span className="opacity-40">·</span>
            <span>
              {battle.revealed ? models.map((m) => m.name).join(' vs ') : `${models.length} hidden models`}
            </span>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="btn-ghost btn h-7 w-7 p-0"
            onClick={() => setOpen((o) => !o)}
            title={open ? 'Collapse' : 'Expand transcript'}
          >
            <Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} />
          </button>
          <button
            type="button"
            className="btn-ghost btn h-7 w-7 p-0 hover:text-bad"
            onClick={() => actions.deleteBattle(battle.id)}
            title="Delete battle"
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      </div>

      {open && (
        <div className="animate-rise space-y-3 border-t border-linesoft bg-bgsoft/40 p-3">
          {battle.turns.map((turn, ti) => (
            <div key={turn.id}>
              <p className="mb-2 text-[11.5px] font-medium text-ink">
                <span className="mr-1.5 font-mono text-faint">R{ti + 1}</span>
                {turn.prompt}
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {turn.lanes.map((l) => (
                  <div key={l.lane} className="rounded-lg border border-linesoft bg-panel/70 p-2.5">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: `var(--accent-${l.lane})` }}
                      />
                      <span className="text-[11px] font-semibold text-ink2">
                        {battle.revealed ? getModel(l.modelId).name : `Model ${l.lane.toUpperCase()}`}
                      </span>
                      <span className="ml-auto font-mono text-[10px] text-faint">
                        {l.tokens} tok · {l.tokPerSec.toFixed(0)}/s
                      </span>
                    </div>
                    <p className="line-clamp-6 whitespace-pre-wrap text-[11px] leading-relaxed text-muted">
                      {l.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
