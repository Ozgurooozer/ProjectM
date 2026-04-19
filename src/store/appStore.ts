import { create } from 'zustand'
import { createVaultSlice, type VaultSlice } from './slices/vaultSlice'
import { createNoteSlice, type NoteSlice } from './slices/noteSlice'
import { createIndexSlice, type IndexSlice } from './slices/indexSlice'
import { createUiSlice, type UiSlice } from './slices/uiSlice'
import { createNavigationSlice, type NavigationSlice } from './slices/navigationSlice'
import { createEmbeddingSlice, type EmbeddingSlice } from './slices/embeddingSlice'

export type AppStore = VaultSlice & NoteSlice & IndexSlice & UiSlice & NavigationSlice & EmbeddingSlice

export const useAppStore = create<AppStore>()((...a) => ({
  ...createVaultSlice(...a),
  ...createNoteSlice(...a),
  ...createIndexSlice(...a),
  ...createUiSlice(...a),
  ...createNavigationSlice(...a),
  ...createEmbeddingSlice(...a),
}))
