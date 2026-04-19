import { useState, useEffect, useRef } from 'react'
import { commandRegistry, type Command } from '../../lib/commands'
import { fuzzyMatch } from '../../lib/fuzzy'

interface Props {
  onClose: () => void
}

export function CommandPalette({ onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Command[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const all = commandRegistry.getAll()

    if (!query.trim()) {
      setResults(all)
      setSelectedIndex(0)
      return
    }

    const q = query.toLowerCase()
    const filtered = all
      .filter(
        (cmd) =>
          fuzzyMatch(q, cmd.name.toLowerCase()) ||
          fuzzyMatch(q, cmd.category.toLowerCase())
      )
      .sort((a, b) => {
        const scoreA = fuzzyMatch(q, a.name.toLowerCase())?.score ?? 0
        const scoreB = fuzzyMatch(q, b.name.toLowerCase())?.score ?? 0
        return scoreB - scoreA
      })

    setResults(filtered)
    setSelectedIndex(0)
  }, [query])

  async function runCommand(cmd: Command) {
    if (cmd.enabled && !cmd.enabled()) return
    onClose()
    await new Promise((r) => setTimeout(r, 50))
    cmd.action()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (results[selectedIndex]) runCommand(results[selectedIndex])
        break
      case 'Escape':
        onClose()
        break
    }
  }

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const grouped = !query.trim()
    ? results.reduce<Record<string, Command[]>>((acc, cmd) => {
        if (!acc[cmd.category]) acc[cmd.category] = []
        acc[cmd.category].push(cmd)
        return acc
      }, {})
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full max-w-xl mx-4 bg-zinc-800 border border-zinc-600 rounded-lg shadow-2xl overflow-hidden">
        <div className="flex items-center px-4 py-3 border-b border-zinc-700">
          <span className="text-zinc-500 mr-3">⌘</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 bg-transparent text-zinc-100 text-sm outline-none placeholder:text-zinc-600"
          />
          <span className="text-xs text-zinc-600 ml-2">Esc to close</span>
        </div>

        <ul ref={listRef} className="max-h-96 overflow-y-auto py-1">
          {grouped
            ? Object.entries(grouped).map(([category, cmds]) => (
                <li key={category}>
                  <p className="px-4 py-1.5 text-xs text-zinc-600 font-medium uppercase tracking-wide">
                    {category}
                  </p>
                  {cmds.map((cmd) => {
                    const globalIndex = results.indexOf(cmd)
                    return (
                      <CommandItem
                        key={cmd.id}
                        cmd={cmd}
                        isSelected={globalIndex === selectedIndex}
                        isDisabled={cmd.enabled ? !cmd.enabled() : false}
                        onSelect={() => setSelectedIndex(globalIndex)}
                        onRun={() => runCommand(cmd)}
                      />
                    )
                  })}
                </li>
              ))
            : results.map((cmd, i) => (
                <CommandItem
                  key={cmd.id}
                  cmd={cmd}
                  isSelected={i === selectedIndex}
                  isDisabled={cmd.enabled ? !cmd.enabled() : false}
                  onSelect={() => setSelectedIndex(i)}
                  onRun={() => runCommand(cmd)}
                />
              ))}

          {query && results.length === 0 && (
            <li className="px-4 py-6 text-center text-zinc-600 text-sm">
              No commands match "{query}"
            </li>
          )}
        </ul>

        <div className="px-4 py-2 border-t border-zinc-700 flex gap-4 text-xs text-zinc-600">
          <span>↑↓ navigate</span>
          <span>↵ run</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  )
}

function CommandItem({
  cmd,
  isSelected,
  isDisabled,
  onSelect,
  onRun,
}: {
  cmd: Command
  isSelected: boolean
  isDisabled: boolean
  onSelect: () => void
  onRun: () => void
}) {
  return (
    <button
      onClick={onRun}
      onMouseEnter={onSelect}
      disabled={isDisabled}
      className={[
        'w-full text-left px-4 py-2 flex items-center justify-between transition-colors',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        isSelected && !isDisabled ? 'bg-violet-600 text-white' : 'text-zinc-300 hover:bg-zinc-700',
      ].join(' ')}
    >
      <span className="text-sm">{cmd.name}</span>
      {cmd.shortcut && (
        <kbd
          className={[
            'text-xs px-1.5 py-0.5 rounded font-mono',
            isSelected ? 'bg-violet-500 text-white' : 'bg-zinc-700 text-zinc-400',
          ].join(' ')}
        >
          {cmd.shortcut}
        </kbd>
      )}
    </button>
  )
}
