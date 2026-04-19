import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { readNote } from '../../lib/tauri'
import type { FileNode } from '../../types'

function getAllPaths(nodes: FileNode[]): string[] {
  const paths: string[] = []
  for (const node of nodes) {
    if (!node.isDirectory) paths.push(node.path)
    if (node.children) paths.push(...getAllPaths(node.children))
  }
  return paths
}

export function RecentNotes() {
  const { recentNotes, activeNotePath, setActiveNote, fileTree } = useAppStore()
  const [isExpanded, setIsExpanded] = useState(true)

  const allPaths = new Set(getAllPaths(fileTree))
  const validRecent = recentNotes.filter((p) => allPaths.has(p))

  if (validRecent.length === 0) return null

  async function handleClick(path: string) {
    try {
      const content = await readNote(path)
      setActiveNote(path, content)
    } catch {
      // File may have been deleted
    }
  }

  return (
    <div className="border-b border-zinc-700">
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-zinc-600 font-medium uppercase tracking-wide hover:text-zinc-400 transition-colors"
      >
        <span>Recent</span>
        <span>{isExpanded ? '▾' : '▸'}</span>
      </button>

      {isExpanded && (
        <ul className="pb-1">
          {validRecent.map((path) => {
            const name = path.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? path
            const isActive = activeNotePath === path

            return (
              <li key={path}>
                <button
                  onClick={() => handleClick(path)}
                  className={`w-full text-left text-sm px-4 py-0.5 truncate transition-colors ${
                    isActive
                      ? 'text-white bg-zinc-700'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                  }`}
                  title={path}
                >
                  {name}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
