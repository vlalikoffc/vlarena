import { useMemo } from 'react'
import { useApp } from '../store/store'
import { Icon } from './Icons'
import { OrgTile } from './Bits'
import { cn, formatRelative, MOD } from '../lib/utils'
import { getModel } from '../lib/models'
import type { Route } from '../lib/types'

const NAV: Array<{ route: Route; label: string; icon: string; hint?: string }> = [
  { route: 'battle', label: 'Battle', icon: 'swords', hint: `${MOD}+N` },
  { route: 'leaderboard', label: 'Leaderboard', icon: 'trophy' },
  { route: 'history', label: 'History', icon: 'history' },
  { route: 'settings', label: 'Settings', icon: 'sliders', hint: `${MOD},` },
  { route: 'about', label: 'About', icon: 'info' },
]

export function Sidebar() {
  const { state, actions } = useApp()
  const collapsed = state.sidebarCollapsed

  const recent = useMemo(
    () =>
      [...state.battles]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 12),
    [state.battles],
  )

  if (collapsed) {
    return (
      <aside className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-linesoft bg-bgsoft/50 py-3">
        {NAV.map((item) => (
          <button
            key={item.route}
            type="button"
            onClick={() => actions.setRoute(item.route)}
            title={item.label}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
              state.route === item.route
                ? 'bg-brand/15 text-ink'
                : 'text-muted hover:bg-panel2 hover:text-ink',
            )}
          >
            <Icon name={item.icon} size={17} />
          </button>
        ))}
        <div className="mt-auto flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={actions.toggleSidebar}
            title="Expand sidebar"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-panel2 hover:text-ink"
          >
            <Icon name="chevronRight" size={16} />
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-linesoft bg-bgsoft/50">
      <div className="p-3">
        <button
          type="button"
          className="btn btn-primary h-9 w-full justify-start gap-2 text-[13px] font-semibold"
          onClick={() => {
            actions.newBattle()
            actions.setRoute('battle')
          }}
        >
          <Icon name="plus" size={15} strokeWidth={2.2} />
          New battle
          <span className="ml-auto flex items-center gap-1 opacity-70">
            <span className="kbd border-white/20 bg-black/20 text-white/80">{MOD}</span>
            <span className="kbd border-white/20 bg-black/20 text-white/80">N</span>
          </span>
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 px-3">
        {NAV.map((item) => (
          <button
            key={item.route}
            type="button"
            className="nav-item"
            data-active={state.route === item.route}
            onClick={() => actions.setRoute(item.route)}
          >
            <Icon name={item.icon} size={16} />
            <span className="font-medium">{item.label}</span>
            {item.hint && <span className="ml-auto text-[10.5px] text-faint">{item.hint}</span>}
            {item.route === 'history' && state.battles.length > 0 && (
              <span className="chip ml-auto px-1.5 py-0 text-[10px]">{state.battles.length}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-5 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-4 pb-1.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint">Recent</span>
          {state.battles.length > 0 && (
            <button
              type="button"
              className="text-[10.5px] text-faint transition-colors hover:text-bad"
              onClick={() => {
                if (confirm('Delete all battle history? Ratings are kept.')) actions.clearHistory()
              }}
            >
              clear
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {recent.length === 0 && (
            <p className="px-2 py-3 text-[11.5px] leading-relaxed text-faint">
              No battles yet. Start one above — models stay anonymous until you vote.
            </p>
          )}
          {recent.map((b) => {
            const models = b.laneOrder.map((l) => getModel(b.models[l]!))
            const winner = lastWinner(b)
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => actions.openBattle(b.id)}
                className={cn(
                  'group mb-0.5 flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors',
                  state.activeId === b.id && state.route === 'battle'
                    ? 'bg-panel2'
                    : 'hover:bg-panel2/60',
                )}
              >
                <span className="mt-0.5 flex -space-x-1.5">
                  {models.slice(0, 3).map((m) => (
                    <span key={m.id} className="ring-2 ring-bgsoft rounded-md">
                      <OrgTile org={b.revealed ? m.org : 'Hidden'} size={18} />
                    </span>
                  ))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-ink2 group-hover:text-ink">
                    {b.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-faint">
                    <span>{formatRelative(b.updatedAt)}</span>
                    <span className="opacity-40">·</span>
                    <span>{b.laneOrder.length} lanes</span>
                    {winner && (
                      <>
                        <span className="opacity-40">·</span>
                        <span className="text-good">voted</span>
                      </>
                    )}
                    {b.simulated && (
                      <>
                        <span className="opacity-40">·</span>
                        <span className="text-brand2/80">sim</span>
                      </>
                    )}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="border-t border-linesoft p-3">
        <div className="flex items-center justify-between text-[10.5px] text-faint">
          <span className="flex items-center gap-1.5">
            <Icon name="keyboard" size={12} />
            <button type="button" className="hover:text-ink2" onClick={() => actions.setPalette(true)}>
              Shortcuts
            </button>
          </span>
          <span className="tabular font-mono">
            {state.battles.reduce((n, b) => n + b.turns.reduce((m, t) => m + t.votes.length, 0), 0)} votes
          </span>
        </div>
      </div>
    </aside>
  )
}

function lastWinner(b: { turns: Array<{ votes: Array<{ kind: string; lane?: string }> }> }): string | null {
  for (let i = b.turns.length - 1; i >= 0; i--) {
    const v = b.turns[i]!.votes[0]
    if (v) return v.lane ?? v.kind
  }
  return null
}
