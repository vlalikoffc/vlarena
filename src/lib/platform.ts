/**
 * Runtime platform detection + Tauri integration helpers.
 *
 * Everything degrades gracefully in a plain browser so the exact same UI runs
 * in `vite dev` (and in the Arena live preview) as inside the desktop window.
 */

export type Platform = 'tauri' | 'web'
export type OS = 'macos' | 'windows' | 'linux' | 'unknown'

export function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  )
}

export function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  if (/mac os x|macintosh/i.test(ua)) return 'macos'
  if (/windows/i.test(ua)) return 'windows'
  if (/linux|x11/i.test(ua)) return 'linux'
  return 'unknown'
}

export const OS_NAME: OS = detectOS()

/** Fetch that bypasses webview CORS when running inside Tauri. */
let cachedFetch: typeof globalThis.fetch | null = null

export async function transport(): Promise<typeof globalThis.fetch> {
  if (!isTauri()) return globalThis.fetch.bind(globalThis)
  if (cachedFetch) return cachedFetch
  try {
    const mod = await import('@tauri-apps/plugin-http')
    cachedFetch = mod.fetch as unknown as typeof globalThis.fetch
    return cachedFetch
  } catch {
    return globalThis.fetch.bind(globalThis)
  }
}

export interface AppInfo {
  version: string
  platform: Platform
  os: OS
  name: string
}

export async function appInfo(): Promise<AppInfo> {
  const base: AppInfo = {
    version: '0.1.0',
    platform: isTauri() ? 'tauri' : 'web',
    os: OS_NAME,
    name: 'vlarena',
  }
  if (!isTauri()) return base
  try {
    const { getVersion, getName } = await import('@tauri-apps/api/app')
    return { ...base, version: await getVersion(), name: await getName() }
  } catch {
    return base
  }
}

/** Window controls — no-ops in the browser. */
export async function windowMinimize(): Promise<void> {
  if (!isTauri()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().minimize()
}

export async function windowToggleMaximize(): Promise<void> {
  if (!isTauri()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  const win = getCurrentWindow()
  if (await win.isMaximized()) await win.unmaximize()
  else await win.maximize()
}

export async function windowClose(): Promise<void> {
  if (!isTauri()) return
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().close()
}
