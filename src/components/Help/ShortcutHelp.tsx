interface Shortcut {
  keys: string
  description: string
}

const shortcuts: Shortcut[] = [
  { keys: 'Ctrl+N', description: 'New note' },
  { keys: 'Ctrl+O', description: 'Quick switcher (search notes)' },
  { keys: 'Ctrl+P', description: 'Command palette — run any command' },
  { keys: 'Ctrl+D', description: "Open today's daily note" },
  { keys: 'Ctrl+Shift+R', description: 'Open a random note' },
  { keys: 'Ctrl+S', description: 'Save now' },
  { keys: 'Ctrl+F', description: 'Focus search' },
  { keys: 'Ctrl+R', description: 'Toggle reading mode' },
  { keys: '/', description: 'Slash commands (start of line)' },
  { keys: '[[', description: 'Wiki-link autocomplete' },
  { keys: 'Double-click', description: 'Rename note' },
  { keys: 'Right-click', description: 'Note context menu' },
  { keys: 'Ctrl+?', description: 'This help panel' },
]

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-zinc-800 border border-zinc-700 rounded-lg p-5 w-80 shadow-2xl">
        <h2 className="text-sm font-medium text-zinc-200 mb-3">Keyboard Shortcuts</h2>
        <ul className="space-y-2">
          {shortcuts.map((s) => (
            <li key={s.keys} className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">{s.description}</span>
              <kbd className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded font-mono">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
        <button
          onClick={onClose}
          className="mt-4 w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Close (Esc)
        </button>
      </div>
    </div>
  )
}
