import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useApp } from '../store/store'
import { Icon } from './Icons'
import { MOD, cn } from '../lib/utils'
import { appInfo, isTauri, OS_NAME, windowClose, windowMinimize, windowToggleMaximize } from '../lib/platform'
import type { AppInfo } from '../lib/platform'

/**
 * Set to true (and `decorations: false` in tauri.conf.json) if you want
 * fully custom window chrome. Off by default: native frames behave better
 * across Windows/Linux window managers.
 */
const CUSTOM_WINDOW_CONTROLS = false

export function Titlebar() {
  const { state, actions } = useApp()
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    void appInfo().then(setInfo)
  }, [])

  const showControls = CUSTOM_WINDOW_CONTROLS && isTauri() && OS_NAME !== 'macos'
  // With titleBarStyle: Overlay on macOS the traffic lights float over the
  // left edge of the titlebar — leave them room.
  const macTrafficLights = isTauri() && OS_NAME === 'macos'
  const live = state.settings.mode === 'live'

  return (
    <header
      className={cn(
        'relative z-40 flex h-12 shrink-0 items-center gap-3 border-b border-linesoft bg-bgsoft/70 backdrop-blur-xl',
        macTrafficLights ? 'pl-[76px] pr-3' : 'px-3',
      )}
    >
      <button
        type="button"
        className="btn-ghost no-drag btn h-8 w-8 p-0"
        onClick={actions.toggleSidebar}
        title={`Toggle sidebar (${MOD}+B)`}
        aria-label="Toggle sidebar"
      >
        <Icon name="panelLeft" size={16} />
      </button>

      <div className="no-drag flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-brand to-brand2 text-white shadow-lg shadow-brand/25">
          <Icon name="logo" size={14} strokeWidth={2.2} />
        </span>
        <span className="text-[13.5px] font-semibold tracking-tight text-ink">vlarena</span>
        <span className="chip ml-1 border-line/70 font-mono text-[10px] text-faint">
          v{info?.version ?? '0.1.0'}
        </span>
      </div>

      {/* The empty middle of the titlebar is the window drag handle. */}
      <div className="drag-region h-full flex-1" data-tauri-drag-region />

      <div className="no-drag flex items-center gap-1.5">
        <span
          className="chip"
          style={{
            borderColor: live ? 'color-mix(in oklab, var(--good) 45%, transparent)' : 'var(--line)',
            color: live ? 'var(--good)' : 'var(--muted)',
          }}
          title={live ? 'Calling real provider endpoints' : 'Offline simulator — no network, no keys'}
        >
          <span
            className="h-1.5 w-1.5 rounded-full animate-pulse-dot"
            style={{ background: live ? 'var(--good)' : 'var(--brand2)' }}
          />
          {live ? 'LIVE' : 'SIM'}
        </span>

        <button
          type="button"
          className="btn h-8 gap-1.5 px-2 text-[12px]"
          onClick={() => actions.setPalette(true)}
          title="Command palette"
        >
          <Icon name="search" size={13} />
          <span className="hidden text-muted sm:inline">Search or jump to…</span>
          <span className="kbd ml-1">{MOD}</span>
          <span className="kbd">K</span>
        </button>

        <ThemeButton />

        {showControls && (
          <div className="ml-1 flex items-center gap-1 border-l border-linesoft pl-1">
            <WinBtn label="Minimize" onClick={windowMinimize}>
              <path d="M5 12h14" />
            </WinBtn>
            <WinBtn label="Maximize" onClick={windowToggleMaximize}>
              <rect x="5" y="5" width="14" height="14" rx="2" />
            </WinBtn>
            <WinBtn label="Close" onClick={windowClose} danger>
              <path d="M6 6l12 12M18 6 6 18" />
            </WinBtn>
          </div>
        )}
      </div>
    </header>
  )
}

function WinBtn({
  label,
  onClick,
  children,
  danger,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex h-7 w-9 items-center justify-center rounded-md text-muted transition-colors hover:text-ink ${
        danger ? 'hover:bg-bad hover:text-white' : 'hover:bg-raised'
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        {children}
      </svg>
    </button>
  )
}

function ThemeButton() {
  const { state, actions } = useApp()
  const order = ['dark', 'light', 'system'] as const
  const next = () => {
    const i = order.indexOf(state.settings.theme)
    actions.patchSettings({ theme: order[(i + 1) % order.length]! })
  }
  const icon = state.settings.theme === 'light' ? 'sun' : state.settings.theme === 'dark' ? 'moon' : 'monitor'
  return (
    <button
      type="button"
      className="btn-ghost btn h-8 w-8 p-0"
      onClick={next}
      title={`Theme: ${state.settings.theme}`}
      aria-label="Cycle theme"
    >
      <Icon name={icon} size={15} />
    </button>
  )
}
