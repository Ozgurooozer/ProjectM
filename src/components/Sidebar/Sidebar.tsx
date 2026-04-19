import { useEffect, useCallback } from 'react'
import { eventBus } from '../../lib/events'
import { selectVaultFolder, openVault, readNote, normalizeVaultPath } from '../../lib/tauri'
import { useAppStore } from '../../store/appStore'
import { useNotificationStore } from '../../store/notificationStore'
import { buildBacklinkIndex } from '../../lib/backlinks'
import { buildTagIndex } from '../../lib/tags'
import { flattenTree } from '../../lib/wikilinks'
import { saveLastVaultPath, saveRecentNotes } from '../../lib/persistence'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { openOrCreateDailyNote } from '../../lib/dailyNotes'
import { pickRandomNote } from '../../lib/randomNote'
import { VectorStore } from '../../lib/vectorStore'
import { embeddingWorker } from '../../lib/embeddingWorkerManager'
import { indexVault } from '../../lib/indexingPipeline'
import { FileTree } from './FileTree'
import { Search } from '../Search/Search'
import { NewNoteButton } from './NewNoteButton'
import { NewFolderButton } from './NewFolderButton'
import { PinnedNotes } from './PinnedNotes'
import { RecentNotes } from './RecentNotes'
import { TagPanel } from '../Tags/TagPanel'
import { IndexingStatus } from './IndexingStatus'
import { pluginRegistry } from '../../lib/plugins'
import type { FileNode } from '../../types'

