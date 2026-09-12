/** Tiny SVG sparkline + org tile + model badge. */

import { memo, useId } from 'react'
import { orgHue, orgInitials } from '../lib/models'
import { cn, formatCompact } from '../lib/utils'

export const Sparkline = memo(function Sparkline({
  data,
  width = 76,
  height = 22,
  positive,
}: {
  data: number[]
  width?: number
  height?: number
  positive?: boolean
}) {
  // Hooks must run before any early return.
  const rawId = useId()
  const id = `sp${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`

  if (!data || data.length < 2) {
    return <div className="h-[22px] w-[76px] rounded bg-linesoft/60" />
  }
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = Math.max(1, max - min)
  const step = width / (data.length - 1)
  const pts = data.map((v, i) => [i * step, height - ((v - min) / span) * (height - 3) - 1.5] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  const rising = data[data.length - 1]! >= data[0]!
  const color = positive === undefined ? (rising ? 'var(--good)' : 'var(--bad)') : positive ? 'var(--good)' : 'var(--bad)'

  return (
    <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r="1.8" fill={color} />
    </svg>
  )
})

export function OrgTile({
  org,
  size = 22,
  className,
}: {
  org: string
  size?: number
  className?: string
}) {
  const hue = orgHue(org)
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-md font-semibold', className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        letterSpacing: '-0.02em',
        color: `hsl(${hue} 85% 74%)`,
        background: `linear-gradient(150deg, hsl(${hue} 60% 22% / .9), hsl(${(hue + 40) % 360} 55% 14% / .9))`,
        boxShadow: `inset 0 0 0 1px hsl(${hue} 70% 60% / .28)`,
      }}
      title={org}
    >
      {orgInitials(org)}
    </span>
  )
}

export function StatPill({
  icon,
  label,
  value,
  tone = 'default',
}: {
  icon?: string
  label: string
  value: string | number
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'brand'
}) {
  const tones: Record<string, string> = {
    default: 'text-muted',
    good: 'text-good',
    warn: 'text-warn',
    bad: 'text-bad',
    brand: 'text-brand2',
  }
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      {icon && <span className={cn('opacity-70', tones[tone])}>{icon}</span>}
      <span className={cn('tabular font-mono text-[11px]', tones[tone])}>{value}</span>
    </span>
  )
}

export function EloValue({ value, ci }: { value: number; ci?: number }) {
  return (
    <span className="tabular font-mono text-[13px] font-semibold text-ink">
      {Math.round(value)}
      {ci !== undefined && <span className="ml-1 text-[10.5px] font-normal text-faint">±{ci.toFixed(1)}</span>}
    </span>
  )
}

export function VotesBadge({ votes }: { votes: number }) {
  return <span className="tabular font-mono text-[11px] text-muted">{formatCompact(votes)} votes</span>
}
