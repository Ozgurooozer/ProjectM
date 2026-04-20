import { useState, useEffect, useRef } from 'react'
import { eventBus } from '../../lib/events'
import { createNote, createFolder, openVault, readNote, writeNote } from '../../lib/tauri'
import { useAppStore } from '../../store/appStore'
import { findTemplates, applyTemplate, todayString } from '../../lib/templates'

type Mode = 'note' | 'folder' | null

export function NewItemButton() {
  const {
    vaultPath,
    fileTree,
    refreshFileTree,
    setActiveNote,
    creatingMode,
    setCreatingMode,
  } = useAppStore()

  const [showMenu, setShowMenu] = useState(false)
  const [name, setName] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('none')
  const [error, setError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  const templates = findTemplates(fileTree)
  const mode: Mode = creatingMode

  // Listen for Ctrl+N
  useEffect(() => {
    return eventBus.on('ui:new-note', () => {
      if (vaultPath) setCreatingMode('note')
    })
  }, [vaultPath, setCreatingMode])

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMenu])

  function cancel() {
    setCreatingMode(null)
    setName('')
    setSelectedTemplate('none')
    setError('')
  }

  async function handleCreate() {
    const trimmed = name.trim()
    if (!trimmed || !vaultPath) return

    try {
      if (mode === 'note') {
        const fileName = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`
        const fullPath = `${vaultPath}/${fileName}`
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
      } else if (mode === 'folder') {
        const folderName = trimmed.replace(/\.md$/i, '')
        const fullPath = `${vaultPath}/${folderName}`
        await createFolder(fullPath)
        const newTree = await openVault(vaultPath)
        refreshFileTree(newTree)
      }
      cancel()
    } catch (err) {
      setError(String(err))
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleCreate()
    if (e.key === 'Escape') cancel()
  }

  if (!vaultPath) return null

  // Inline creation form
  if (mode) {
    return (
      <div className="w-full">
        <div className="flex items-center gap-1 mb-1">
          <span className="text-xs text-zinc-500">{mode === 'note' ? '📄' : '📁'}</span>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === 'note' ? 'Note name…' : 'Folder name…'}
            className="flex-1 bg-zinc-800 text-zinc-200 text-xs rounded px-2 py-1 outline-none focus:ring-1 focus:ring-violet-500 min-w-0"
          />
        </div>

        {mode === 'note' && templates.length > 0 && (
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-400 text-xs rounded px-2 py-1 outline-none border border-zinc-700 focus:ring-1 focus:ring-violet-500 mb-1"
          >
            <option value="none">No template</option>
            {templates.map((t) => (
              <option key={t.path} value={t.path}>
                {t.name.replace(/\.md$/, '')}
              </option>
            ))}
          </select>
        )}

        {error && <p className="text-xs text-red-400 mb-1">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={handleCreate}
            className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
          >
            Create
          </button>
          <button
            onClick={cancel}
            className="text-xs text-zinc-500 hover:text-zinc-400 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // + button with dropdown
  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu((v) => !v)}
        title="New note or folder"
        className="w-6 h-6 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700 transition-colors text-base leading-none"
      >
        +
      </button>

      {showMenu && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-zinc-800 border border-zinc-700 rounded shadow-xl py-1 min-w-[140px]">
          <button
            onClick={() => { setCreatingMode('note'); setShowMenu(false) }}
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 flex items-center gap-2"
          >
            <span>📄</span> New Note
            <span className="ml-auto text-zinc-600">Ctrl+N</span>
          </button>
          <button
            onClick={() => { setCreatingMode('folder'); setShowMenu(false) }}
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 flex items-center gap-2"
          >
            <span>📁</span> New Folder
          </button>
        </div>
      )}
    </div>
  )
}
