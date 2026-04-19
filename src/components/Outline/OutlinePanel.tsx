import { useMemo } from 'react'
import { eventBus } from '../../lib/events'
import { extractHeadings } from '../../lib/outline'
import { useAppStore } from '../../store/appStore'

export function OutlinePanel() {
  const { noteContent, activeNotePath } = useAppStore()

  const headings = useMemo(() => extractHeadings(noteContent), [noteContent])

  if (!activeNotePath) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-xs">
        Open a note to see outline
      </div>
    )
  }

  if (headings.length === 0) {
    return <div className="p-3 text-xs text-zinc-600">No headings in this note</div>
  }

  function handleClick(id: string) {
    eventBus.emit('ui:outline-scroll', { headingId: id })
  }

  const minLevel = Math.min(...headings.map((h) => h.level))

  return (
    <div className="h-full overflow-y-auto p-2">
      <p className="text-xs text-zinc-600 font-medium uppercase tracking-wide px-2 mb-2">
        Outline
      </p>
      <ul className="space-y-0.5">
        {headings.map((heading, i) => {
          const indent = (heading.level - minLevel) * 12
          return (
            <li key={`${heading.id}-${i}`}>
              <button
                onClick={() => handleClick(heading.id)}
                className="w-full text-left text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded px-2 py-0.5 transition-colors truncate"
                style={{ paddingLeft: `${8 + indent}px` }}
                title={heading.text}
              >
                {heading.level === 1 && <span className="text-zinc-500 mr-1">H1</span>}
                {heading.text}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
