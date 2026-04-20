import React, { useState, useEffect, useRef } from 'react'
import { confirm, message } from '@tauri-apps/plugin-dialog'
import { readNote, renameNote, deleteNote, openVault, renameFolder, deleteFolder, propagateRename } from '../../lib/tauri'
import { useAppStore } from '../../store/appStore'
import { showToast } from '../UI/Toast'
import { isDailyNote } from '../../lib/dailyNotes'
import { pluginRegistry } from '../../lib/plugins'
import type { FileNode } from '../../types'

interface Props {
  nodes: FileNode[]
  depth: number
  onError?: (error: string) => void
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']

function isImageFile(name: string): boolean {
  const lower = name.toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/** Safe directory from a normalized (forward-slash) path */
function dirOf(path: string, name: string): string {
  const idx = path.lastIndexOf('/')
  return idx >= 0 ? path.slice(0, idx + 1) : path.replace(name, '')
}

export const FileTree = React.memo(function FileTree({ nodes, depth, onError }: Props) {
  const { activeNotePath, setActiveNote, vaultPath, refreshFileTree, clearActiveNote, cutPath, setCutPath, activeTag, tagIndex, pinnedNotes, togglePin } =
    useAppStore()

  const [openDirs, setOpenDirs] = useState<Set<string>>(() => new Set())
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState('')
  const [contextMenu, setContextMenu] = useState<{ node: FileNode; x: number; y: number } | null>(null)

  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeNotePath])

  // Keyboard navigation: arrow keys, enter
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!vaultPath) return
      
      // Only handle keyboard if focus is in the file tree area
      const target = e.target as HTMLElement
      if (!target.closest('[data-filetree]')) return

      if (e.key === 'Enter' && activeNotePath) {
        e.preventDefault()
        // Open/toggle selected item
        const allNodes = flattenNodes(nodes)
        const activeNode = allNodes.find(n => n.path === activeNotePath)
        if (activeNode?.isDirectory) {
          toggleDir(activeNotePath)
        } else if (activeNode) {
          handleNoteClick(activeNode)
        }
      }
      
