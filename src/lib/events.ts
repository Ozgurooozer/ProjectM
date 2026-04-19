import type { BacklinkEntry, FileNode } from '../types'

export interface EventMap {
  // Note lifecycle
  'note:opened':   { path: string; content: string }
  'note:saved':    { path: string; content: string }
  'note:created':  { path: string }
  'note:deleted':  { path: string }
  'note:renamed':  { oldPath: string; newPath: string }

  // Vault lifecycle
  'vault:opened':  { path: string }
  'vault:closed':  Record<string, never>

  // UI commands (replaces window.dispatchEvent CustomEvents)
  'ui:new-note':           Record<string, never>
  'ui:open-daily-note':    Record<string, never>
  'ui:focus-search':       Record<string, never>
  'ui:toggle-reading':     Record<string, never>
  'ui:outline-scroll':     { headingId: string }
  'ui:open-random-note':   Record<string, never>
  'ui:open-vault':         Record<string, never>
  'ui:toggle-preview':     Record<string, never>
  'ui:open-quick-switcher':Record<string, never>
  'ui:open-settings':      Record<string, never>
  'ui:open-recovery':      Record<string, never>
  'ui:export-html':        Record<string, never>
  'ui:export-pdf':         Record<string, never>
  'ui:backup-vault':       Record<string, never>

  // Index updates
  'index:backlinks-updated': { index: Record<string, BacklinkEntry[]> }
  'index:tags-updated':      { index: Record<string, string[]> }

  // Plugin lifecycle
  'plugin:activated':   { pluginId: string }
  'plugin:deactivated': { pluginId: string }
}

type Listener<T> = (payload: T) => void

class TypedEventBus {
  private listeners = new Map<string, Set<Listener<unknown>>>()

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    const set = this.listeners.get(event)!
    set.add(listener as Listener<unknown>)
    return () => set.delete(listener as Listener<unknown>)
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    this.listeners.get(event)?.delete(listener as Listener<unknown>)
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.listeners.get(event)?.forEach((fn) => fn(payload as unknown))
  }
}

export const eventBus = new TypedEventBus()

// Re-export FileNode so plugin authors can import from one place
export type { FileNode }
