import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { searchByNote } from '../lib/similaritySearch'

export function useSimilarNotes() {
  const {
    activeNotePath,
    vectorStore,
    embeddingStatus,
    setSimilarNotes,
  } = useAppStore()

  // Track a compound key so the search re-runs when:
  // - the active note changes, OR
  // - the model transitions to 'ready' (so a note already open gets searched)
  const lastKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeNotePath || !vectorStore || embeddingStatus !== 'ready') return

    const key = `${activeNotePath}::${embeddingStatus}`
    if (key === lastKeyRef.current) return
    lastKeyRef.current = key

    searchByNote(activeNotePath, vectorStore, { topK: 8, minScore: 0.45 })
      .then(setSimilarNotes)
      .catch((err) => {
        console.warn('Similar notes search failed:', err)
        setSimilarNotes([])
      })
  }, [activeNotePath, embeddingStatus, vectorStore, setSimilarNotes])
}
