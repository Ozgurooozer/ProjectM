import { useEffect, useRef } from 'react'
import type { SlashCommand } from '../../lib/slashCommands'

interface Props {
  commands: SlashCommand[]
  selectedIndex: number
  position: { top: number; left: number }
  onSelect: (cmd: SlashCommand) => void
  onHover: (index: number) => void
}

export function SlashCommandMenu({ commands, selectedIndex, position, onSelect, onHover }: Props) {
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (commands.length === 0) return null

  return (
    <div
      className="fixed z-50 bg-zinc-800 border border-zinc-600 rounded-lg shadow-2xl overflow-hidden w-72"
      style={{ top: position.top, left: position.left }}
    >
      <ul ref={listRef} className="max-h-64 overflow-y-auto py-1">
        {commands.map((cmd, i) => (
          <li key={cmd.trigger}>
            <button
              onClick={() => onSelect(cmd)}
              onMouseEnter={() => onHover(i)}
              className={[
                'w-full text-left px-3 py-2 flex items-center gap-3 transition-colors',
                i === selectedIndex ? 'bg-violet-600 text-white' : 'text-zinc-300 hover:bg-zinc-700',
              ].join(' ')}
            >
              <span className="text-sm font-mono w-6 text-center shrink-0 opacity-70">
                {cmd.icon}
              </span>
              <div>
                <p className="text-sm font-medium leading-none">{cmd.label}</p>
                <p className={`text-xs mt-0.5 ${i === selectedIndex ? 'text-violet-200' : 'text-zinc-500'}`}>
                  {cmd.description}
                </p>
              </div>
              <span className={`ml-auto text-xs font-mono shrink-0 ${i === selectedIndex ? 'text-violet-300' : 'text-zinc-600'}`}>
                /{cmd.trigger}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="px-3 py-1.5 border-t border-zinc-700 text-xs text-zinc-600 flex gap-3">
        <span>↑↓ navigate</span>
        <span>↵ insert</span>
        <span>Esc cancel</span>
      </div>
    </div>
  )
}
