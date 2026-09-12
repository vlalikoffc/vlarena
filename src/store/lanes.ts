/**
 * Live lane store.
 *
 * Streaming updates land here instead of the React reducer: a token arrives
 * every few milliseconds per lane, and pushing that through a global reducer
 * would re-render the whole app 60×/s. Components subscribe to exactly the
 * lane they render via `useSyncExternalStore`.
 */

import { useSyncExternalStore } from 'react'
import type { LaneStatus } from '../lib/types'

export interface LiveLane {
  status: LaneStatus
  text: string
  tokens: number
  ttftMs: number | null
  elapsedMs: number
  tokPerSec: number
  error?: string
}

export const EMPTY_LANE: LiveLane = Object.freeze({
  status: 'idle' as LaneStatus,
  text: '',
  tokens: 0,
  ttftMs: null,
  elapsedMs: 0,
  tokPerSec: 0,
})

export type LanePatch = Partial<LiveLane> | ((prev: LiveLane) => Partial<LiveLane>)

type Listener = () => void

export class LaneStore {
  private lanes = new Map<string, LiveLane>()
  private listeners = new Map<string, Set<Listener>>()
  private globalListeners = new Set<Listener>()
  private version = 0

  get = (key: string): LiveLane => this.lanes.get(key) ?? EMPTY_LANE

  snapshot = (key: string): LiveLane | undefined => this.lanes.get(key)

  set(key: string, lane: LiveLane): void {
    this.lanes.set(key, lane)
    this.bump(key)
  }

  update(key: string, patch: LanePatch): void {
    const prev = this.get(key)
    const delta = typeof patch === 'function' ? patch(prev) : patch
    this.lanes.set(key, { ...prev, ...delta })
    this.bump(key)
  }

  /** Seeds a lane from persisted data unless something newer already exists. */
  ensure(key: string, lane: LiveLane): void {
    if (!this.lanes.has(key)) this.set(key, lane)
  }

  delete(key: string): void {
    if (this.lanes.delete(key)) this.bump(key)
  }

  clear(): void {
    const keys = [...this.lanes.keys()]
    this.lanes.clear()
    for (const k of keys) this.bump(k)
  }

  keys(): string[] {
    return [...this.lanes.keys()]
  }

  values(): Array<[string, LiveLane]> {
    return [...this.lanes.entries()]
  }

  private bump(key: string): void {
    this.version++
    this.listeners.get(key)?.forEach((l) => l())
    this.globalListeners.forEach((l) => l())
  }

  subscribe(key: string, listener: Listener): () => void {
    let set = this.listeners.get(key)
    if (!set) {
      set = new Set()
      this.listeners.set(key, set)
    }
    set.add(listener)
    return () => {
      set!.delete(listener)
      if (!set!.size) this.listeners.delete(key)
    }
  }

  subscribeAll(listener: Listener): () => void {
    this.globalListeners.add(listener)
    return () => {
      this.globalListeners.delete(listener)
    }
  }

  getVersion(): number {
    return this.version
  }
}

export const laneStore = new LaneStore()

export function laneKey(turnId: string, lane: string): string {
  return `${turnId}:${lane}`
}

export function useLiveLane(key: string): LiveLane {
  return useSyncExternalStore(
    (cb) => laneStore.subscribe(key, cb),
    () => laneStore.get(key),
    () => EMPTY_LANE,
  )
}

/** Subscribes to "is anything streaming" without re-rendering on every token. */
export function useAnyStreaming(keys: string[]): boolean {
  return useSyncExternalStore(
    (cb) => laneStore.subscribeAll(cb),
    () => keys.some((k) => laneStore.get(k).status === 'streaming' || laneStore.get(k).status === 'queued'),
    () => false,
  )
}
