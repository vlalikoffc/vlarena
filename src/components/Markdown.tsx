/**
 * Streaming-friendly Markdown renderer.
 *
 * Hand-rolled on purpose: it has to tolerate half-written input (unterminated
 * fences, partial bold markers) without flickering, and it re-renders on every
 * token — so no heavy dependencies and no full re-parse of code blocks unless
 * their content actually changed.
 */

import { memo, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '../lib/utils'
import { guessLang, highlight, normalizeLang } from '../lib/highlight'

export const Markdown = memo(function Markdown({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return <div className={cn('md', className)}>{parseBlocks(text)}</div>
})

/* ------------------------------------------------------------------ */

function parseBlocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const out: ReactNode[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]!

    if (!line.trim()) {
      i++
      continue
    }

    // fenced code -------------------------------------------------
    const fence = /^````*([^\s`]*)\s*$/.exec(line)
    if (fence) {
      const ticks = /^`+/.exec(line)![0].length
      const lang = fence[1]
      const body: string[] = []
      i++
      let closed = false
      while (i < lines.length) {
        if (new RegExp(`^\`{${ticks},}\\s*$`).test(lines[i]!)) {
          closed = true
          i++
          break
        }
        body.push(lines[i]!)
        i++
      }
      out.push(
        <CodeBlock key={key++} code={body.join('\n')} lang={lang} streaming={!closed} />,
      )
      continue
    }

    // heading -----------------------------------------------------
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1]!.length
      const content = parseInline(heading[2]!)
      const Tag = (`h${Math.min(level, 4)}`) as 'h1' | 'h2' | 'h3' | 'h4'
      out.push(<Tag key={key++}>{content}</Tag>)
      i++
      continue
    }

    // horizontal rule ---------------------------------------------
    if (/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/.test(line)) {
      out.push(<hr key={key++} />)
      i++
      continue
    }

    // blockquote ---------------------------------------------------
    if (/^\s{0,3}>/.test(line)) {
      const body: string[] = []
      while (i < lines.length && (/^\s{0,3}>/.test(lines[i]!) || (lines[i]!.trim() && body.length))) {
        if (!/^\s{0,3}>/.test(lines[i]!) && !lines[i]!.trim()) break
        body.push(lines[i]!.replace(/^\s{0,3}>\s?/, ''))
        i++
      }
      out.push(<blockquote key={key++}>{parseBlocks(body.join('\n'))}</blockquote>)
      continue
    }

    // table --------------------------------------------------------
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1]!)) {
      const rows: string[][] = []
      const header = splitRow(line)
      i += 2
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) {
        rows.push(splitRow(lines[i]!))
        i++
      }
      out.push(
        <table key={key++}>
          <thead>
            <tr>
              {header.map((c, j) => (
                <th key={j}>{parseInline(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci}>{parseInline(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      )
      continue
    }

    // list ---------------------------------------------------------
    if (/^\s*([-*+]|\d{1,9}[.)])\s+/.test(line)) {
      const { node, next } = parseList(lines, i, key++)
      out.push(node)
      i = next
      continue
    }

    // paragraph ----------------------------------------------------
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^```/.test(lines[i]!) &&
      !/^(#{1,6})\s+/.test(lines[i]!) &&
      !/^\s{0,3}>/.test(lines[i]!) &&
      !/^\s*([-*+]|\d{1,9}[.)])\s+/.test(lines[i]!)
    ) {
      para.push(lines[i]!)
      i++
    }
    if (para.length) out.push(<p key={key++}>{parseInline(para.join('\n'))}</p>)
    else i++
  }

  return out
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

function parseList(lines: string[], start: number, key: number): { node: ReactNode; next: number } {
  const first = lines[start]!
  const ordered = /^\s*\d{1,9}[.)]\s+/.test(first)
  const items: string[][] = []
  let i = start

  const itemRe = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/

  while (i < lines.length) {
    const m = itemRe.exec(lines[i]!)
    if (m) {
      items.push([m[3]!])
      i++
      // continuation lines (indented, or lazy text) belong to the current item
      while (i < lines.length && lines[i]!.trim() && !itemRe.test(lines[i]!) && /^\s{2,}/.test(lines[i]!)) {
        items[items.length - 1]!.push(lines[i]!.trim())
        i++
      }
    } else if (lines[i]!.trim() && items.length && /^\s{2,}/.test(lines[i]!)) {
      items[items.length - 1]!.push(lines[i]!.trim())
      i++
    } else {
      break
    }
  }

  const Tag = ordered ? 'ol' : 'ul'
  return {
    node: (
      <Tag key={key}>
        {items.map((parts, idx) => (
          <li key={idx}>{parseInline(parts.join('\n'))}</li>
        ))}
      </Tag>
    ),
    next: i,
  }
}

/* ------------------------- inline ------------------------- */

const INLINE_RE =
  /(`[^`\n]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(_[^_\n]+_)|(~~[^~]+~~)|(\[[^\]\n]+\]\([^)\s]+\))/g

function parseInline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let k = 0

  // matchAll clones the regex per call — essential here, because the bold /
  // italic branches recurse and would otherwise reset a shared lastIndex.
  for (const m of text.matchAll(INLINE_RE)) {
    const full = m[0]!
    const index = m.index ?? 0
    if (index > last) out.push(text.slice(last, index))
    if (m[1]) out.push(<code key={k++}>{full.slice(1, -1)}</code>)
    else if (m[2] || m[3]) out.push(<strong key={k++}>{parseInline(full.slice(2, -2))}</strong>)
    else if (m[4] || m[5]) out.push(<em key={k++}>{parseInline(full.slice(1, -1))}</em>)
    else if (m[6]) out.push(<s key={k++}>{full.slice(2, -2)}</s>)
    else if (m[7]) {
      const mm = /\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(full)!
      out.push(
        <a key={k++} href={mm[2]!} target="_blank" rel="noreferrer noopener">
          {mm[1]}
        </a>,
      )
    }
    last = index + full.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/* ------------------------- code block ------------------------- */

const CodeBlock = memo(function CodeBlock({
  code,
  lang,
  streaming,
}: {
  code: string
  lang: string
  streaming: boolean
}) {
  const [copied, setCopied] = useState(false)
  const resolved = normalizeLang(lang) || guessLang(code)
  const tokens = highlight(code, resolved)
  const lines = code.split('\n').length

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  return (
    <div className="md-pre group">
      <div className="md-pre-head">
        <span className="flex items-center gap-2">
          <span className="text-ink2">{resolved}</span>
          <span className="text-faint/70">{lines} ln</span>
          {streaming && (
            <span className="flex items-center gap-1 text-brand2">
              <span className="h-1.5 w-1.5 rounded-full bg-brand2 animate-pulse-dot" />
              writing
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={copy}
          className="no-drag rounded px-1.5 py-0.5 text-[10.5px] uppercase tracking-wider text-faint transition-colors hover:bg-raised hover:text-ink"
        >
          {copied ? 'copied ✓' : 'copy'}
        </button>
      </div>
      <pre>
        <code>
          {tokens.map(([t, cls], idx) =>
            cls ? (
              <span key={idx} className={cls}>
                {t}
              </span>
            ) : (
              <span key={idx}>{t}</span>
            ),
          )}
          {streaming && <span className="caret" />}
        </code>
      </pre>
    </div>
  )
})
