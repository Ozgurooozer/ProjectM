import { useState } from 'react'
import { parseFrontmatter, serializeFrontmatter } from '../../lib/frontmatter'
import { useAppStore } from '../../store/appStore'

export function FrontmatterPanel() {
  const { noteContent, setNoteContent, activeNotePath } = useAppStore()
  const [isExpanded, setIsExpanded] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  if (!activeNotePath) return null

  const { frontmatter, body } = parseFrontmatter(noteContent)

  if (!frontmatter) {
    return (
      <div className="border-b border-zinc-800 px-4 py-1">
        <button
          onClick={() => {
            setNoteContent(`---\n\n---\n\n${noteContent}`)
            setIsExpanded(true)
          }}
          className="text-xs text-zinc-700 hover:text-zinc-500 transition-colors"
        >
          + Add properties
        </button>
      </div>
    )
  }

  function updateField(key: string, value: string) {
    if (!frontmatter) return
    const updated = { ...frontmatter }
    if (key === 'tags') {
      updated[key] = value.split(',').map((t) => t.trim()).filter(Boolean)
    } else {
      updated[key] = value
    }
    setNoteContent(serializeFrontmatter(updated, body))
  }

  function removeField(key: string) {
    if (!frontmatter) return
    const updated = { ...frontmatter }
    delete updated[key]
    setNoteContent(serializeFrontmatter(updated, body))
  }

  function addField() {
    if (!frontmatter) return
    const key = `field${Object.keys(frontmatter).length + 1}`
    setNoteContent(serializeFrontmatter({ ...frontmatter, [key]: '' }, body))
  }

  const entries = Object.entries(frontmatter)

  return (
    <div className="border-b border-zinc-700 bg-zinc-900/50">
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        <span>Properties ({entries.length})</span>
        <span>{isExpanded ? '▾' : '▸'}</span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-3 space-y-1.5">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-start gap-2">
              <span
                className="text-xs text-zinc-500 font-medium w-24 shrink-0 pt-0.5 truncate"
                title={key}
              >
                {key}
              </span>

              {editingKey === key ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => {
                    updateField(key, editValue)
                    setEditingKey(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') {
                      updateField(key, editValue)
                      setEditingKey(null)
                    }
                  }}
                  className="flex-1 bg-zinc-800 text-zinc-200 text-xs rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-violet-500"
                />
              ) : (
                <button
                  onClick={() => {
                    setEditingKey(key)
                    setEditValue(
                      Array.isArray(value) ? (value as unknown[]).join(', ') : String(value ?? '')
                    )
                  }}
                  className="flex-1 text-left text-xs text-zinc-300 hover:text-white bg-zinc-800/50 hover:bg-zinc-800 rounded px-2 py-0.5 truncate transition-colors"
                >
                  {Array.isArray(value) ? (value as unknown[]).join(', ') : String(value ?? '')}
                </button>
              )}

              <button
                onClick={() => removeField(key)}
                className="text-zinc-700 hover:text-red-400 text-xs transition-colors shrink-0 pt-0.5"
              >
                ✕
              </button>
            </div>
          ))}

          <button
            onClick={addField}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            + Add field
          </button>
        </div>
      )}
    </div>
  )
}
