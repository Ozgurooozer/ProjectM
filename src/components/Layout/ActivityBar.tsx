import { useAppStore } from '../../store/appStore'
import { useVault } from '../../hooks/useVault'
import { eventBus } from '../../lib/events'
import type { LeftPanelId } from '../../store/slices/uiSlice'

interface NavItem {
  id: LeftPanelId
  label: string
  title: string
  icon: React.ReactNode
}

// Simple SVG icons — no external dependency
function IconFiles() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h6l2 2h10v14H3z" />
    </svg>
  )
}

function IconSearch() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="22" y2="22" />
    </svg>
  )
}

function IconTag() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  )
}

function IconClock() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function IconDice() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="3" ry="3" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
      <circle cx="16" cy="8" r="1.2" fill="currentColor" />
      <circle cx="8" cy="16" r="1.2" fill="currentColor" />
      <circle cx="16" cy="16" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

const NAV_ITEMS: NavItem[] = [
  { id: 'files',  label: 'Files',   title: 'File Explorer',  icon: <IconFiles /> },
  { id: 'search', label: 'Search',  title: 'Search (Ctrl+F)', icon: <IconSearch /> },
  { id: 'tags',   label: 'Tags',    title: 'Tags',            icon: <IconTag /> },
  { id: 'recent', label: 'Recent',  title: 'Recent Notes',    icon: <IconClock /> },
]

interface Props {
  onOpenSettings: () => void
}

export function ActivityBar({ onOpenSettings }: Props) {
  const {
    vaultPath,
    leftPanelId,
    leftPanelOpen,
    toggleLeftPanel,
    embeddingStatus,
  } = useAppStore()
  const { openVaultDialog } = useVault()

  const dotClass =
    embeddingStatus === 'ready'   ? 'bg-green-500' :
    embeddingStatus === 'loading' ? 'bg-yellow-500 animate-pulse' :
    embeddingStatus === 'error'   ? 'bg-red-500' :
    'bg-zinc-600'

  const dotTitle =
    embeddingStatus === 'ready'   ? 'AI ready' :
    embeddingStatus === 'loading' ? 'Loading AI model...' :
    embeddingStatus === 'error'   ? 'AI unavailable' :
    'AI off'

  return (
    <div className="flex flex-col items-center w-12 h-full bg-zinc-900 border-r border-zinc-800 shrink-0 py-2 gap-1">
      {/* Vault icon / name */}
      <button
        onClick={openVaultDialog}
        title={vaultPath ? `Vault: ${vaultPath.split(/[\\/]/).pop()} — Click to change` : 'Open vault'}
        className="w-8 h-8 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-colors mb-2 text-base"
      >
        📒
      </button>

      <div className="w-6 border-t border-zinc-800 mb-1" />

      {/* Nav items */}
      {NAV_ITEMS.map((item) => {
        const isActive = leftPanelOpen && leftPanelId === item.id
        return (
          <button
            key={item.id}
            onClick={() => toggleLeftPanel(item.id)}
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
            {/* Active indicator bar */}
            {isActive && (
              <span className="absolute left-0 top-1 bottom-1 w-0.5 bg-violet-500 rounded-r" />
            )}
          </button>
        )
      })}

      <div className="flex-1" />

      {/* Daily note */}
      {vaultPath && (
        <button
          onClick={() => eventBus.emit('ui:open-daily-note', {})}
          title="Today's note (Ctrl+D)"
          className="w-8 h-8 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <IconCalendar />
        </button>
      )}

      {/* Random note */}
      {vaultPath && (
        <button
          onClick={() => eventBus.emit('ui:open-random-note', {})}
          title="Random note (Ctrl+Shift+R)"
          className="w-8 h-8 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <IconDice />
        </button>
      )}

      <div className="w-6 border-t border-zinc-800 my-1" />

      {/* AI status dot */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('open-settings-ai'))}
        title={dotTitle}
        className="w-8 h-8 flex items-center justify-center rounded hover:bg-zinc-800 transition-colors"
      >
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
      </button>

      {/* Settings */}
      <button
        onClick={onOpenSettings}
        title="Settings"
        className="w-8 h-8 flex items-center justify-center rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
      >
        <IconSettings />
      </button>
    </div>
  )
}
