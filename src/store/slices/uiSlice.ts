import type { StateCreator } from 'zustand'
import type { AppSettings } from '../../types'
import type { AppStore } from '../appStore'

export interface UiSlice {
  settings: AppSettings
  creatingMode: 'note' | 'folder' | null
  cutPath: string | null
  cutType: 'file' | 'folder' | null
  isRandomNote: boolean
  updateSettings: (patch: Partial<AppSettings>) => void
  setCreatingMode: (mode: 'note' | 'folder' | null) => void
  setCutPath: (path: string | null, type?: 'file' | 'folder' | null) => void
  setIsRandomNote: (v: boolean) => void
}

export const createUiSlice: StateCreator<AppStore, [], [], UiSlice> = (set) => ({
  settings: { fontSize: 14, theme: 'dark' },
  creatingMode: null,
  cutPath: null,
  cutType: null,
  isRandomNote: false,
  updateSettings: (patch) =>
    set((state) => ({ settings: { ...state.settings, ...patch } })),
  setCreatingMode: (mode) => set({ creatingMode: mode }),
  setCutPath: (path, type = null) => set({ cutPath: path, cutType: type }),
  setIsRandomNote: (v) => set({ isRandomNote: v }),
})
