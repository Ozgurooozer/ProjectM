import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { embeddingWorker } from '../lib/embeddingWorkerManager'

/** Loads the embedding model on mount and wires up status/progress to the store. */
export function useModelLoader() {
  const { setEmbeddingStatus, setEmbeddingProgress } = useAppStore()

  useEffect(() => {
    const unsubStatus = embeddingWorker.onStatusChange(setEmbeddingStatus)
    const unsubProgress = embeddingWorker.onProgress((status, progress) =>
      setEmbeddingProgress({ status, progress })
    )
    embeddingWorker.loadModel().catch((err) =>
      console.warn('Could not load embedding model:', err)
    )
    return () => { unsubStatus(); unsubProgress() }
  }, [setEmbeddingStatus, setEmbeddingProgress])
}
