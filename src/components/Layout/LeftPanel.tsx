import { useAppStore } from '../../store/appStore'
import { FileTree } from '../Sidebar/FileTree'
import { Search } from '../Search/Search'
import { TagPanel } from '../Tags/TagPanel'
import { PinnedNotes } from '../Sidebar/PinnedNotes'
import { RecentNotes } from '../Sidebar/RecentNotes'
import { NewItemButton } from '../Sidebar/NewItemButton'
import { useNotificationStore } from '../../store/notificationStore'

export function LeftPanel() {
  const {
    leftPanelId,
    vaultPath,
    fileTree,
    activeTag,
    setActiveTag,
  } = useAppStore()
  const addNotification = useNotificationStore((s) => s.addNotification)

  if (!vaultPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
        <span className="text-4xl">📒</span>
        <p className="text-zinc-400 text-sm font-medium">No vault open</p>
        <p className="text-zinc-600 text-xs">Click the vault icon in the activity bar to open a folder</p>
      </div>
    )
  }

  // ── Search panel ──────────────────────────────────────────
  if (leftPanelId === 'search') {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 border-b border-zinc-800">
          <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Search</p>
        </div>
        <Search embedded />
      </div>
    )
  }

  // ── Tags panel ────────────────────────────────────────────
  if (leftPanelId === 'tags') {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 border-b border-zinc-800">
          <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Tags</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <TagPanel standalone />
        </div>
      </div>
    )
  }

  // ── Recent panel ──────────────────────────────────────────
  if (leftPanelId === 'recent') {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2 border-b border-zinc-800">
          <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">Recent Notes</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <RecentNotes standalone />
        </div>
      </div>
    )
  }

  // ── Files panel (default) ─────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0">
        <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider truncate">
          {vaultPath.split(/[\\/]/).pop()}
        </p>
        <NewItemButton />
      </div>

      {/* Active tag filter banner */}
      {activeTag && (
        <div className="flex items-center justify-between px-3 py-1 bg-violet-900/20 border-b border-violet-800/30 shrink-0">
          <span className="text-xs text-violet-400">#{activeTag}</span>
          <button
            onClick={() => setActiveTag(null)}
            className="text-xs text-violet-600 hover:text-violet-400 transition-colors"
          >
            ✕
          </button>
        </div>
      )}

      {/* Pinned notes */}
      <PinnedNotes />

      {/* File tree */}
      <div className="flex-1 overflow-y-auto p-2">
        {fileTree.length > 0 ? (
          <FileTree
            nodes={fileTree}
            depth={0}
            onError={(err) => addNotification(err, 'error')}
          />
        ) : (
          <div className="text-center mt-8 px-4 space-y-2">
            <p className="text-3xl">📝</p>
            <p className="text-xs text-zinc-500">No notes yet</p>
            <p className="text-xs text-zinc-600">Click + to create your first note</p>
          </div>
        )}
      </div>
    </div>
  )
}
