import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { searchByNote } from '../lib/similaritySearch'

export function useSimilarNotes() {
  const {
    activeNotePath,
    vectorStore,
    embeddingStatus,
    indexingProgress,
    setSimilarNotes,
  } = useAppStore()

  const lastKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeNotePath || !vectorStore || embeddingStatus !== 'ready') return

    // Re-run when: note changes, model becomes ready, OR indexing finishes
    const key = `${activeNotePath}::${embeddingStatus}::${indexingProgress.phase === 'done' ? 'indexed' : 'pending'}`
    if (key === lastKeyRef.current) return
    lastKeyRef.current = key

    searchByNote(activeNotePath, vectorStore, { topK: 8, minScore: 0.45 })
      .then(setSimilarNotes)
      .catch((err) => {
        console.warn('Similar notes search failed:', err)
        setSimilarNotes([])
      })
  }, [activeNotePath, embeddingStatus, vectorStore, indexingProgress.phase, setSimilarNotes])
}
