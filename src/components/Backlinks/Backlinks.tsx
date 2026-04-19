import { useAppStore } from '../../store/appStore'
import { readNote } from '../../lib/tauri'

export function Backlinks() {
  const { activeNotePath, backlinkIndex, setActiveNote } = useAppStore()

  if (!activeNotePath) return null

  const entries = backlinkIndex[activeNotePath] ?? []

  async function handleClick(sourcePath: string) {
    try {
      const content = await readNote(sourcePath)
      setActiveNote(sourcePath, content)
    } catch (err) {
      console.error('Could not open backlink:', err)
    }
  }

  return (
    <div className="border-t border-zinc-700 p-3 max-h-64 overflow-y-auto shrink-0">
      <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide mb-2">
        Backlinks ({entries.length})
      </p>
      {entries.length === 0 ? (
        <p className="text-xs text-zinc-600">No notes link here</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => {
            const name =
              entry.sourcePath.split('/').pop()?.replace(/\.md$/, '') ?? entry.sourcePath
            return (
              <li key={entry.sourcePath}>
                <button onClick={() => handleClick(entry.sourcePath)} className="w-full text-left group">
                  <p className="text-xs text-violet-400 group-hover:text-violet-300 transition-colors truncate">
                    {name}
                  </p>
                  {entry.snippet && (
                    <p className="text-xs text-zinc-600 mt-0.5 truncate">{entry.snippet}</p>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
