import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../store/store'
import { Icon } from './Icons'
import { OrgTile } from './Bits'
import { MODELS, getModel } from '../lib/models'
import { cn, formatRelative, MOD } from '../lib/utils'

interface Command {
  id: string
  group: string
  label: string
  hint?: string
  icon: string
  keywords?: string
  run: () => void
}

/** Subsequence fuzzy score; higher is better, -1 means no match. */
function score(text: string, query: string): number {
  const t = text.toLowerCase()
  const q = query.toLowerCase().trim()
  if (!q) return 1
  const idx = t.indexOf(q)
  if (idx === 0) return 1000
  if (idx > 0) return 600 - idx
  let ti = 0
  let s = 0
  let streak = 0
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found < 0) return -1
    streak = found === ti ? streak + 1 : 0
    s += 10 + streak * 4 - Math.min(20, found - ti)
    ti = found + 1
  }
  return s
}

export function CommandPalette() {
  const { state, actions, activeBattle } = useApp()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const open = state.paletteOpen

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
    }
  }, [open])

  const commands = useMemo<Command[]>(() => {
    const battle = activeBattle
    const latest = battle?.turns[battle.turns.length - 1]
    const out: Command[] = [
      {
        id: 'new-battle',
        group: 'Actions',
        label: 'New battle',
        icon: 'plus',
        hint: `${MOD}+N`,
        keywords: 'arena start fresh models',
        run: () => {
          actions.newBattle()
          actions.setRoute('battle')
        },
      },
      {
        id: 'go-battle',
        group: 'Go to',
        label: 'Battle',
        icon: 'swords',
        keywords: 'arena home',
        run: () => actions.setRoute('battle'),
      },
      {
        id: 'go-leaderboard',
        group: 'Go to',
        label: 'Leaderboard',
        icon: 'trophy',
        keywords: 'elo ratings rank',
        run: () => actions.setRoute('leaderboard'),
      },
      {
        id: 'go-history',
        group: 'Go to',
        label: 'History',
        icon: 'history',
        keywords: 'search past battles',
        run: () => actions.setRoute('history'),
      },
      {
        id: 'go-settings',
        group: 'Go to',
        label: 'Settings',
        icon: 'sliders',
        hint: `${MOD},`,
        keywords: 'providers keys routing theme',
        run: () => actions.setRoute('settings'),
      },
      {
        id: 'go-about',
        group: 'Go to',
        label: 'About vlarena',
        icon: 'info',
        keywords: 'help shortcuts credits',
        run: () => actions.setRoute('about'),
      },
      {
        id: 'theme',
        group: 'Actions',
        label: `Switch to ${state.settings.theme === 'dark' ? 'light' : 'dark'} theme`,
        icon: state.settings.theme === 'dark' ? 'sun' : 'moon',
        keywords: 'appearance dark light',
        run: () =>
          actions.patchSettings({ theme: state.settings.theme === 'dark' ? 'light' : 'dark' }),
      },
      {
        id: 'mode',
        group: 'Actions',
        label: `Switch to ${state.settings.mode === 'simulated' ? 'live providers' : 'offline simulator'}`,
        icon: 'bolt',
        keywords: 'simulated live provider api key',
        run: () =>
          actions.patchSettings({ mode: state.settings.mode === 'simulated' ? 'live' : 'simulated' }),
      },
      {
        id: 'lanes',
        group: 'Actions',
        label: `Cycle lane count (now ${state.settings.lanes})`,
        icon: 'layers',
        keywords: 'models count grid',
        run: () => actions.patchSettings({ lanes: state.settings.lanes >= 4 ? 2 : state.settings.lanes + 1 }),
      },
    ]

    if (battle) {
      out.push({
        id: 'reveal',
        group: 'Battle',
        label: battle.revealed ? 'Models already revealed' : 'Reveal models',
        icon: 'eye',
        hint: `${MOD}+R`,
        run: () => actions.reveal(battle.id),
      })
      if (latest && !latest.votes.length) {
        out.push({
          id: 'tie',
          group: 'Battle',
          label: 'Vote: tie',
          icon: 'scale',
          hint: 'T',
          run: () => actions.vote(latest.id, 'tie'),
        })
        out.push({
          id: 'both-bad',
          group: 'Battle',
          label: 'Vote: both bad',
          icon: 'thumbsDown',
          hint: 'B',
          run: () => actions.vote(latest.id, 'both-bad'),
        })
      }
      out.push({
        id: 'regenerate',
        group: 'Battle',
        label: 'Regenerate answers',
        icon: 'refresh',
        keywords: 'rerun retry',
        run: () => latest && void actions.regenerate(latest.id),
      })
      out.push({
        id: 'reroll',
        group: 'Battle',
        label: 'Reroll models',
        icon: 'dice',
        keywords: 'random new matchup',
        run: () => actions.rerollModels(battle.id),
      })
      out.push({
        id: 'stop',
        group: 'Battle',
        label: 'Stop streaming',
        icon: 'stop',
        hint: 'Esc',
        run: () => actions.stop(battle.id),
      })
      out.push({
        id: 'delete',
        group: 'Battle',
        label: 'Delete this battle',
        icon: 'trash',
        run: () => actions.deleteBattle(battle.id),
      })
    }

    out.push({
      id: 'reset-ratings',
      group: 'Data',
      label: 'Reset ratings to seed',
      icon: 'refresh',
      keywords: 'elo leaderboard restore',
      run: actions.resetRatings,
    })
    out.push({
      id: 'clear-history',
      group: 'Data',
      label: 'Clear all history',
      icon: 'trash',
      keywords: 'delete battles wipe',
      run: () => {
        if (confirm('Delete all battle history? Ratings are kept.')) actions.clearHistory()
      },
    })

    // Recent battles
    for (const b of state.battles.slice(0, 8)) {
      out.push({
        id: `open-${b.id}`,
        group: 'Recent battles',
        label: b.title,
        hint: formatRelative(b.updatedAt),
        icon: 'message',
        keywords: b.laneOrder.map((l) => getModel(b.models[l]!).name).join(' '),
        run: () => actions.openBattle(b.id),
      })
    }

    // Models → start a battle with them
    for (const m of MODELS) {
      out.push({
        id: `model-${m.id}`,
        group: 'Models',
        label: `Battle with ${m.name}`,
        hint: m.org,
        icon: 'swords',
        keywords: `${m.id} ${m.family}`,
        run: () => {
          const b = actions.newBattle(2)
          actions.setLaneModel(b.id, b.laneOrder[0]!, m.id)
        },
      })
    }

    return out
  }, [actions, activeBattle, state.battles, state.settings])

  const matches = useMemo(() => {
    const q = query.trim()
    const scored = commands
      .map((c) => ({
        c,
        s: Math.max(
          score(c.label, q),
          score(`${c.group} ${c.keywords ?? ''}`, q) * 0.6,
        ),
      }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
    return scored.map((x) => x.c)
  }, [commands, query])

  useEffect(() => {
    setCursor((c) => Math.min(c, Math.max(0, matches.length - 1)))
  }, [matches.length])

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor, open])

  if (!open) return null

  const run = (c: Command) => {
    actions.setPalette(false)
    // let the overlay unmount first so focus lands where it should
    setTimeout(() => c.run(), 0)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => (c + 1) % Math.max(1, matches.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => (c - 1 + matches.length) % Math.max(1, matches.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const c = matches[cursor]
      if (c) run(c)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      actions.setPalette(false)
    }
  }

  let lastGroup = ''

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]">
      <div
        className="absolute inset-0 animate-fade-in bg-black/55 backdrop-blur-sm"
        onClick={() => actions.setPalette(false)}
      />
      <div
        className="relative w-full max-w-xl animate-pop overflow-hidden rounded-2xl border border-line bg-panel/95 shadow-[0_40px_120px_-40px_rgba(0,0,0,1)] backdrop-blur-2xl"
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2.5 border-b border-linesoft px-4">
          <Icon name="search" size={15} className="shrink-0 text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search actions, battles, models…"
            className="h-12 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-faint"
          />
          <span className="kbd shrink-0">esc</span>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {matches.length === 0 && (
            <p className="px-3 py-8 text-center text-[12.5px] text-faint">No matches for “{query}”.</p>
          )}
          {matches.map((c, i) => {
            const showGroup = c.group !== lastGroup
            lastGroup = c.group
            return (
              <div key={c.id}>
                {showGroup && (
                  <p className="px-2.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
                    {c.group}
                  </p>
                )}
                <button
                  type="button"
                  data-idx={i}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => run(c)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                    i === cursor ? 'bg-brand/15 text-ink' : 'text-ink2 hover:bg-panel2',
                  )}
                >
                  {c.group === 'Models' ? (
                    <OrgTile org={getModel(c.id.replace('model-', '')).org} size={18} />
                  ) : (
                    <span className={cn('shrink-0', i === cursor ? 'text-brand2' : 'text-muted')}>
                      <Icon name={c.icon} size={15} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{c.label}</span>
                  {c.hint && <span className="shrink-0 font-mono text-[10.5px] text-faint">{c.hint}</span>}
                </button>
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-3 border-t border-linesoft bg-bgsoft/60 px-4 py-2 text-[10.5px] text-faint">
          <span className="flex items-center gap-1">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span> navigate
          </span>
          <span className="flex items-center gap-1">
            <span className="kbd">↵</span> run
          </span>
          <span className="ml-auto tabular">{matches.length} results</span>
        </div>
      </div>
    </div>
  )
}
