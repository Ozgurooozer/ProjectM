import { Store } from '@tauri-apps/plugin-store'
import type { AppSettings } from '../types'

const STORE_FILE = 'app-state.json'
const KEY_VAULT_PATH = 'lastVaultPath'
const KEY_LAST_NOTE = 'lastNotePath'
const KEY_SETTINGS = 'settings'

let store: Store | null = null

async function getStore(): Promise<Store> {
  if (!store) {
    store = await Store.load(STORE_FILE)
  }
  return store
}

export async function saveLastVaultPath(path: string): Promise<void> {
  const s = await getStore()
  await s.set(KEY_VAULT_PATH, path)
  await s.save()
}

export async function loadLastVaultPath(): Promise<string | null> {
  const s = await getStore()
  const value = await s.get<string>(KEY_VAULT_PATH)
  return value ?? null
}

export async function saveLastNotePath(path: string): Promise<void> {
  const s = await getStore()
  await s.set(KEY_LAST_NOTE, path)
  await s.save()
}

export async function loadLastNotePath(): Promise<string | null> {
  const s = await getStore()
  const value = await s.get<string>(KEY_LAST_NOTE)
  return value ?? null
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const s = await getStore()
  await s.set(KEY_SETTINGS, settings)
  await s.save()
}

export async function loadSettings(): Promise<AppSettings | null> {
  const s = await getStore()
  const value = await s.get<AppSettings>(KEY_SETTINGS)
  return value ?? null
}

const KEY_PINNED = 'pinnedNotes'

export async function savePinnedNotes(paths: string[]): Promise<void> {
  const s = await getStore()
  await s.set(KEY_PINNED, paths)
  await s.save()
}

export async function loadPinnedNotes(): Promise<string[]> {
  const s = await getStore()
  const value = await s.get<string[]>(KEY_PINNED)
  return value ?? []
}

const KEY_RECENT = 'recentNotes'
const MAX_RECENT = 10

export async function saveRecentNotes(paths: string[]): Promise<void> {
  const s = await getStore()
  await s.set(KEY_RECENT, paths)
  await s.save()
}

export async function loadRecentNotes(): Promise<string[]> {
  const s = await getStore()
  const value = await s.get<string[]>(KEY_RECENT)
  return value ?? []
}

export function addToRecent(currentList: string[], newPath: string): string[] {
  const filtered = currentList.filter((p) => p !== newPath)
  return [newPath, ...filtered].slice(0, MAX_RECENT)
}

const KEY_AI_SEARCH = 'aiSearchEnabled'

export async function saveAiSearchEnabled(enabled: boolean): Promise<void> {
  const s = await getStore()
  await s.set(KEY_AI_SEARCH, enabled)
  await s.save()
}

export async function loadAiSearchEnabled(): Promise<boolean> {
  const s = await getStore()
  const value = await s.get<boolean>(KEY_AI_SEARCH)
  return value ?? true
}

// ── Layout state ──────────────────────────────────────────────────────────────

const KEY_LAYOUT = 'layoutState'

export interface LayoutState {
  leftPanelWidth: number   // px, default 240
  rightPanelWidth: number  // px, default 256
  leftPanelOpen: boolean
  rightPanelOpen: boolean
  leftPanelId: string
  rightPanelId: string
}

const DEFAULT_LAYOUT: LayoutState = {
  leftPanelWidth: 240,
  rightPanelWidth: 256,
  leftPanelOpen: true,
  rightPanelOpen: true,
  leftPanelId: 'files',
  rightPanelId: 'backlinks',
}

export async function saveLayoutState(state: Partial<LayoutState>): Promise<void> {
  const s = await getStore()
  const current = await s.get<LayoutState>(KEY_LAYOUT) ?? DEFAULT_LAYOUT
  await s.set(KEY_LAYOUT, { ...current, ...state })
  await s.save()
}

export async function loadLayoutState(): Promise<LayoutState> {
  const s = await getStore()
  const value = await s.get<LayoutState>(KEY_LAYOUT)
  return value ?? DEFAULT_LAYOUT
}
