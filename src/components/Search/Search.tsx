import { useState, useRef, useEffect, useCallback } from 'react'
import { eventBus } from '../../lib/events'
import { searchVault, readNote } from '../../lib/tauri'

import type { SearchResult } from '../../lib/tauri'
import { searchByQuery, type SimilarityResult } from '../../lib/similaritySearch'
import { useAppStore } from '../../store/appStore'
import { loadAiSearchEnabled, saveAiSearchEnabled } from '../../lib/persistence'

type CombinedResult =
  | (SearchResult & { resultType: 'keyword' })
  | (SimilarityResult & { resultType: 'semantic' })

export function Search({ embedded = false }: { embedded?: boolean }) {
  const {
    vaultPath,
    vectorStore,
    embeddingStatus,
    setActiveNote,
  } = useAppStore()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CombinedResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [aiEnabled, setAiEnabled] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadAiSearchEnabled().then(setAiEnabled)
  }, [])

  useEffect(() => {
    return eventBus.on('ui:focus-search', () => {
      inputRef.current?.focus()
    })
  }, [])

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim() || !vaultPath) {
      setResults([])
      return
    }

    setIsSearching(true)

    try {
      const keywordResults = await searchVault(vaultPath, q.trim())
      const keywordPaths = new Set(keywordResults.map((r) => r.path))

      const combined: CombinedResult[] = keywordResults.map((r) => ({
        ...r,
        resultType: 'keyword' as const,
      }))

      setResults([...combined])

      if (aiEnabled && vectorStore && embeddingStatus === 'ready') {
        const semanticResults = await searchByQuery(q.trim(), vectorStore, {
          topK: 8,
          minScore: 0.45,
        })

        const newSemantic = semanticResults
          .filter((r) => !keywordPaths.has(r.path))
          .map((r) => ({ ...r, resultType: 'semantic' as const }))

        setResults([...combined, ...newSemantic])
      }
    } catch (err) {
      console.error('Search error:', err)
    } finally {
      setIsSearching(false)
    }
  }, [vaultPath, vectorStore, embeddingStatus, aiEnabled])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setQuery(value)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) { setResults([]); return }

    debounceRef.current = setTimeout(() => runSearch(value), 300)
  }

  function toggleAi() {
    const newVal = !aiEnabled
    setAiEnabled(newVal)
    saveAiSearchEnabled(newVal)
  }

  async function handleResultClick(path: string) {
    const content = await readNote(path)
    setActiveNote(path, content)
    eventBus.emit('note:opened', { path, content })
    setQuery('')
    setResults([])
    inputRef.current?.blur()
  }

  const canUseAI = embeddingStatus === 'ready' && !!vectorStore

  return (
    <div className={embedded ? 'flex flex-col flex-1 overflow-hidden' : 'border-b border-zinc-700'}>
      <div className="p-3 pb-0">
        <div className="relative">
          <input
            ref={inputRef}
            id="search-input"
            name="search"
            type="search"
            value={query}
            onChange={handleChange}
            placeholder="Search notes…"
            className="w-full bg-zinc-800 text-zinc-200 text-sm rounded px-3 py-1.5
                       outline-none focus:ring-1 focus:ring-violet-500
                       placeholder:text-zinc-600 pr-8"
          />
          {isSearching && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <div className="w-3 h-3 border border-zinc-500 border-t-violet-400 rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {query && (
        <div className="px-3 pt-1.5 pb-2 flex items-center justify-between">
          <span className="text-xs text-zinc-600">
            {results.length > 0 ? `${results.length} results` : 'No results'}
          </span>
          <button
            onClick={toggleAi}
            disabled={!canUseAI}
            className={`
              flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors
              ${aiEnabled && canUseAI
                ? 'bg-violet-900/50 text-violet-400 border border-violet-800'
                : 'text-zinc-600 border border-zinc-700'}
              disabled:opacity-40 disabled:cursor-not-allowed
            `}
            title={canUseAI ? 'Toggle AI semantic search' : 'AI search requires model to be loaded'}
          >
            🧠 AI {aiEnabled && canUseAI ? 'ON' : 'OFF'}
          </button>
        </div>
      )}

      {results.length > 0 && (
        <ul className={`mx-3 mb-3 space-y-1 overflow-y-auto border border-zinc-700 rounded-lg overflow-hidden ${embedded ? 'flex-1' : 'max-h-72'}`}>
          {results.map((result) => (
            <li key={result.path}>
              <button
                onClick={() => handleResultClick(result.path)}
                className="w-full text-left px-3 py-2 hover:bg-zinc-700 transition-colors"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <p className="text-sm text-zinc-200 truncate flex-1">
                    {result.resultType === 'keyword'
                      ? (result as SearchResult & { resultType: 'keyword' }).name
                      : (result as SimilarityResult & { resultType: 'semantic' }).title}
                  </p>
                  {result.resultType === 'semantic' && (
                    <span className="text-xs bg-violet-900/50 text-violet-400
                                     px-1.5 py-0.5 rounded shrink-0 border border-violet-800/50">
                      🧠 AI
                    </span>
                  )}
                </div>

                {'snippet' in result && result.snippet && (
                  <p className="text-xs text-zinc-500 truncate">
                    {'score' in result
                      ? `${Math.round((result as SimilarityResult).score * 100)}% match — `
                      : ''}
                    {result.snippet}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
