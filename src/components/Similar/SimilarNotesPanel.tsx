import { useAppStore } from '../../store/appStore'
import { readNote } from '../../lib/tauri'
import { eventBus } from '../../lib/events'
import type { SimilarityResult } from '../../lib/similaritySearch'

export function SimilarNotesPanel() {
  const {
    similarNotes,
    activeNotePath,
    embeddingStatus,
    indexingProgress,
    setActiveNote,
  } = useAppStore()

  async function handleClick(path: string) {
    const content = await readNote(path)
    setActiveNote(path, content)
    eventBus.emit('note:opened', { path, content })
  }

  if (!activeNotePath) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-xs text-center px-4">
        Open a note to find similar notes
      </div>
    )
  }

  if (embeddingStatus === 'idle' || embeddingStatus === 'loading') {
    return (
      <div className="p-4 text-center space-y-2">
        <div className="text-2xl">🧠</div>
        <p className="text-xs text-zinc-500">Loading AI model...</p>
        <p className="text-xs text-zinc-600">
          This only happens once. Future loads are instant.
        </p>
      </div>
    )
  }

  if (embeddingStatus === 'error') {
    return (
      <div className="p-4 text-center space-y-2">
        <div className="text-2xl">⚠️</div>
        <p className="text-xs text-red-400">AI model unavailable</p>
        <p className="text-xs text-zinc-600">
          Semantic search requires an internet connection on first use to download the model (~23MB).
        </p>
      </div>
    )
  }

  if (indexingProgress.phase === 'embedding' || indexingProgress.phase === 'checking') {
    return (
      <div className="p-4 text-center space-y-2">
        <div className="text-2xl">⚙️</div>
        <p className="text-xs text-zinc-400">Indexing vault...</p>
        <p className="text-xs text-zinc-600">{indexingProgress.message}</p>
        <div className="h-0.5 bg-zinc-700 rounded-full mt-2">
          <div
            className="h-full bg-violet-500 rounded-full transition-all duration-300"
            style={{
              width: indexingProgress.total > 0
                ? `${Math.round((indexingProgress.current / indexingProgress.total) * 100)}%`
                : '0%'
            }}
          />
        </div>
      </div>
    )
  }

  if (similarNotes.length === 0) {
    return (
      <div className="p-4 text-center space-y-1">
        <p className="text-xs text-zinc-600">No similar notes found</p>
        <p className="text-xs text-zinc-700">Add more notes to improve results</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-3 pt-3 pb-1 flex items-center justify-between">
        <p className="text-xs text-zinc-600 font-medium uppercase tracking-wide">
          Similar Notes
        </p>
        <span className="text-xs text-zinc-700">{similarNotes.length} found</span>
      </div>

      <ul className="px-2 pb-2 space-y-1.5">
        {similarNotes.map((note) => (
          <SimilarNoteCard
            key={note.path}
            note={note}
            onClick={() => handleClick(note.path)}
          />
        ))}
      </ul>
    </div>
  )
}

function SimilarNoteCard({
  note,
  onClick,
}: {
  note: SimilarityResult
  onClick: () => void
}) {
  const scorePercent = Math.round(note.score * 100)

  const scoreColor =
    note.score >= 0.80 ? 'bg-green-500' :
    note.score >= 0.65 ? 'bg-violet-500' :
    note.score >= 0.50 ? 'bg-blue-500' :
    'bg-zinc-500'

  const scoreLabelColor =
    note.score >= 0.80 ? 'text-green-400' :
    note.score >= 0.65 ? 'text-violet-400' :
    note.score >= 0.50 ? 'text-blue-400' :
    'text-zinc-500'

  return (
    <li>
      <button
        onClick={onClick}
        className="w-full text-left p-2.5 rounded-lg border border-zinc-700/50
                   hover:border-zinc-600 hover:bg-zinc-700/30 transition-all group"
      >
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className="text-sm text-zinc-200 font-medium truncate group-hover:text-white">
            {note.title}
          </p>
          <span className={`text-xs shrink-0 ${scoreLabelColor}`}>
            {note.scoreLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-1.5">
          <div className="flex-1 h-0.5 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${scoreColor} rounded-full`}
              style={{ width: `${scorePercent}%` }}
            />
          </div>
          <span className="text-xs text-zinc-600 shrink-0">{scorePercent}%</span>
        </div>

        {note.snippet && (
          <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">
            {note.snippet}
          </p>
        )}
      </button>
    </li>
  )
}
