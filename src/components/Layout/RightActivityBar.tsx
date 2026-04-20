import { useAppStore } from '../../store/appStore'
import type { RightPanelId } from '../../store/slices/uiSlice'

function IconBacklinks() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  )
}

function IconOutline() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="6" y1="12" x2="21" y2="12" />
      <line x1="9" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function IconGraph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  )
}

function IconBrain() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0112 4.5v15a2.5 2.5 0 01-4.96-.46 2.5 2.5 0 01-1.07-4.69A3 3 0 016 9.5a3 3 0 013.5-2.96A2.5 2.5 0 019.5 2z" />
      <path d="M14.5 2A2.5 2.5 0 0112 4.5v15a2.5 2.5 0 004.96-.46 2.5 2.5 0 001.07-4.69A3 3 0 0018 9.5a3 3 0 00-3.5-2.96A2.5 2.5 0 0014.5 2z" />
    </svg>
  )
}

interface RightNavItem {
  id: RightPanelId
  title: string
  icon: React.ReactNode
}

const RIGHT_NAV_ITEMS: RightNavItem[] = [
  { id: 'backlinks', title: 'Backlinks',    icon: <IconBacklinks /> },
  { id: 'outline',   title: 'Outline',      icon: <IconOutline /> },
  { id: 'graph',     title: 'Graph View',   icon: <IconGraph /> },
  { id: 'similar',   title: 'Similar Notes (AI)', icon: <IconBrain /> },
]

export function RightActivityBar() {
  const {
    rightPanelId,
    rightPanelOpen,
    toggleRightPanel,
    similarNotes,
  } = useAppStore()

  return (
    <div className="flex flex-col items-center w-12 h-full bg-zinc-900 border-l border-zinc-800 shrink-0 py-2 gap-1">
      {RIGHT_NAV_ITEMS.map((item) => {
        const isActive = rightPanelOpen && rightPanelId === item.id
        const hasBadge = item.id === 'similar' && similarNotes.length > 0 && !isActive

        return (
          <button
            key={item.id}
            onClick={() => toggleRightPanel(item.id)}
            title={item.title}
            aria-label={item.title}
            aria-pressed={isActive}
            className={[
              'w-8 h-8 flex items-center justify-center rounded transition-colors relative',
              isActive
                ? 'text-zinc-100 bg-zinc-700'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
            ].join(' ')}
          >
            {item.icon}
            {/* Active indicator bar — right side */}
            {isActive && (
              <span className="absolute right-0 top-1 bottom-1 w-0.5 bg-violet-500 rounded-l" />
            )}
            {/* Badge for similar notes */}
            {hasBadge && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-violet-500 rounded-full" />
            )}
          </button>
        )
      })}
    </div>
  )
}
