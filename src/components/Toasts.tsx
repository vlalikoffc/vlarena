import { useApp } from '../store/store'
import { Icon } from './Icons'
import { cn } from '../lib/utils'

const KIND_STYLE = {
  info: { icon: 'info', color: 'var(--brand2)', ring: 'color-mix(in oklab, var(--brand2) 35%, transparent)' },
  success: { icon: 'check', color: 'var(--good)', ring: 'color-mix(in oklab, var(--good) 35%, transparent)' },
  error: { icon: 'alert', color: 'var(--bad)', ring: 'color-mix(in oklab, var(--bad) 40%, transparent)' },
} as const

export function Toasts() {
  const { state, actions } = useApp()
  if (!state.toasts.length) return null

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[90] flex w-[340px] flex-col gap-2">
      {state.toasts.map((t) => {
        const s = KIND_STYLE[t.kind]
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex animate-slide-left items-start gap-2.5 rounded-xl border border-line bg-panel/95 p-3 shadow-2xl backdrop-blur-xl"
            style={{ boxShadow: `0 18px 44px -22px ${s.ring}, 0 2px 8px -4px rgb(0 0 0 / .5)` }}
            role="status"
          >
            <span
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
              style={{ color: s.color, background: `color-mix(in oklab, ${s.color} 14%, transparent)` }}
            >
              <Icon name={s.icon} size={13} strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-ink">{t.title}</p>
              {t.body && <p className="mt-0.5 break-words text-[11.5px] leading-snug text-muted">{t.body}</p>}
            </div>
            <button
              type="button"
              onClick={() => actions.dismissToast(t.id)}
              className={cn('shrink-0 rounded p-1 text-faint transition-colors hover:bg-raised hover:text-ink')}
              aria-label="Dismiss"
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
