import { useAppStore } from '../../store/appStore'
import { readNote } from '../../lib/tauri'

export function PinnedNotes() {
  const { pinnedNotes, togglePin, setActiveNote, activeNotePath } = useAppStore()

  if (pinnedNotes.length === 0) return null

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
      <p className="px-3 pt-2 pb-1 text-xs text-zinc-600 font-medium uppercase tracking-wide">
        Pinned
      </p>
      <ul className="pb-1">
        {pinnedNotes.map((path) => {
          const name = path.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? path
          const isActive = activeNotePath === path

          return (
            <li key={path} className="group flex items-center px-2">
              <button
                onClick={() => handleClick(path)}
                className={`flex-1 text-left text-sm px-2 py-0.5 rounded truncate transition-colors ${
                  isActive
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-300 hover:bg-zinc-700 hover:text-white'
                }`}
              >
                ★ {name}
              </button>
              <button
                onClick={() => togglePin(path)}
                className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-400 text-xs px-1 transition-opacity"
                title="Unpin"
              >
                ✕
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
