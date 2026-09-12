/**
 * Persistence layer.
 *
 * Inside Tauri we use `plugin-store`, which writes a JSON file into the OS
 * app-data directory (so it survives updates and is excluded from backups of
 * the project folder). In a browser we fall back to localStorage.
 */

import { isTauri } from './platform'

const STORE_FILE = 'vlarena.json'

export interface KeyValue {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
  keys(): Promise<string[]>
}

interface StoreLike {
  get(key: string): Promise<unknown>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  keys(): Promise<string[]>
}

class TauriStore implements KeyValue {
  private store: Promise<StoreLike> | null = null

  private async s(): Promise<StoreLike> {
    if (!this.store) {
      this.store = import('@tauri-apps/plugin-store').then(async ({ load }) => {
        const s = await load(STORE_FILE, { autoSave: 120 })
        return s as unknown as StoreLike
      })
    }
    return this.store
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const store = await this.s()
      const v = await store.get(key)
      return (v === undefined || v === null ? null : v) as T | null
    } catch {
      return null
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      const store = await this.s()
      await store.set(key, value)
    } catch {
      /* ignore — better to keep the UI alive than to crash on persistence */
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const store = await this.s()
      await store.delete(key)
    } catch {
      /* ignore */
    }
  }

  async keys(): Promise<string[]> {
    try {
      const store = await this.s()
      return await store.keys()
    } catch {
      return []
    }
  }
}

class WebStore implements KeyValue {
  private prefix = 'vlarena:'

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = localStorage.getItem(this.prefix + key)
      return raw ? (JSON.parse(raw) as T) : null
    } catch {
      return null
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value))
    } catch {
      /* quota / private mode */
    }
  }

  async delete(key: string): Promise<void> {
    try {
      localStorage.removeItem(this.prefix + key)
    } catch {
      /* ignore */
    }
  }

  async keys(): Promise<string[]> {
    try {
      const out: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k?.startsWith(this.prefix)) out.push(k.slice(this.prefix.length))
      }
      return out
    } catch {
      return []
    }
  }
}

let instance: KeyValue | null = null

export function kv(): KeyValue {
  if (!instance) instance = isTauri() ? new TauriStore() : new WebStore()
  return instance
}

/** Keys used by the app store. */
export const KEYS = {
  state: 'state:v1',
  theme: 'theme',
} as const
