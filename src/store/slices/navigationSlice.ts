import type { StateCreator } from 'zustand'
import type { AppStore } from '../appStore'
import { addToRecent, savePinnedNotes, saveRecentNotes } from '../../lib/persistence'

export interface NavigationSlice {
  pinnedNotes: string[]
  recentNotes: string[]
  activeTag: string | null
  togglePin: (path: string) => void
  setPinnedNotes: (paths: string[]) => void
  setRecentNotes: (paths: string[]) => void
  setActiveTag: (tag: string | null) => void
  addToRecentList: (path: string) => void
}

export const createNavigationSlice: StateCreator<AppStore, [], [], NavigationSlice> = (set, get) => ({
  pinnedNotes: [],
  recentNotes: [],
  activeTag: null,

  addToRecentList: (path) => {
    const newRecent = addToRecent(get().recentNotes, path)
    saveRecentNotes(newRecent).catch(console.error)
    set({ recentNotes: newRecent })
  },

  setPinnedNotes: (paths) => set({ pinnedNotes: paths }),

  setRecentNotes: (paths) => set({ recentNotes: paths }),

  setActiveTag: (tag) => set({ activeTag: tag }),

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
