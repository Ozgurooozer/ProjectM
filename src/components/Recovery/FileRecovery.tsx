import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'
import { listSnapshots, readSnapshot, deleteSnapshot, type Snapshot } from '../../lib/tauri'

interface Props {
  onClose: () => void
}

export function FileRecovery({ onClose }: Props) {
  const { vaultPath, activeNotePath, setNoteContent } = useAppStore()
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [selected, setSelected] = useState<Snapshot | null>(null)
  const [previewContent, setPreviewContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState(false)

  const noteName =
    activeNotePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? 'this note'

  useEffect(() => {
    if (!vaultPath || !activeNotePath) return
    listSnapshots(vaultPath, activeNotePath)
      .then((list) => {
        setSnapshots(list)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [vaultPath, activeNotePath])

  async function handleSelect(snapshot: Snapshot) {
    setSelected(snapshot)
    const content = await readSnapshot(snapshot.path)
    setPreviewContent(content)
  }

  async function handleRestore() {
    if (!selected) return
    const confirmed = window.confirm(
      `Restore "${noteName}" to the version from ${selected.timestamp}?\n\nCurrent unsaved changes will be overwritten.`
    )
    if (!confirmed) return

    setRestoring(true)
    const content = await readSnapshot(selected.path)
    setNoteContent(content)
    setRestoring(false)
    onClose()
  }

  async function handleDelete(snapshot: Snapshot, e: React.MouseEvent) {
    e.stopPropagation()
    await deleteSnapshot(snapshot.path)
    setSnapshots((prev) => prev.filter((s) => s.path !== snapshot.path))
    if (selected?.path === snapshot.path) {
      setSelected(null)
      setPreviewContent('')
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`
    return `${(bytes / 1024).toFixed(1)}KB`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-zinc-800 border border-zinc-600 rounded-lg shadow-2xl w-[720px] max-w-[95vw] h-[520px] flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-700 shrink-0">
          <div>
            <h2 className="text-sm font-medium text-zinc-200">File Recovery</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Snapshots for: <span className="text-zinc-400">{noteName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-56 border-r border-zinc-700 flex flex-col shrink-0">
            <p className="px-3 py-2 text-xs text-zinc-600 font-medium uppercase tracking-wide border-b border-zinc-700">
              {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''}
            </p>
            {loading ? (
              <div className="p-4 text-xs text-zinc-600">Loading...</div>
            ) : snapshots.length === 0 ? (
              <div className="p-4 text-xs text-zinc-600">
                No snapshots yet. Snapshots are created automatically when you save.
              </div>
            ) : (
              <ul className="flex-1 overflow-y-auto">
                {snapshots.map((snap) => (
                  <li key={snap.path}>
                    <button
                      onClick={() => handleSelect(snap)}
                      className={[
                        'w-full text-left px-3 py-2.5 border-b border-zinc-700/50 transition-colors group',
                        selected?.path === snap.path
                          ? 'bg-violet-900/40 border-l-2 border-l-violet-500'
                          : 'hover:bg-zinc-700/50',
                      ].join(' ')}
                    >
                      <p className="text-xs text-zinc-300 font-medium">
                        {snap.timestamp.split(' ')[0]}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {snap.timestamp.split(' ')[1]}
                        {' · '}
                        {formatSize(snap.size)}
                      </p>
                      <button
                        onClick={(e) => handleDelete(snap, e)}
                        className="text-xs text-zinc-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all mt-0.5"
                      >
                        Delete
                      </button>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {selected ? (
              <>
                <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700 shrink-0">
                  <p className="text-xs text-zinc-500">Preview — {selected.timestamp}</p>
                  <button
                    onClick={handleRestore}
                    disabled={restoring}
                    className="text-xs bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white px-3 py-1 rounded transition-colors"
                  >
                    {restoring ? 'Restoring...' : '↩ Restore this version'}
                  </button>
                </div>
                <pre className="flex-1 overflow-auto p-4 text-xs text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed">
                  {previewContent}
                </pre>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-zinc-600">
                Select a snapshot to preview
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
