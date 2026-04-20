import { useAppStore } from '../../store/appStore'
import { pathToTitle } from '../../lib/wikilinks'

export function TabBar() {
  const { openTabs, activeNotePath, openTab, closeTab } = useAppStore()

  if (openTabs.length === 0) return null

  return (
    <div className="flex items-center overflow-x-auto shrink-0 border-b border-zinc-800 bg-zinc-950 min-h-[32px]">
      {openTabs.map((path) => {
        const isActive = path === activeNotePath
        const title = pathToTitle(path) || path
        return (
          <div
            key={path}
            className={[
              'flex items-center gap-1 px-3 py-1 text-xs shrink-0 cursor-pointer border-r border-zinc-800 max-w-[160px] group',
              isActive
                ? 'bg-zinc-800 text-zinc-100 border-t-2 border-t-violet-500'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900',
            ].join(' ')}
            onClick={() => openTab(path)}
            title={path}
          >
            <span className="truncate flex-1">{title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); closeTab(path) }}
              className="opacity-0 group-hover:opacity-100 hover:text-zinc-100 transition-opacity ml-1 leading-none"
              aria-label={`Close ${title}`}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
