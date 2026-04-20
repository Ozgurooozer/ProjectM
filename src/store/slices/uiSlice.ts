import type { StateCreator } from 'zustand'
import type { AppSettings } from '../../types'
import type { AppStore } from '../appStore'

export type LeftPanelId = 'files' | 'search' | 'tags' | 'recent'
export type RightPanelId = 'backlinks' | 'outline' | 'graph' | 'similar'

export interface UiSlice {
  settings: AppSettings
  creatingMode: 'note' | 'folder' | null
  cutPath: string | null
  cutType: 'file' | 'folder' | null
  isRandomNote: boolean
  // Panel layout state
  leftPanelOpen: boolean
  leftPanelId: LeftPanelId
  rightPanelOpen: boolean
  rightPanelId: RightPanelId
  updateSettings: (patch: Partial<AppSettings>) => void
  setCreatingMode: (mode: 'note' | 'folder' | null) => void
  setCutPath: (path: string | null, type?: 'file' | 'folder' | null) => void
  setIsRandomNote: (v: boolean) => void
  setLeftPanel: (id: LeftPanelId) => void
  toggleLeftPanel: (id: LeftPanelId) => void
  setRightPanel: (id: RightPanelId) => void
  toggleRightPanel: (id: RightPanelId) => void
}

export const createUiSlice: StateCreator<AppStore, [], [], UiSlice> = (set, get) => ({
  settings: { fontSize: 14, theme: 'dark' },
  creatingMode: null,
  cutPath: null,
  cutType: null,
  isRandomNote: false,
  leftPanelOpen: true,
  leftPanelId: 'files',
  rightPanelOpen: true,
  rightPanelId: 'backlinks',
  updateSettings: (patch) =>
    set((state) => ({ settings: { ...state.settings, ...patch } })),
  setCreatingMode: (mode) => set({ creatingMode: mode }),
  setCutPath: (path, type = null) => set({ cutPath: path, cutType: type }),
  setIsRandomNote: (v) => set({ isRandomNote: v }),
  setLeftPanel: (id) => set({ leftPanelId: id, leftPanelOpen: true }),
  toggleLeftPanel: (id) => {
    const { leftPanelId, leftPanelOpen } = get()
    if (leftPanelId === id) {
      set({ leftPanelOpen: !leftPanelOpen })
    } else {
      set({ leftPanelId: id, leftPanelOpen: true })
    }
  },
  setRightPanel: (id) => set({ rightPanelId: id, rightPanelOpen: true }),
  toggleRightPanel: (id) => {
    const { rightPanelId, rightPanelOpen } = get()
    if (rightPanelId === id) {
      set({ rightPanelOpen: !rightPanelOpen })
    } else {
      set({ rightPanelId: id, rightPanelOpen: true })
    }
  },
})