      if (e.key === 'Delete' && activeNotePath) {
        e.preventDefault()
        const allNodes = flattenNodes(nodes)
        const activeNode = allNodes.find(n => n.path === activeNotePath)
        if (activeNode) handleDelete(activeNode)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeNotePath, vaultPath, nodes])

  // Flatten file tree to array for easier navigation
  function flattenNodes(nodes: FileNode[]): FileNode[] {
    const result: FileNode[] = []
    function recurse(items: FileNode[]) {
      for (const item of items) {
        result.push(item)
        if (item.isDirectory && item.children?.length) {
          recurse(item.children)
        }
      }
    }
    recurse(nodes)
    return result
  }

  function toggleDir(path: string) {
    setOpenDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  async function handleNoteClick(node: FileNode) {
    if (node.isDirectory || renamingPath) return
    try {
      const content = await readNote(node.path)
      setActiveNote(node.path, content)
    } catch (err) {
      const errorMsg = `Could not open file: ${String(err)}`
      console.error('File read error:', err)
      onError?.(errorMsg)
    }
  }

  function startRename(node: FileNode) {
    setRenamingPath(node.path)
    setRenameValue(node.name.replace(/\.md$/, ''))
    setRenameError('')
  }

  async function commitRename(node: FileNode) {
    if (!renameValue.trim() || !vaultPath) { setRenamingPath(null); return }

    // For folders, don't add .md extension
    let newFileName = renameValue.trim()
    if (!node.isDirectory) {
      newFileName = newFileName.endsWith('.md') ? newFileName : `${newFileName}.md`
    }

    const dir = dirOf(node.path, node.name)
    const newPath = dir + newFileName

    if (newPath === node.path) { setRenamingPath(null); return }

    try {
      if (node.isDirectory) {
        await renameFolder(node.path, newPath)
      } else {
        await renameNote(node.path, newPath)
        // Propagate rename: update [[links]] in all notes
        const oldName = node.name.replace(/\.md$/, '')
        const newBaseName = newFileName.replace(/\.md$/, '')
        if (oldName !== newBaseName) {
          const updated = await propagateRename(vaultPath, oldName, newBaseName)
          if (updated.length > 0) {
            showToast(`Updated links in ${updated.length} note${updated.length !== 1 ? 's' : ''}`, 'success')
          }
        }
      }
      const newTree = await openVault(vaultPath)
      refreshFileTree(newTree)
      if (activeNotePath === node.path) {
        const content = await readNote(newPath)
        setActiveNote(newPath, content)
      }
      setRenamingPath(null)
      setRenameError('')
    } catch (err) {
      setRenameError(String(err))
    }
  }

  function handleRenameKeyDown(e: React.KeyboardEvent, node: FileNode) {
    if (e.key === 'Enter') commitRename(node)
    if (e.key === 'Escape') { setRenamingPath(null); setRenameError('') }
  }

  function handleContextMenu(e: React.MouseEvent, node: FileNode) {
    e.preventDefault()
    setContextMenu({ node, x: e.clientX, y: e.clientY })
  }

  function handleCut(node: FileNode) {
    setCutPath(node.path, node.isDirectory ? 'folder' : 'file')
    setContextMenu(null)
  }

  async function handlePaste(targetDir: FileNode) {
    if (!cutPath || !vaultPath) return

    const fileName = cutPath.split('/').pop()
    if (!fileName) return

    const newPath = `${targetDir.path}/${fileName}`
    if (newPath === cutPath) {
      setCutPath(null)
      return
    }

    try {
      // For now, we'll use renameNote/renameFolder which also works for moving
      // within the same vault
      await renameNote(cutPath, newPath)
      const newTree = await openVault(vaultPath)
      refreshFileTree(newTree)
      if (activeNotePath === cutPath) {
        const content = await readNote(newPath)
        setActiveNote(newPath, content)
      }
      setCutPath(null)
    } catch (err) {
      console.error('Paste failed:', err)
      await message(`Could not move: ${String(err)}`, { title: 'Move failed', kind: 'error' })
    }
  }

  async function handleDelete(node: FileNode) {
    if (!vaultPath) return
    const confirmed = await confirm(`Delete "${node.name}"?\nThis cannot be undone.`, {
      title: `Delete ${node.isDirectory ? 'Folder' : 'Note'}`,
      kind: 'warning',
    })
    if (!confirmed) return

    try {
      if (node.isDirectory) {
        await deleteFolder(node.path)
      } else {
        await deleteNote(node.path)
      }
      const newTree = await openVault(vaultPath)
      refreshFileTree(newTree)
      if (activeNotePath === node.path) clearActiveNote()
    } catch (err) {
      console.error('Delete failed:', err)
      await message(`Could not delete: ${String(err)}`, { title: 'Delete failed', kind: 'error' })
    }
    setContextMenu(null)
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
        e.preventDefault()
        // Try to cut active note if exists
        if (activeNotePath) {
          setCutPath(activeNotePath, 'file')
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault()
        // Paste to vault root if cut path exists
        if (cutPath && vaultPath) {
          const fileName = cutPath.split('/').pop()
          if (fileName) {
            const newPath = `${vaultPath}/${fileName}`
            if (newPath !== cutPath) {
              renameNote(cutPath, newPath)
                .then(() => openVault(vaultPath))
                .then((tree) => refreshFileTree(tree))
                .then(() => {
                  setCutPath(null)
                })
                .catch((err) => console.error('Paste failed:', err))
            }
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [cutPath, activeNotePath, vaultPath])

  return (
    <ul
      data-filetree
      role="tree"
      className="space-y-0.5"
      aria-label="Vault file tree"
    >
      {nodes
        .filter((node) => node.name !== '_templates')
        .filter((node) => node.isDirectory || !isImageFile(node.name))
        .filter((node) => {
          if (!activeTag) return true
          const tagPaths = new Set(tagIndex[activeTag] ?? [])
          if (node.isDirectory) {
            return (node.children ?? []).some(function check(child: FileNode): boolean {
              if (child.isDirectory) return (child.children ?? []).some(check)
              return tagPaths.has(child.path)
            })
          }
          return tagPaths.has(node.path)
        })
        .map((node) => (
        <li key={node.path}>
          {renamingPath === node.path ? (
            <div style={{ paddingLeft: `${(depth + 1) * 12}px` }} className="pr-2">
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => handleRenameKeyDown(e, node)}
                onBlur={() => commitRename(node)}
                className="w-full bg-zinc-800 text-zinc-200 text-sm rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-violet-500"
                aria-label={`Rename ${node.name}`}
              />
              {renameError && <p className="text-xs text-red-400 mt-0.5">{renameError}</p>}
            </div>
          ) : node.isDirectory ? (
            <button
              onClick={() => toggleDir(node.path)}
              onContextMenu={(e) => handleContextMenu(e, node)}
              role="treeitem"
              aria-expanded={openDirs.has(node.path)}
              aria-level={depth + 1}
              aria-label={`Folder ${node.name}`}
              className={[
                'w-full text-left text-sm px-2 py-0.5 rounded truncate transition-colors text-zinc-400 font-medium',
                'hover:bg-zinc-800',
                cutPath === node.path ? 'opacity-50' : '',
              ].join(' ')}
              style={{ paddingLeft: `${(depth + 1) * 12}px` }}
            >
              {openDirs.has(node.path) ? '📂' : '📁'} {node.name}
            </button>
          ) : (
            <button
              ref={activeNotePath === node.path ? activeRef : null}
              onClick={() => handleNoteClick(node)}
              onDoubleClick={() => startRename(node)}
              onContextMenu={(e) => handleContextMenu(e, node)}
              role="treeitem"
              aria-level={depth + 1}
              aria-selected={activeNotePath === node.path}
              aria-label={`Note ${node.name}`}
              className={[
                'w-full text-left text-sm px-2 py-0.5 rounded truncate transition-colors',
                'text-zinc-300 hover:bg-zinc-700 hover:text-white',
                activeNotePath === node.path ? 'bg-zinc-700 text-white' : '',
                cutPath === node.path ? 'opacity-50' : '',
              ].join(' ')}
              style={{ paddingLeft: `${(depth + 1) * 12}px` }}
            >
              {pinnedNotes.includes(node.path) ? '★' : isDailyNote(node.name) ? '📅' : '📄'} {isDailyNote(node.name) ? node.name.replace(/\.md$/, '') : node.name}
            </button>
          )}

          {node.isDirectory && openDirs.has(node.path) && node.children && node.children.length > 0 && (
            <FileTree nodes={node.children} depth={depth + 1} onError={onError} />
          )}
        </li>
      ))}

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-20 bg-zinc-800 border border-zinc-600 rounded shadow-xl py-1 min-w-[140px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            {/* Pin/Unpin - available for files only */}
            {!contextMenu.node.isDirectory && (
              <button
                onClick={() => { togglePin(contextMenu.node.path); setContextMenu(null) }}
                className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
              >
                {pinnedNotes.includes(contextMenu.node.path) ? '★ Unpin' : '☆ Pin to top'}
              </button>
            )}

            {/* Cut button - available for both files and folders */}
            <button
              onClick={() => { handleCut(contextMenu.node); setContextMenu(null) }}
              className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 flex justify-between items-center"
            >
              <span>Cut</span>
              <span className="text-xs text-zinc-500">Ctrl+X</span>
            </button>

            {/* Paste button - available for folders when something is cut */}
            {contextMenu.node.isDirectory && cutPath && (
              <button
                onClick={() => { handlePaste(contextMenu.node); setContextMenu(null) }}
                className="w-full text-left px-3 py-1.5 text-sm text-violet-400 hover:bg-zinc-700 flex justify-between items-center"
              >
                <span>Paste</span>
                <span className="text-xs text-zinc-500">Ctrl+V</span>
              </button>
            )}

            {/* Rename button - available for both files and folders */}
            <button
              onClick={() => { startRename(contextMenu.node); setContextMenu(null) }}
              className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
            >
              Rename
            </button>

            {/* Delete button - available for both files and folders */}
            <button
              onClick={() => handleDelete(contextMenu.node)}
              className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-zinc-700"
            >
              Delete
            </button>

            {/* Plugin-registered context menu items */}
            {pluginRegistry.contextMenuItems
              .filter((item) =>
                item.showFor === 'both' ||
                (item.showFor === 'folder') === contextMenu.node.isDirectory
              )
              .map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    item.onClick(contextMenu.node.path)
                    setContextMenu(null)
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
                >
                  {item.label}
                </button>
              ))}
          </div>
        </>
      )}
    </ul>
  )
})
