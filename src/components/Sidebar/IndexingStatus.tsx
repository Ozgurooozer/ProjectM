import { useAppStore } from '../../store/appStore'

export function IndexingStatus() {
  const { indexingProgress } = useAppStore()

  if (indexingProgress.phase === 'idle') return null

  if (indexingProgress.phase === 'done') {
    return (
      <div className="px-3 py-1 border-t border-zinc-800">
        <p className="text-xs text-zinc-600">✓ {indexingProgress.message}</p>
      </div>
    )
  }

  const pct =
    indexingProgress.total > 0
      ? Math.round((indexingProgress.current / indexingProgress.total) * 100)
      : 0

  return (
    <div className="px-3 py-2 border-t border-zinc-800">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-zinc-500 truncate">{indexingProgress.message}</p>
        <span className="text-xs text-zinc-600 shrink-0 ml-2">{pct}%</span>
      </div>
      <div className="h-0.5 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-violet-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
