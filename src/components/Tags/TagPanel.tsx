import { useAppStore } from '../../store/appStore'

export function TagPanel({ standalone = false }: { standalone?: boolean }) {
  const { tagIndex, activeTag, setActiveTag } = useAppStore()

  const tags = Object.entries(tagIndex).sort((a, b) => b[1].length - a[1].length)

  if (tags.length === 0) {
    return standalone ? (
      <div className="p-4 text-xs text-zinc-600 text-center">No tags found</div>
    ) : null
  }

  if (standalone) {
    return (
      <div className="p-3">
        {activeTag && (
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-violet-400">#{activeTag}</span>
            <button
              onClick={() => setActiveTag(null)}
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Clear
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-1">
          {tags.map(([tag, paths]) => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                activeTag === tag
                  ? 'bg-violet-600 text-white'
                  : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600 hover:text-zinc-200'
              }`}
            >
              #{tag}
              <span className="ml-1 opacity-60">{paths.length}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-zinc-700 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-zinc-500 font-medium uppercase tracking-wide">Tags</p>
        {activeTag && (
          <button
            onClick={() => setActiveTag(null)}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {tags.map(([tag, paths]) => (
          <button
            key={tag}
            onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
              activeTag === tag
                ? 'bg-violet-600 text-white'
                : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600 hover:text-zinc-200'
            }`}
          >
            #{tag}
            <span className="ml-1 opacity-60">{paths.length}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
