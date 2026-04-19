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
  const lastPathRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeNotePath || !vectorStore) return
    if (embeddingStatus !== 'ready') return
    if (activeNotePath === lastPathRef.current) return

    lastPathRef.current = activeNotePath

    searchByNote(activeNotePath, vectorStore, { topK: 8, minScore: 0.45 })
      .then(setSimilarNotes)
      .catch((err) => {
        console.warn('Similar notes search failed:', err)
        setSimilarNotes([])
      })
  }, [activeNotePath, embeddingStatus, vectorStore, setSimilarNotes])
}
