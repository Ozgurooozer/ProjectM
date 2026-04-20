import { embeddingWorker } from './embeddingWorkerManager'
import { VectorStore } from './vectorStore'
import { indexVault, type ProgressCallback } from './indexingPipeline'
import type { FileNode } from '../types'

export async function openVectorStore(vaultId: string): Promise<VectorStore> {
  const store = new VectorStore(vaultId)
  await store.open()
  return store
}

// Start indexing once the model is ready. Returns a cancel function.
// getFileTree is called lazily so it reads the current tree at the moment
// indexing begins (not when this is called).
export function startIndexingWhenReady(
  store: VectorStore,
  getFileTree: () => FileNode[],
  onProgress: ProgressCallback
): () => void {
  const controller = new AbortController()

  function run() {
    if (controller.signal.aborted) return
    indexVault(getFileTree(), store, onProgress, controller.signal).catch((err) => {
      if (!controller.signal.aborted) console.warn('Indexing failed:', err)
    })
  }

  const status = embeddingWorker.getStatus()
  if (status === 'ready') {
    run()
    return () => controller.abort()
  }
  if (status === 'error') return () => {}

  const unsub = embeddingWorker.onStatusChange((s) => {
    if (s === 'ready') { unsub(); run() }
  })

  return () => { controller.abort(); unsub() }
}
