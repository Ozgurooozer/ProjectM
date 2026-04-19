import type { StateCreator } from 'zustand'
import type { BacklinkEntry } from '../../types'
import type { AppStore } from '../appStore'

export interface IndexSlice {
  backlinkIndex: Record<string, BacklinkEntry[]>
  tagIndex: Record<string, string[]>
  setBacklinkIndex: (index: Record<string, BacklinkEntry[]>) => void
  setTagIndex: (index: Record<string, string[]>) => void
}

export const createIndexSlice: StateCreator<AppStore, [], [], IndexSlice> = (set) => ({
  backlinkIndex: {},
  tagIndex: {},
  setBacklinkIndex: (index) => set({ backlinkIndex: index }),
  setTagIndex: (index) => set({ tagIndex: index }),
})
