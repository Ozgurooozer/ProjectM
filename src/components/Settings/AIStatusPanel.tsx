import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import { indexVault } from '../../lib/indexingPipeline'

export function AIStatusPanel() {
  const {
    embeddingStatus,
    embeddingProgress,
    indexingProgress,
    vectorStore,
    fileTree,
    setIndexingProgress,
  } = useAppStore()

  const [indexCount, setIndexCount] = useState(0)
  const [lastIndexed, setLastIndexed] = useState<number | null>(null)
  const [reindexing, setReindexing] = useState(false)

  function formatRelativeTime(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000)
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  useEffect(() => {
    if (!vectorStore) return

    vectorStore.count().then(setIndexCount)
    vectorStore.getMeta().then((meta) => {
      if (meta?.lastFullIndex) {
        setLastIndexed(meta.lastFullIndex)
      }
    })
  }, [vectorStore, indexingProgress.phase])

  async function handleReindex() {
    if (!vectorStore || embeddingStatus !== 'ready') return
    setReindexing(true)
    await vectorStore.clearAll()
    await indexVault(fileTree, vectorStore, (p) => {
      setIndexingProgress({
        phase: p.phase as 'idle' | 'checking' | 'embedding' | 'done' | 'error',
        current: p.current,
        total: p.total,
        message: p.message,
      })
    })
    const count = await vectorStore.count()
    setIndexCount(count)
    setReindexing(false)
  }

  async function handleClearIndex() {
    if (!vectorStore) return
    const confirmed = window.confirm(
      'Clear the AI index? Notes will be re-indexed next time the vault opens.'
    )
    if (!confirmed) return
    await vectorStore.clearAll()
    setIndexCount(0)
    setLastIndexed(null)
  }

  const statusConfig = {
    idle: { color: 'text-zinc-500', dot: 'bg-zinc-600', label: 'Not started' },
    loading: { color: 'text-yellow-400', dot: 'bg-yellow-500 animate-pulse', label: 'Loading model...' },
    ready: { color: 'text-green-400', dot: 'bg-green-500', label: 'Ready' },
    error: { color: 'text-red-400', dot: 'bg-red-500', label: 'Error' },
  }[embeddingStatus]

  return (
    <div className="space-y-4">

      <div className="bg-zinc-900 rounded-lg p-3 space-y-3">
        <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">AI Model</p>

        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full shrink-0 ${statusConfig.dot}`} />
          <span className={`text-sm font-medium ${statusConfig.color}`}>
            {statusConfig.label}
          </span>
        </div>

        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-zinc-600">Model</span>
            <span className="text-zinc-400 font-mono">bge-micro-v2</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-600">Size</span>
            <span className="text-zinc-400">~23 MB (quantized)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-600">Dimensions</span>
            <span className="text-zinc-400">384</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-600">Runtime</span>
            <span className="text-zinc-400">WebAssembly (local)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-600">Privacy</span>
            <span className="text-green-500">✓ 100% offline</span>
          </div>
        </div>

        {embeddingStatus === 'loading' && embeddingProgress.status && (
          <div>
            <p className="text-xs text-zinc-500 mb-1">{embeddingProgress.status}</p>
            <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-500 transition-all duration-300"
                style={{ width: `${embeddingProgress.progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="bg-zinc-900 rounded-lg p-3 space-y-3">
        <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Vector Index</p>

        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-zinc-600">Indexed notes</span>
            <span className="text-zinc-400">{indexCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-600">Storage</span>
            <span className="text-zinc-400">~{Math.round(indexCount * 1.5)}KB</span>
          </div>
          {lastIndexed && (
            <div className="flex justify-between">
              <span className="text-zinc-600">Last indexed</span>
              <span className="text-zinc-400" title={new Date(lastIndexed).toLocaleString()}>
                {formatRelativeTime(lastIndexed)}
              </span>
            </div>
          )}
        </div>

        {(indexingProgress.phase === 'embedding' || indexingProgress.phase === 'checking') && (
          <div>
            <p className="text-xs text-zinc-500 mb-1 truncate">{indexingProgress.message}</p>
            <div className="h-1 bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 transition-all duration-300"
                style={{
                  width: indexingProgress.total > 0
                    ? `${Math.round((indexingProgress.current / indexingProgress.total) * 100)}%`
                    : '10%'
                }}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleReindex}
            disabled={reindexing || embeddingStatus !== 'ready' || !vectorStore}
            className="flex-1 text-xs bg-zinc-700 hover:bg-zinc-600
                       disabled:opacity-40 text-zinc-200 rounded px-2 py-1.5 transition-colors"
          >
            {reindexing ? '⏳ Indexing...' : '🔄 Re-index all'}
          </button>
          <button
            onClick={handleClearIndex}
            disabled={!vectorStore || indexCount === 0}
            className="flex-1 text-xs bg-zinc-800 hover:bg-red-900/30
                       disabled:opacity-40 text-zinc-400 hover:text-red-400
                       rounded px-2 py-1.5 transition-colors border border-zinc-700"
          >
            🗑 Clear index
          </button>
        </div>
      </div>

      <div className="text-xs text-zinc-700 space-y-1 px-1">
        <p>• Notes are embedded locally using bge-micro-v2</p>
        <p>• Embeddings are cached in IndexedDB (survives restarts)</p>
        <p>• Only changed notes are re-indexed on each vault open</p>
        <p>• No data is sent to any server</p>
      </div>
    </div>
  )
}
