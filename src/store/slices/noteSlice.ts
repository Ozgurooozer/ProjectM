import type { StateCreator } from 'zustand'
import type { AppStore } from '../appStore'
import { saveLastNotePath } from '../../lib/persistence'

export interface NoteSlice {
  activeNotePath: string | null
  noteContent: string
  saveStatus: 'saved' | 'saving' | 'error'
  readingMode: boolean
  setActiveNote: (path: string, content: string) => void
  setNoteContent: (content: string) => void
  setSaveStatus: (status: 'saved' | 'saving' | 'error') => void
  clearActiveNote: () => void
  toggleReadingMode: () => void
}

export const createNoteSlice: StateCreator<AppStore, [], [], NoteSlice> = (set, get) => ({
  activeNotePath: null,
  noteContent: '',
  saveStatus: 'saved',
  readingMode: false,

  setActiveNote: (path, content) => {
    saveLastNotePath(path).catch(console.error)
    get().addToRecentList(path)
    set({ activeNotePath: path, noteContent: content })
  },

  setNoteContent: (content) => set({ noteContent: content }),
  setSaveStatus: (status) => set({ saveStatus: status }),
  clearActiveNote: () => set({ activeNotePath: null, noteContent: '' }),
  toggleReadingMode: () => set((state) => ({ readingMode: !state.readingMode })),
})
