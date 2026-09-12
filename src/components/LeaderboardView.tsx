import { useMemo, useState } from 'react'
import { useApp } from '../store/store'
import { Icon } from './Icons'
import { OrgTile, Sparkline } from './Bits'
import { rankModels, winProbability } from '../lib/elo'
import { MODELS, getModel } from '../lib/models'
import { cn, formatCompact } from '../lib/utils'
import type { Category } from '../lib/types'
import { CATEGORIES } from '../lib/types'

type SortKey = 'elo' | 'votes' | 'winRate' | 'speed' | 'price' | 'name'

export function LeaderboardView() {
  const { state, actions } = useApp()
  const [category, setCategory] = useState<Category>('overall')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('elo')
  const [desc, setDesc] = useState(true)
  const [minVotes, setMinVotes] = useState(0)

  const rows = useMemo(() => {
    const base = rankModels(state.ratings, category, minVotes).filter((r) => {
      if (!query.trim()) return true
      const m = getModel(r.modelId)
      const q = query.toLowerCase()
      return (
        m.name.toLowerCase().includes(q) ||
        m.org.toLowerCase().includes(q) ||
        m.family.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
      )
    })

    const val = (r: (typeof base)[number]): number | string => {
      switch (sort) {
        case 'votes':
          return category === 'overall' ? r.rating.votes : (r.rating.byCategory[category]?.votes ?? 0)
        case 'winRate':
          return r.winRate
        case 'speed':
          return getModel(r.modelId).speed
        case 'price':
          return getModel(r.modelId).priceOut
        case 'name':
          return getModel(r.modelId).name.toLowerCase()
        default:
          return r.elo
      }
    }

    const sorted = [...base].sort((a, b) => {
      const av = val(a)
      const bv = val(b)
      if (typeof av === 'string' || typeof bv === 'string')
        return desc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv))
      return desc ? bv - av : av - bv
    })
    return sorted
  }, [state.ratings, category, query, sort, desc, minVotes])

  const top = rows.slice(0, 3)
  const maxElo = Math.max(...rows.map((r) => r.elo + r.ci), 1)
  const minElo = Math.min(...rows.map((r) => r.elo - r.ci), 0)
  const totalVotes = Object.values(state.ratings).reduce((n, r) => n + r.votes, 0)

  const header = (key: SortKey, label: string, className?: string) => (
    <th className={cn('px-3 py-2 text-left font-medium', className)}>
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-ink',
          sort === key ? 'text-ink' : 'text-muted',
        )}
        onClick={() => {
          if (sort === key) setDesc((d) => !d)
          else {
            setSort(key)
            setDesc(key !== 'name' && key !== 'price')
          }
        }}
      >
        {label}
        {sort === key && <Icon name={desc ? 'chevronDown' : 'chevronUp'} size={11} />}
      </button>
    </th>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-[26px] font-semibold tracking-[-0.02em] text-ink">
              <Icon name="trophy" size={22} className="text-warn" />
              Leaderboard
            </h1>
            <p className="mt-1 text-[12.5px] text-muted">
              Pairwise Elo from {formatCompact(totalVotes)} votes across {MODELS.length} models ·{' '}
              <span className="text-brand2">
                {state.settings.mode === 'simulated' ? 'seeded + your battles' : 'your battles'}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="relative">
              <Icon
                name="search"
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                className="field h-8 w-52 pl-7 text-[12px]"
                placeholder="Filter models…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn h-8 gap-1.5 text-[12px]"
              onClick={actions.resetRatings}
              title="Restore the seeded leaderboard"
            >
              <Icon name="refresh" size={13} />
              Reset
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-[12px] font-medium capitalize transition-all',
                category === c
                  ? 'border-brand/50 bg-brand/12 text-ink'
                  : 'border-line bg-panel/60 text-muted hover:border-line hover:text-ink',
              )}
            >
              {c}
            </button>
          ))}
          <span className="mx-2 h-4 w-px bg-line" />
          {[0, 100, 1000].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setMinVotes(v)}
              className={cn(
                'rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-all',
                minVotes === v ? 'border-brand/50 bg-brand/12 text-ink' : 'border-line text-muted hover:text-ink',
              )}
            >
              {v === 0 ? 'all' : `≥${v} votes`}
            </button>
          ))}
        </div>

        {top.length === 3 && (
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[1, 0, 2].map((idx, order) => {
              const row = top[idx]!
              const m = getModel(row.modelId)
              const heights = [86, 104, 74]
              return (
                <div
                  key={row.modelId}
                  className={cn(
                    'relative overflow-hidden rounded-2xl border border-linesoft bg-gradient-to-b from-panel2/80 to-panel/40 p-4 transition-all hover:border-brand/35',
                    order === 1 && 'md:-mt-3',
                  )}
                  style={{ minHeight: heights[order] }}
                >
                  <span
                    className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-25 blur-2xl"
                    style={{ background: `var(--accent-${idx === 0 ? 'a' : idx === 1 ? 'b' : 'c'})` }}
                  />
                  <div className="relative flex items-center gap-2">
                    <span
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-lg font-mono text-[12px] font-bold',
                        row.rank === 1
                          ? 'bg-warn/20 text-warn'
                          : row.rank === 2
                            ? 'bg-ink2/15 text-ink2'
                            : 'bg-accent-c/15 text-accent-c',
                      )}
                    >
                      {row.rank}
                    </span>
                    <OrgTile org={m.org} size={22} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">{m.name}</span>
                      <span className="block truncate text-[10.5px] text-faint">{m.org}</span>
                    </span>
                  </div>
                  <div className="relative mt-3 flex items-end justify-between">
                    <span className="tabular font-mono text-[26px] font-semibold leading-none text-ink">
                      {row.elo}
                    </span>
                    <span className="text-right">
                      <span className="block font-mono text-[10.5px] text-faint">±{row.ci.toFixed(1)}</span>
                      <span className="block font-mono text-[10.5px] text-good">
                        {(row.winRate * 100).toFixed(0)}% win
                      </span>
                    </span>
                  </div>
                  <div className="relative mt-2">
                    <Sparkline data={row.rating.history} width={190} height={26} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-xl border border-linesoft">
          <table className="w-full border-collapse text-[12.5px]">
            <thead className="border-b border-linesoft bg-bgsoft/60 text-[10.5px] uppercase tracking-wider">
              <tr>
                <th className="w-12 px-3 py-2 text-left font-medium text-muted">#</th>
                {header('name', 'Model')}
                <th className="px-3 py-2 text-left font-medium text-muted">Org</th>
                {header('elo', 'Elo', 'w-[220px]')}
                {header('votes', 'Votes')}
                {header('winRate', 'Win %')}
                {header('speed', 'tok/s')}
                {header('price', '$/M out')}
                <th className="px-3 py-2 text-left font-medium text-muted">Trend</th>
                <th className="w-24 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const m = getModel(row.modelId)
                const cat = category === 'overall' ? null : row.rating.byCategory[category]
                const votes = cat ? cat.votes : row.rating.votes
                const left = ((row.elo - row.ci - minElo) / Math.max(1, maxElo - minElo)) * 100
                const width = Math.max(1.5, ((row.ci * 2) / Math.max(1, maxElo - minElo)) * 100)
                return (
                  <tr
                    key={row.modelId}
                    className={cn(
                      'group animate-fade-in border-b border-linesoft/60 transition-colors last:border-0 hover:bg-panel2/60',
                      i < 3 && 'bg-brand/[0.03]',
                    )}
                    style={{ animationDelay: `${Math.min(i * 12, 220)}ms` }}
                  >
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          'tabular font-mono text-[12px]',
                          row.rank === 1 ? 'font-bold text-warn' : 'text-faint',
                        )}
                      >
                        {row.rank}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <OrgTile org={m.org} size={20} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-ink">{m.name}</div>
                          <div className="truncate font-mono text-[10px] text-faint">{m.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted">{m.org}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="tabular w-11 shrink-0 font-mono text-[13px] font-semibold text-ink">
                          {row.elo}
                        </span>
                        <span className="relative h-1.5 flex-1 rounded-full bg-linesoft">
                          <span
                            className="absolute inset-y-0 rounded-full bg-gradient-to-r from-brand/60 to-brand2/70"
                            style={{ left: `${left}%`, width: `${width}%` }}
                            title={`95% CI ±${row.ci.toFixed(1)}`}
                          />
                        </span>
                        <span className="tabular w-12 shrink-0 text-right font-mono text-[10px] text-faint">
                          ±{row.ci.toFixed(1)}
                        </span>
                      </div>
                    </td>
                    <td className="tabular px-3 py-2 font-mono text-[11.5px] text-muted">{formatCompact(votes)}</td>
                    <td className="tabular px-3 py-2 font-mono text-[11.5px] text-muted">
                      {(row.winRate * 100).toFixed(1)}%
                    </td>
                    <td className="tabular px-3 py-2 font-mono text-[11.5px] text-muted">{m.speed}</td>
                    <td className="tabular px-3 py-2 font-mono text-[11.5px] text-muted">
                      {m.priceOut === 0 ? '—' : `$${m.priceOut}`}
                    </td>
                    <td className="px-3 py-2">
                      <Sparkline data={row.rating.history} width={72} height={20} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="btn h-7 gap-1 px-2 text-[11px] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        onClick={() => {
                          const b = actions.newBattle(2)
                          actions.setLaneModel(b.id, b.laneOrder[0]!, m.id)
                        }}
                      >
                        <Icon name="swords" size={11} />
                        Battle
                      </button>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-10 text-center text-[12.5px] text-faint">
                    No models match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <Matchup ratings={state.ratings} category={category} />

        <p className="mt-6 text-[11px] leading-relaxed text-faint">
          Elo starts from seeded values in <span className="font-mono">src/lib/models.ts</span>. Every vote you cast
          moves it: K=24, pairwise Bradley-Terry style, per category. Reset any time — the leaderboard is local to
          this machine.
        </p>
      </div>
    </div>
  )
}