export function Sidebar() {
  const {
    vaultPath,
    fileTree,
    setVault,
    setBacklinkIndex,
    setTagIndex,
    activeTag,
    setActiveTag,
    setRecentNotes,
    setActiveNote,
    refreshFileTree,
    activeNotePath,
    setIsRandomNote,
    setVectorStore,
    setIndexingProgress,
    embeddingStatus,
  } = useAppStore()
  const addNotification = useNotificationStore((s) => s.addNotification)

  const handleDailyNote = useCallback(async () => {
    if (!vaultPath) return
    try {
      const { path, content } = await openOrCreateDailyNote(vaultPath, fileTree)
      const newTree = await openVault(vaultPath)
      refreshFileTree(newTree)
      setActiveNote(path, content)
    } catch (err) {
      console.error('Could not open daily note:', err)
    }
  }, [vaultPath, fileTree, refreshFileTree, setActiveNote])

  useEffect(() => {
    return eventBus.on('ui:open-daily-note', handleDailyNote)
  }, [handleDailyNote])

  const handleRandomNote = useCallback(async () => {
    if (!vaultPath) return
    const randomPath = pickRandomNote(fileTree, activeNotePath)
    if (!randomPath) return
    try {
      const content = await readNote(randomPath)
      setActiveNote(randomPath, content)
      setIsRandomNote(true)
      setTimeout(() => setIsRandomNote(false), 2000)
    } catch (err) {
      console.error('Could not open random note:', err)
    }
  }, [vaultPath, fileTree, activeNotePath, setActiveNote, setIsRandomNote])

  useEffect(() => {
    return eventBus.on('ui:open-random-note', handleRandomNote)
  }, [handleRandomNote])

  function startIndexingWhenReady(tree: FileNode[], store: VectorStore) {
    function runIndexing() {
      setIndexingProgress({ phase: 'checking', current: 0, total: 0, message: 'Starting...' })
      indexVault(tree, store, (p) => {
        setIndexingProgress({
          phase: p.phase as 'idle' | 'checking' | 'embedding' | 'done' | 'error',
          current: p.current,
          total: p.total,
          message: p.message,
        })
      }).catch(console.warn)
    }

    if (embeddingWorker.getStatus() === 'ready') {
      runIndexing()
    } else {
      const unsub = embeddingWorker.onStatusChange((s) => {
        if (s === 'ready') { unsub(); runIndexing() }
      })
    }
  }

  async function handleOpenVault() {
    const path = await selectVaultFolder()
    if (!path) return

    const normalizedPath = normalizeVaultPath(path)
    const tree = await openVault(normalizedPath)
    setVault(normalizedPath, tree)
    await saveLastVaultPath(normalizedPath)

    setRecentNotes([])
    await saveRecentNotes([])

    const appWindow = getCurrentWindow()
    appWindow.setTitle(`${path.split(/[\\/]/).pop()} — Vault`)

    const index = await buildBacklinkIndex(tree, readNote)
    setBacklinkIndex(index)

    const tagIdx = await buildTagIndex(flattenTree(tree), readNote)
    setTagIndex(tagIdx)

    const store = new VectorStore(normalizedPath)
    await store.open()
    setVectorStore(store)

    startIndexingWhenReady(tree, store)
  }

  // Dot color for embedding status
  const dotClass =
    embeddingStatus === 'ready' ? 'bg-green-500' :
    embeddingStatus === 'loading' ? 'bg-yellow-500 animate-pulse' :
    embeddingStatus === 'error' ? 'bg-red-500' :
    'bg-zinc-600'

  const dotLabel =
    embeddingStatus === 'ready' ? 'AI ready' :
    embeddingStatus === 'loading' ? 'Loading AI...' :
    embeddingStatus === 'error' ? 'AI unavailable' :
    'AI off'

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-r border-zinc-700">
      <div className="p-3 border-b border-zinc-700">
        <button
          onClick={handleOpenVault}
          className="w-full text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded px-3 py-1.5 transition-colors"
        >
          {vaultPath ? '⟳ Change Vault' : '📂 Open Vault'}
        </button>
        {vaultPath && (
          <p className="text-xs text-zinc-500 mt-1 truncate" title={vaultPath}>
            {vaultPath.split(/[\\/]/).pop()}
          </p>
        )}
      </div>

      <Search />
      <NewNoteButton />
      <NewFolderButton />
      {vaultPath && (
        <div className="px-3 pb-2 flex flex-col gap-1.5">
          <button
            onClick={handleDailyNote}
            title="Open today's note (Ctrl+D)"
            className="w-full text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded px-3 py-1.5 transition-colors flex items-center justify-center gap-2"
          >
            📅 Today's Note
          </button>
          <button
            onClick={handleRandomNote}
            title="Open random note (Ctrl+Shift+R)"
            className="w-full text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded px-3 py-1.5 transition-colors"
          >
            🎲 Random Note
          </button>
        </div>
      )}

      {activeTag && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-violet-900/30 border-b border-violet-800/50">
          <span className="text-xs text-violet-400">#{activeTag}</span>
          <button
            onClick={() => setActiveTag(null)}
            className="text-xs text-violet-600 hover:text-violet-400 transition-colors"
          >
            ✕ Clear filter
          </button>
        </div>
      )}

      <PinnedNotes />
      <RecentNotes />

      <div className="flex-1 overflow-y-auto p-2">
        {fileTree.length > 0 ? (
          <FileTree nodes={fileTree} depth={0} onError={(err) => addNotification(err, 'error')} />
        ) : vaultPath ? (
          <div className="text-center mt-8 px-4 space-y-2">
            <p className="text-3xl">📝</p>
            <p className="text-xs text-zinc-500">No notes yet</p>
            <p className="text-xs text-zinc-600">Click "+ New Note" to start</p>
            <p className="text-xs text-zinc-700 mt-3">
              Tip: Create a <code className="text-zinc-600">_templates/</code> folder for note templates
            </p>
          </div>
        ) : (
          <p className="text-xs text-zinc-600 text-center mt-8">Open a vault to start</p>
        )}
      </div>

      <TagPanel />

      {pluginRegistry.sidebarPanels.map((panel) => (
        <div key={panel.id} className="border-t border-zinc-800">
          <div className="px-3 py-1.5 text-xs text-zinc-500 font-medium uppercase tracking-wide">
            {panel.icon} {panel.label}
          </div>
          {panel.render()}
        </div>
      ))}

      <IndexingStatus />

      {/* AI status indicator */}
      <div className="px-3 py-1.5 border-t border-zinc-800">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-settings-ai'))}
          className="flex items-center gap-1.5 w-full hover:opacity-80 transition-opacity"
          title="Click to open AI settings"
        >
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
          <span className="text-xs text-zinc-600">{dotLabel}</span>
        </button>
      </div>
    </div>
  )
}
