import { useState } from 'react'
import { createFolder, openVault } from '../../lib/tauri'
import { useAppStore } from '../../store/appStore'

export function NewFolderButton() {
  const { vaultPath, refreshFileTree, creatingMode, setCreatingMode } = useAppStore()
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  const isCreating = creatingMode === 'folder'

  if (!vaultPath) return null

  function cancel() {
    setCreatingMode(null)
    setName('')
    setError('')
  }

  async function handleCreate() {
    const trimmed = name.trim().replace(/\.md$/i, '')
    if (!trimmed || !vaultPath) return

    const fullPath = `${vaultPath}/${trimmed}`

    try {
      await createFolder(fullPath)
      const newTree = await openVault(vaultPath)
      refreshFileTree(newTree)
      cancel()
    } catch (err) {
      setError(String(err))
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') cancel()
  }

  return (
    <div className="px-3 py-1 border-b border-zinc-700">
      {isCreating ? (
        <div>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Folder name..."
            className="w-full bg-zinc-800 text-zinc-200 text-sm rounded px-2 py-1 outline-none focus:ring-1 focus:ring-violet-500"
          />
          {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
          <div className="flex gap-2 mt-1">
            <button onClick={handleCreate} className="text-xs text-violet-400 hover:text-violet-300">
              Create
            </button>
            <button onClick={cancel} className="text-xs text-zinc-500 hover:text-zinc-400">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreatingMode('folder')}
          className="w-full text-left text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          + New Folder
        </button>
      )}
    </div>
  )
}
