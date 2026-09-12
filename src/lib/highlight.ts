/**
 * Tiny dependency-free syntax highlighter.
 *
 * Good enough for the languages that show up in model answers, cheap enough to
 * re-run on every streaming frame. Returns [text, className] pairs.
 */

export type Token = [text: string, cls: string]

const KEYWORDS: Record<string, string[]> = {
  js: [
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch',
    'case', 'break', 'continue', 'new', 'class', 'extends', 'super', 'this', 'typeof', 'instanceof',
    'in', 'of', 'try', 'catch', 'finally', 'throw', 'async', 'await', 'yield', 'import', 'export',
    'from', 'default', 'as', 'delete', 'void', 'null', 'undefined', 'true', 'false',
  ],
  ts: [
    'type', 'interface', 'enum', 'implements', 'public', 'private', 'protected', 'readonly',
    'namespace', 'declare', 'abstract', 'keyof', 'infer', 'satisfies', 'is', 'never', 'unknown',
    'any', 'string', 'number', 'boolean', 'symbol', 'bigint', 'object',
  ],
  python: [
    'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'break', 'continue', 'pass',
    'import', 'from', 'as', 'try', 'except', 'finally', 'raise', 'with', 'lambda', 'yield',
    'global', 'nonlocal', 'assert', 'del', 'in', 'is', 'not', 'and', 'or', 'None', 'True', 'False',
    'self', 'async', 'await',
  ],
  rust: [
    'fn', 'let', 'mut', 'const', 'struct', 'enum', 'impl', 'trait', 'pub', 'use', 'mod', 'crate',
    'self', 'Self', 'match', 'if', 'else', 'for', 'while', 'loop', 'break', 'continue', 'return',
    'where', 'async', 'await', 'move', 'ref', 'static', 'unsafe', 'dyn', 'as', 'in', 'type',
  ],
  go: [
    'func', 'package', 'import', 'type', 'struct', 'interface', 'map', 'chan', 'go', 'defer',
    'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'const', 'var', 'nil',
    'select', 'fallthrough',
  ],
  shell: [
    'if', 'then', 'else', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'function', 'return',
    'export', 'local', 'sudo', 'echo', 'cd', 'ls', 'cat', 'grep', 'sed', 'awk', 'npm', 'npx',
    'cargo', 'git', 'docker', 'curl',
  ],
  sql: [
    'select', 'from', 'where', 'join', 'left', 'right', 'inner', 'outer', 'on', 'group', 'by',
    'order', 'having', 'limit', 'offset', 'insert', 'into', 'values', 'update', 'set', 'delete',
    'create', 'table', 'index', 'view', 'as', 'and', 'or', 'not', 'null', 'distinct', 'count',
    'sum', 'avg', 'min', 'max', 'with', 'case', 'when', 'then', 'end',
  ],
  json: ['true', 'false', 'null'],
  css: ['import', 'media', 'supports', 'keyframes', 'layer', 'theme', 'apply'],
}

const ALIASES: Record<string, string> = {
  javascript: 'js',
  jsx: 'js',
  tsx: 'ts',
  typescript: 'ts',
  py: 'python',
  python3: 'python',
  rs: 'rust',
  golang: 'go',
  bash: 'shell',
  sh: 'shell',
  zsh: 'shell',
  console: 'shell',
  postgres: 'sql',
  mysql: 'sql',
  scss: 'css',
  html: 'js',
  yaml: 'python',
  yml: 'python',
  toml: 'python',
}

export function normalizeLang(lang: string | undefined): string {
  const l = (lang ?? '').trim().toLowerCase()
  return ALIASES[l] ?? l ?? 'text'
}

const HASH_COMMENT = new Set(['python', 'shell', 'yaml', 'toml', 'ruby'])
const SQL_LANGS = new Set(['sql'])

export function highlight(code: string, lang: string | undefined): Token[] {
  const l = normalizeLang(lang)
  const kws = new Set<string>([
    ...(KEYWORDS[l] ?? []),
    ...(l === 'ts' ? (KEYWORDS.js ?? []) : []),
    ...(l === 'js' ? (KEYWORDS.ts ?? []) : []),
  ])

  const comment = HASH_COMMENT.has(l)
    ? /#[^\n]*/
    : /\/\/[^\n]*|\/\*[\s\S]*?\*\/|--[^\n]*/

  const kwAlt = [...kws].map(escapeRe).join('|')

  const pattern = new RegExp(
    [
      // 1: comments
      `(${comment.source})`,
      // 2: strings (incl. python triple quotes and JS template literals)
      `("""[\\s\\S]*?"""|'''[\\s\\S]*?'''|\`(?:[^\`\\\\]|\\\\.)*\`|"(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*')`,
      // 3: numbers
      `\\b(0[xX][0-9a-fA-F]+|\\d[\\d_]*(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b`,
      // 4: keywords
      kwAlt ? `\\b(${kwAlt})\\b` : `(?!x)x`,
      // 5: SCREAMING_CONSTANTS / Type names
      `\\b([A-Z][A-Za-z0-9_]{2,})\\b`,
      // 6: function calls
      `([A-Za-z_$][\\w$]*)(?=\\s*\\()`,
      // 7: operators & punctuation
      `([{}()\\[\\];,.:?=!<>+\\-*/%&|^~@]+)`,
    ].join('|'),
    SQL_LANGS.has(l) ? 'gim' : 'gm',
  )

  const out: Token[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = pattern.exec(code))) {
    const full = m[0]
    if (!full) {
      pattern.lastIndex++
      continue
    }
    if (m.index > last) out.push([code.slice(last, m.index), ''])
    const [, com, str, num, kw, constant, call, op] = m
    if (com) out.push([full, 'tok-com'])
    else if (str) out.push([full, 'tok-str'])
    else if (num) out.push([full, 'tok-num'])
    else if (kw) out.push([full, 'tok-kw'])
    else if (constant) out.push([full, 'tok-type'])
    else if (call) out.push([full, 'tok-fn'])
    else if (op) out.push([full, 'tok-op'])
    else out.push([full, ''])
    last = m.index + full.length
    if (m.index === pattern.lastIndex) pattern.lastIndex++
  }
  if (last < code.length) out.push([code.slice(last), ''])
  return out
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Very rough "language" guess for fences without one. */
export function guessLang(code: string): string {
  if (/^\s*(def |import |from .* import|print\()/m.test(code)) return 'python'
  if (/^\s*(fn |let mut |impl |use std)/m.test(code)) return 'rust'
  if (/^\s*(func |package |fmt\.)/m.test(code)) return 'go'
  if (/^\s*(SELECT|INSERT|CREATE TABLE)/im.test(code)) return 'sql'
  if (/<\/?[a-z][\s\S]*>/i.test(code)) return 'html'
  if (/^\s*(const |let |function |=>|export )/m.test(code)) return 'ts'
  if (/^\s*(\$|#!\/bin\/(ba)?sh|npm |cargo |sudo )/m.test(code)) return 'shell'
  if (code.trim().startsWith('{') && code.trim().endsWith('}')) return 'json'
  return 'text'
}
