/** Minimal inline SVG icon set (24×24, stroke-based). */

import type { ReactNode } from 'react'

const P: Record<string, ReactNode> = {
  logo: (
    <>
      <path d="M3 5l6 7-6 7" />
      <path d="M21 5l-6 7 6 7" />
      <path d="M10.5 12h3" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  swords: (
    <>
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
      <path d="m13 19 6-6" />
      <path d="m16 16 4 4" />
      <path d="M10.5 6.5 22 18v3h-3L7.5 9.5" />
      <path d="m8 4 4 4" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
      <path d="M12 14v3M8 21h8M10 17h4v4h-4z" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 21v-6M4 11V3M12 21v-9M12 8V3M20 21v-4M20 13V3" />
      <path d="M1 15h6M9 8h6M17 17h6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v6h-6" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
  crown: (
    <>
      <path d="M3 18h18" />
      <path d="m4 18-1-11 5.5 4L12 4l3.5 7L21 7l-1 11" />
    </>
  ),
  equals: <path d="M5 9h14M5 15h14" />,
  thumbsDown: (
    <>
      <path d="M17 14V2H9l-2 5v7h2l-3 8 4-4h6" />
      <path d="M7 10v12" />
    </>
  ),
  send: <path d="M12 19V5M5 12l7-7 7 7" />,
  arrowUp: <path d="M12 19V5M5 12l7-7 7 7" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 1.5v2M12 20.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1.5 12h2M20.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </>
  ),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  monitor: (
    <>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </>
  ),
  terminal: <path d="m4 17 6-5-6-5M12 19h8" />,
  chart: <path d="M3 3v18h18M7 15l4-6 3 4 5-8" />,
  gamepad: (
    <>
      <path d="M6 11h4M8 9v4M15 10h.01M18 12h.01" />
      <path d="M17.3 5H6.7A4.7 4.7 0 0 0 2 9.7v4.6A4.7 4.7 0 0 0 6.7 19c1.7 0 3-1 4.3-2h2c1.3 1 2.6 2 4.3 2A4.7 4.7 0 0 0 22 14.3V9.7A4.7 4.7 0 0 0 17.3 5z" />
    </>
  ),
  layout: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </>
  ),
  code: <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />,
  sparkles: (
    <>
      <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15z" />
    </>
  ),
  store: (
    <>
      <path d="M3 9 4.5 4h15L21 9" />
      <path d="M3 9h18v11H3z" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </>
  ),
  keyboard: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V4h8v2" />
      <path d="m6 6 1 14h10l1-14" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M9 9h.01M15 15h.01M15 9h.01M9 15h.01M12 12h.01" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  bolt: <path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  gauge: (
    <>
      <path d="M4.5 17.5a9 9 0 1 1 15 0" />
      <path d="m12 14 4-4" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  panelLeft: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </>
  ),
  command: (
    <>
      <path d="M15 6a3 3 0 1 1 3 3h-3V6zM9 6a3 3 0 1 0-3 3h3V6z" />
      <path d="M15 18a3 3 0 1 0 3-3h-3v3zM9 18a3 3 0 1 1-3-3h3v3z" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </>
  ),
  download: <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  filter: <path d="M3 5h18l-7 8v6l-4-2v-4z" />,
  sort: <path d="M7 3v18M4 6l3-3 3 3M17 21V3M14 18l3 3 3-3" />,
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  layers: <path d="m12 2 10 5-10 5L2 7l10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />,
  key: (
    <>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.5 12.5 8-8M17 6l2 2 2-2-2-2" />
    </>
  ),
  shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  play: <path d="M6 3.5 20 12 6 20.5v-17z" />,
  flag: <path d="M4 22V4h12l-2 4 2 4H4" />,
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  github: (
    <>
      <path d="M15 22v-3.2a2.8 2.8 0 0 0-.8-2.1c2.7-.3 5.5-1.3 5.5-6a4.7 4.7 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.3s-1-.3-3.3 1.2a11.3 11.3 0 0 0-6 0C6.7 3.9 5.7 4.2 5.7 4.2a4.3 4.3 0 0 0-.1 3.3A4.7 4.7 0 0 0 4.3 10.7c0 4.7 2.8 5.7 5.5 6a2.8 2.8 0 0 0-.8 2.1V22" />
      <path d="M9 20.5c-3 .9-4-1.3-5.3-1.7" />
    </>
  ),
  cpu: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
    </>
  ),
  scale: (
    <>
      <path d="M12 3v18M7 21h10" />
      <path d="M5 7h14M5 7 2 14h6L5 7zM19 7l-3 7h6l-3-7z" />
    </>
  ),
  hash: <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />,
}

export type IconName = keyof typeof P | string

export function Icon({
  name,
  size = 16,
  className,
  strokeWidth = 1.7,
}: {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {P[name] ?? P.info}
    </svg>
  )
}
