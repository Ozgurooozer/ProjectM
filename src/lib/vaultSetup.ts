import { embeddingWorker } from './embeddingWorkerManager'
import { VectorStore } from './vectorStore'
import { indexVault, type ProgressCallback } from './indexingPipeline'
import type { FileNode } from '../types'

export async function openVectorStore(vaultPath: string): Promise<VectorStore> {
  const store = new VectorStore(vaultPath)
  await store.open()
  return store
}

// Start indexing once the model is ready. getFileTree is called lazily so it
// reads the current tree at the moment indexing begins (not when this is called).
export function startIndexingWhenReady(
  store: VectorStore,
  getFileTree: () => FileNode[],
  onProgress: ProgressCallback
): void {
  function run() {
    indexVault(getFileTree(), store, onProgress).catch(console.warn)
  }

  const status = embeddingWorker.getStatus()
  if (status === 'ready') {
    run()
    return
  }
  if (status === 'error') return

  const unsub = embeddingWorker.onStatusChange((s) => {
    if (s === 'ready') { unsub(); run() }
  })
}
