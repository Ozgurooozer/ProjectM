import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../../store/appStore'
import { readNote } from '../../lib/tauri'
import { flattenTree } from '../../lib/wikilinks'
import { fuzzySearch } from '../../lib/fuzzy'

interface Props {
  onClose: () => void
}

function highlightMatch(text: string, indices: number[]): React.ReactNode {
  if (indices.length === 0) return text
  const result: React.ReactNode[] = []
  let prev = 0
  const indexSet = new Set(indices)
  for (let i = 0; i < text.length; i++) {
    if (indexSet.has(i)) {
      if (i > prev) result.push(text.slice(prev, i))
      result.push(<mark key={i} className="qs-highlight">{text[i]}</mark>)
      prev = i + 1
    }
  }
  if (prev < text.length) result.push(text.slice(prev))
  return result
}

export function QuickSwitcher({ onClose }: Props) {
  const { fileTree, setActiveNote } = useAppStore()
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const noteNames = flattenTree(fileTree).map((p) => ({
    path: p,
    name: p.split('/').pop()?.replace(/\.md$/, '') ?? '',
  }))

  const results = fuzzySearch(noteNames, query, (item) => item.name).slice(0, 10)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setSelectedIdx(0)
  }, [query])

  const openNote = useCallback(
    async (path: string) => {
      try {
        const content = await readNote(path)
        setActiveNote(path, content)
        onClose()
      } catch (err) {
        console.error('Could not open note:', err)
      }
    },
    [setActiveNote, onClose]
  )

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (results[selectedIdx]) openNote(results[selectedIdx].item.path)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  useEffect(() => {
    const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24" onClick={onClose}>
      <div
        className="relative bg-zinc-800 border border-zinc-600 rounded-lg shadow-2xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b border-zinc-700">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes..."
            className="w-full bg-transparent text-zinc-100 text-sm outline-none placeholder-zinc-600"
          />
        </div>

        {results.length > 0 ? (
          <ul ref={listRef} className="py-1 max-h-64 overflow-y-auto">
            {results.map((result, idx) => (
              <li key={result.item.path}>
                <button
                  onClick={() => openNote(result.item.path)}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  className={`w-full text-left px-4 py-2 text-sm truncate transition-colors ${
                    idx === selectedIdx
                      ? 'bg-violet-600 text-white'
                      : 'text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  📄 {highlightMatch(result.item.name, result.indices)}
                </button>
              </li>
            ))}
          </ul>
        ) : query ? (
          <div className="px-4 py-3 text-sm text-zinc-600">No notes found</div>
        ) : (
          <div className="px-4 py-3 text-sm text-zinc-600">Start typing to search notes</div>
        )}

        <div className="px-3 py-1.5 border-t border-zinc-700 text-xs text-zinc-600 flex gap-3">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  )
}
