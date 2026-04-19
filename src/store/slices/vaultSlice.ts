import type { StateCreator } from 'zustand'
import type { FileNode } from '../../types'
import type { AppStore } from '../appStore'
import type { VectorStore } from '../../lib/vectorStore'

export interface VaultSlice {
  vaultPath: string | null
  fileTree: FileNode[]
  vectorStore: VectorStore | null
  setVault: (path: string, tree: FileNode[]) => void
  refreshFileTree: (tree: FileNode[]) => void
  setVectorStore: (store: VectorStore | null) => void
}

export const createVaultSlice: StateCreator<AppStore, [], [], VaultSlice> = (set) => ({
  vaultPath: null,
  fileTree: [],
  vectorStore: null,
  setVault: (path, tree) => set({ vaultPath: path, fileTree: tree }),
  refreshFileTree: (tree) => set({ fileTree: tree }),
  setVectorStore: (store) => set({ vectorStore: store }),
})
