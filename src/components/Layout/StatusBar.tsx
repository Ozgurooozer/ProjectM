import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'

export function StatusBar() {
  const {
    activeNotePath,
    noteContent,
    saveStatus,
    vaultPath,
    embeddingStatus,
    indexingProgress,
  } = useAppStore()

  const [saveVisible, setSaveVisible] = useState(true)

  useEffect(() => {
    setSaveVisible(true)
    if (saveStatus === 'saved') {
      const t = setTimeout(() => setSaveVisible(false), 2000)
      return () => clearTimeout(t)
    }
  }, [saveStatus])

  const wordCount = noteContent.trim() ? noteContent.trim().split(/\s+/).length : 0
  const noteName = activeNotePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? ''
  const vaultName = vaultPath?.split(/[\\/]/).pop() ?? ''

  const saveLabel = { saved: '✓ Saved', saving: '· Saving…', error: '✗ Error' }[saveStatus]
  const saveColor = {
    saved: 'text-zinc-600',
    saving: 'text-zinc-400',
    error: 'text-red-400',
  }[saveStatus]

  const aiDotClass =
    embeddingStatus === 'ready'   ? 'bg-green-500' :
    embeddingStatus === 'loading' ? 'bg-yellow-500 animate-pulse' :
    embeddingStatus === 'error'   ? 'bg-red-500' :
    'bg-zinc-700'

  const aiLabel =
    embeddingStatus === 'ready'   ? 'AI ready' :
    embeddingStatus === 'loading' ? 'Loading AI…' :
    embeddingStatus === 'error'   ? 'AI error' :
    'AI off'

  const isIndexing = indexingProgress.phase === 'embedding' || indexingProgress.phase === 'checking'
  const indexPct = indexingProgress.total > 0
    ? Math.round((indexingProgress.current / indexingProgress.total) * 100)
    : 0

  return (
    <div
      className="flex items-center h-6 px-3 border-t border-zinc-800 bg-zinc-950 shrink-0 gap-4 select-none"
      style={{ fontSize: '11px' }}
    >
      {/* Left: vault name */}
      {vaultName && (
        <span className="text-zinc-600 truncate max-w-[120px]" title={vaultPath ?? ''}>
          📒 {vaultName}
        </span>
      )}

      {/* Note name */}
      {noteName && (
        <>
          <span className="text-zinc-700">/</span>
          <span className="text-zinc-500 truncate max-w-[200px]">{noteName}</span>
        </>
      )}

      <div className="flex-1" />

      {/* Indexing progress */}
      {isIndexing && (
        <div className="flex items-center gap-1.5">
          <div className="w-16 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 transition-all duration-300"
              style={{ width: `${indexPct}%` }}
            />
          </div>
          <span className="text-zinc-600">Indexing {indexPct}%</span>
        </div>
      )}

      {/* Word count */}
      {activeNotePath && (
        <span className="text-zinc-600">{wordCount} words</span>
      )}

      {/* Save status */}
      {activeNotePath && saveVisible && (
        <span className={saveColor}>{saveLabel}</span>
      )}

      {/* AI status */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('open-settings-ai'))}
        title={aiLabel}
        className="flex items-center gap-1 hover:opacity-80 transition-opacity"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${aiDotClass}`} />
        <span className="text-zinc-700">{aiLabel}</span>
      </button>
    </div>
  )
}
