import { useState, useEffect } from 'react'
import { eventBus } from '../../lib/events'
import { createNote, openVault, readNote, writeNote } from '../../lib/tauri'
import { useAppStore } from '../../store/appStore'
import { findTemplates, applyTemplate, todayString } from '../../lib/templates'

export function NewNoteButton() {
  const { vaultPath, fileTree, refreshFileTree, setActiveNote, creatingMode, setCreatingMode } = useAppStore()
  const [name, setName] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('none')
  const [error, setError] = useState('')

  const isCreating = creatingMode === 'note'
  const templates = findTemplates(fileTree)

  useEffect(() => {
    return eventBus.on('ui:new-note', () => {
      if (vaultPath) setCreatingMode('note')
    })
  }, [vaultPath, setCreatingMode])

  if (!vaultPath) return null

  function cancel() {
    setCreatingMode(null)
    setName('')
    setSelectedTemplate('none')
    setError('')
  }

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed || !vaultPath) return

    const fileName = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`
    const fullPath = `${vaultPath}/${fileName}`

    try {
      await createNote(fullPath)

      if (selectedTemplate !== 'none') {
        const templateNode = templates.find((t) => t.path === selectedTemplate)
        if (templateNode) {
          const templateContent = await readNote(templateNode.path)
          const filled = applyTemplate(templateContent, {
            title: trimmed.replace(/\.md$/, ''),
            date: todayString(),
          })
          await writeNote(fullPath, filled)
        }
      }

      const newTree = await openVault(vaultPath)
      refreshFileTree(newTree)
      const content = await readNote(fullPath)
      setActiveNote(fullPath, content)
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
    <div className="px-3 py-2 border-b border-zinc-700">
      {isCreating ? (
        <div className="space-y-1.5">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Note name..."
            className="w-full bg-zinc-800 text-zinc-200 text-sm rounded px-2 py-1 outline-none focus:ring-1 focus:ring-violet-500"
          />

          {templates.length > 0 && (
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="w-full bg-zinc-800 text-zinc-400 text-xs rounded px-2 py-1 outline-none border border-zinc-700 focus:ring-1 focus:ring-violet-500"
            >
              <option value="none">No template</option>
              {templates.map((t) => (
                <option key={t.path} value={t.path}>
                  {t.name.replace(/\.md$/, '')}
                </option>
              ))}
            </select>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button onClick={handleCreate} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
              Create
            </button>
            <button onClick={cancel} className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreatingMode('note')}
          className="w-full text-left text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          + New Note
        </button>
      )}
    </div>
  )
}
