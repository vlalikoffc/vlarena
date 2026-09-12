import { useCallback, useEffect } from 'react'
import { AppProvider, useApp } from './store/store'
import { Titlebar } from './components/Titlebar'
import { Sidebar } from './components/Sidebar'
import { BattleView } from './components/BattleView'
import { LeaderboardView } from './components/LeaderboardView'
import { HistoryView } from './components/HistoryView'
import { SettingsView } from './components/SettingsView'
import { AboutView } from './components/AboutView'
import { CommandPalette } from './components/CommandPalette'
import { Toasts } from './components/Toasts'
import { Icon } from './components/Icons'
import { isMac } from './lib/utils'

function View() {
  const { state } = useApp()
  switch (state.route) {
    case 'leaderboard':
      return <LeaderboardView />
    case 'history':
      return <HistoryView />
    case 'settings':
      return <SettingsView />
    case 'about':
      return <AboutView />
    case 'battle':
    default:
      return <BattleView />
  }
}

function Boot() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-bg">
      <span className="flex h-11 w-11 animate-pop items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand2 text-white shadow-xl shadow-brand/30">
        <Icon name="logo" size={24} strokeWidth={2.2} />
      </span>
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint">loading arena</span>
    </div>
  )
}

function Shell() {
  const { state, actions, activeBattle } = useApp()

  const isTyping = (el: EventTarget | null): boolean => {
    if (!(el instanceof HTMLElement)) return false
    const tag = el.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
  }

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const mod = isMac() ? e.metaKey : e.ctrlKey
      const typing = isTyping(e.target)

      // --- global chords (work while typing too) ---
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        actions.setPalette(!state.paletteOpen)
        return
      }
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        actions.newBattle()
        return
      }
      if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        actions.toggleSidebar()
        return
      }
      if (mod && e.key === ',') {
        e.preventDefault()
        actions.setRoute('settings')
        return
      }
      if (mod && e.key.toLowerCase() === 'r' && !e.shiftKey) {
        e.preventDefault()
        actions.reveal(activeBattle?.id)
        return
      }

      if (e.key === 'Escape') {
        if (state.paletteOpen) {
          actions.setPalette(false)
          return
        }
        if (actions.isStreaming(activeBattle?.id ?? undefined)) {
          e.preventDefault()
          actions.stop(activeBattle?.id ?? undefined)
        }
        return
      }

      if (typing || mod || e.metaKey || e.ctrlKey || e.altKey) return

      // --- vote shortcuts, only on the latest unvoted round ---
      const latest = activeBattle?.turns[activeBattle.turns.length - 1]
      if (!latest || latest.votes.length || !activeBattle) return
      if (actions.isStreaming(activeBattle.id)) return

      const laneIndex = Number(e.key) - 1
      if (laneIndex >= 0 && laneIndex < activeBattle.laneOrder.length) {
        e.preventDefault()
        actions.vote(latest.id, 'best', activeBattle.laneOrder[laneIndex])
        return
      }
      if (e.key.toLowerCase() === 't') {
        e.preventDefault()
        actions.vote(latest.id, 'tie')
      } else if (e.key.toLowerCase() === 'b') {
        e.preventDefault()
        actions.vote(latest.id, 'both-bad')
      }
    },
    [actions, activeBattle, state.paletteOpen],
  )

  useEffect(() => {
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKey])

  if (!state.hydrated) return <Boot />

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-bg text-ink">
      <Titlebar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <View />
        </main>
      </div>
      <CommandPalette />
      <Toasts />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
