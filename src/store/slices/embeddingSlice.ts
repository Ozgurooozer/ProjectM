import type { StateCreator } from 'zustand'
import type { AppStore } from '../appStore'
import type { SimilarityResult } from '../../lib/similaritySearch'

export interface EmbeddingSlice {
  embeddingStatus: 'idle' | 'loading' | 'ready' | 'error'
  embeddingProgress: { status: string; progress: number }
  indexingProgress: {
    phase: 'idle' | 'checking' | 'embedding' | 'done' | 'error'
    current: number
    total: number
    message: string
  }
  similarNotes: SimilarityResult[]
  semanticQuery: string
  setEmbeddingStatus: (status: 'idle' | 'loading' | 'ready' | 'error') => void
  setEmbeddingProgress: (progress: { status: string; progress: number }) => void
  setIndexingProgress: (progress: {
    phase: 'idle' | 'checking' | 'embedding' | 'done' | 'error'
    current: number
    total: number
    message: string
  }) => void
  setSimilarNotes: (notes: SimilarityResult[]) => void
  setSemanticQuery: (query: string) => void
}

export const createEmbeddingSlice: StateCreator<AppStore, [], [], EmbeddingSlice> = (set) => ({
  embeddingStatus: 'idle',
  embeddingProgress: { status: '', progress: 0 },
  indexingProgress: { phase: 'idle', current: 0, total: 0, message: '' },
  similarNotes: [],
  semanticQuery: '',
  setEmbeddingStatus: (status) => set({ embeddingStatus: status }),
  setEmbeddingProgress: (progress) => set({ embeddingProgress: progress }),
  setIndexingProgress: (progress) => set({ indexingProgress: progress }),
  setSimilarNotes: (notes) => set({ similarNotes: notes }),
  setSemanticQuery: (query) => set({ semanticQuery: query }),
})
