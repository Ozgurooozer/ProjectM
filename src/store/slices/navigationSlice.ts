import type { StateCreator } from 'zustand'
import type { AppStore } from '../appStore'
import { addToRecent, savePinnedNotes, saveRecentNotes } from '../../lib/persistence'

export interface NavigationSlice {
  pinnedNotes: string[]
  recentNotes: string[]
  activeTag: string | null
  openTabs: string[]
  togglePin: (path: string) => void
  setPinnedNotes: (paths: string[]) => void
  setRecentNotes: (paths: string[]) => void
  setActiveTag: (tag: string | null) => void
  addToRecentList: (path: string) => void
  openTab: (path: string) => void
  closeTab: (path: string) => void
  closeAllTabs: () => void
}

export const createNavigationSlice: StateCreator<AppStore, [], [], NavigationSlice> = (set, get) => ({
  pinnedNotes: [],
  recentNotes: [],
  activeTag: null,
  openTabs: [],

  addToRecentList: (path) => {
    const newRecent = addToRecent(get().recentNotes, path)
    saveRecentNotes(newRecent).catch(console.error)
    set({ recentNotes: newRecent })
  },

  setPinnedNotes: (paths) => set({ pinnedNotes: paths }),
  setRecentNotes: (paths) => set({ recentNotes: paths }),
  setActiveTag: (tag) => set({ activeTag: tag }),

  openTab: (path) => {
    const { openTabs } = get()
    if (!openTabs.includes(path)) {
      set({ openTabs: [...openTabs, path] })
    }
  },

  closeTab: (path) => {
    const { openTabs, activeNotePath, setActiveNote, clearActiveNote } = get() as AppStore
    const newTabs = openTabs.filter((p) => p !== path)
    set({ openTabs: newTabs })
    // If closing active tab, switch to last tab or clear
    if (activeNotePath === path) {
      if (newTabs.length > 0) {
        const nextPath = newTabs[newTabs.length - 1]
        import('../../lib/tauri').then(({ readNote }) => {
          readNote(nextPath).then((content) => setActiveNote(nextPath, content)).catch(console.warn)
        })
      } else {
        clearActiveNote()
      }
    }
  },

  closeAllTabs: () => {
    const { clearActiveNote } = get() as AppStore
    set({ openTabs: [] })
    clearActiveNote()
  },

  togglePin: (path) => {
    const { pinnedNotes } = get()
    const isPinned = pinnedNotes.includes(path)
    const newPinned = isPinned
      ? pinnedNotes.filter((p) => p !== path)
      : [path, ...pinnedNotes]
    savePinnedNotes(newPinned).catch(console.error)
    set({ pinnedNotes: newPinned })
  },
})