function Matchup({
  ratings,
  category,
}: {
  ratings: ReturnType<typeof useApp>['state']['ratings']
  category: Category
}) {
  const [a, setA] = useState(MODELS[0]!.id)
  const [b, setB] = useState(MODELS[3]!.id)
  const ra = ratings[a]
  const rb = ratings[b]
  if (!ra || !rb) return null

  const eloOf = (r: typeof ra) => (category === 'overall' ? r.elo : (r.byCategory[category]?.elo ?? r.elo))
  const pa = winProbability(eloOf(ra), eloOf(rb))
  const ma = getModel(a)
  const mb = getModel(b)

  return (
    <div className="mt-6 rounded-xl border border-linesoft bg-panel/45 p-4">
      <div className="flex items-center gap-2">
        <Icon name="scale" size={14} className="text-brand2" />
        <h2 className="text-[13px] font-semibold text-ink">Head-to-head</h2>
        <span className="text-[11px] text-faint">expected win rate from current ratings</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <select className="field h-8 w-52 text-[12px]" value={a} onChange={(e) => setA(e.target.value)}>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <span className="font-mono text-[11px] text-faint">vs</span>
        <select className="field h-8 w-52 text-[12px]" value={b} onChange={(e) => setB(e.target.value)}>
          {MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[11.5px]">
          <span className="font-semibold text-ink">{ma.name}</span>
          <span className="font-mono text-muted">
            {Math.round(eloOf(ra))} · {(pa * 100).toFixed(1)}%
          </span>
          <span className="font-mono text-muted">
            {(100 - pa * 100).toFixed(1)}% · {Math.round(eloOf(rb))}
          </span>
          <span className="font-semibold text-ink">{mb.name}</span>
        </div>
        <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-linesoft">
          <span
            className="h-full bg-gradient-to-r from-brand to-brand/70 transition-all duration-500"
            style={{ width: `${pa * 100}%` }}
          />
          <span
            className="h-full bg-gradient-to-r from-brand2/70 to-brand2 transition-all duration-500"
            style={{ width: `${(1 - pa) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}
