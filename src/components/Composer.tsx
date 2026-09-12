import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useApp } from '../store/store'
import { Icon } from './Icons'
import { SUGGESTIONS } from '../lib/models'
import { cn, MOD } from '../lib/utils'
import type { Battle, Category } from '../lib/types'
import { CATEGORIES } from '../lib/types'

export function Composer({ battle, busy }: { battle: Battle | null; busy: boolean }) {
  const { state, actions } = useApp()
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)
  const lanes = state.settings.lanes

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`
  }, [value])

  // Focus the composer whenever a battle opens.
  useEffect(() => {
    ref.current?.focus()
  }, [battle?.id])

  const submit = () => {
    const text = value.trim()
    if (!text || busy) return
    setValue('')
    void actions.send(text)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  const showSuggestions = !battle || battle.turns.length === 0

  return (
    <div className="shrink-0 px-5 pb-4 pt-1">
      {showSuggestions && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.slice(0, 6).map((s) => (
            <button
              key={s.title}
              type="button"
              className="chip cursor-pointer transition-all hover:border-brand/50 hover:text-ink"
              onClick={() => {
                setValue(s.prompt)
                actions.patchSettings({})
                ref.current?.focus()
              }}
              title={s.prompt}
            >
              <Icon name={s.icon} size={12} />
              {s.title}
            </button>
          ))}
        </div>
      )}

      <div
        className={cn(
          'relative rounded-2xl border bg-panel/80 shadow-[0_20px_60px_-40px_rgba(0,0,0,.9)] backdrop-blur-xl transition-all',
          busy ? 'border-brand2/40' : 'border-line focus-within:border-brand/55',
        )}
      >
        {busy && (
          <span className="pointer-events-none absolute inset-x-6 -top-px h-px overflow-hidden">
            <span className="block h-px w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-brand2 to-transparent" />
          </span>
        )}

        <textarea
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          spellCheck={false}
          placeholder={
            battle && battle.turns.length
              ? 'Follow up — every lane keeps its own conversation…'
              : 'Ask anything. The same prompt goes to every model, blind.'
          }
          className="no-scrollbar max-h-[260px] w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-faint"
        />

        <div className="flex items-center gap-2 px-3 pb-2.5">
          <Segmented
            label="Lanes"
            value={lanes}
            options={[2, 3, 4]}
            onChange={(n) => {
              actions.patchSettings({ lanes: n })
              if (battle && !battle.turns.length) actions.rerollModels(battle.id)
            }}
          />

          <CategorySelect
            value={battle?.category ?? 'overall'}
            disabled={!!battle && battle.turns.length > 0}
            onChange={(c) => battle && actions.setCategory(c)}
          />

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[10.5px] text-faint lg:inline">
              <span className="kbd">{MOD}</span> <span className="kbd">↵</span> to send
            </span>
            {busy ? (
              <button type="button" className="btn h-8 gap-1.5 px-3 text-[12.5px]" onClick={() => actions.stop()}>
                <Icon name="stop" size={12} />
                Stop
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary h-8 gap-1.5 px-3.5 text-[12.5px] font-semibold"
                onClick={submit}
                disabled={!value.trim()}
              >
                Battle
                <Icon name="send" size={13} strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function Segmented<T extends number | string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: T[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10.5px] uppercase tracking-wider text-faint">{label}</span>
      <div className="flex items-center gap-0.5 rounded-lg border border-line bg-bgsoft p-0.5">
        {options.map((o) => (
          <button
            key={String(o)}
            type="button"
            onClick={() => onChange(o)}
            className={cn(
              'tabular h-6 min-w-6 rounded-md px-1.5 font-mono text-[11px] transition-all',
              value === o ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}

function CategorySelect({
  value,
  onChange,
  disabled,
}: {
  value: Category
  onChange: (c: Category) => void
  disabled?: boolean
}) {
  return (
    <label className={cn('flex items-center gap-1.5', disabled && 'opacity-45')}>
      <span className="text-[10.5px] uppercase tracking-wider text-faint">Category</span>
      <select
        className="field h-7 w-auto cursor-pointer rounded-lg py-0 pl-2 pr-6 text-[11.5px]"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Category)}
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  )
}
