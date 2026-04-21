import { useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { eventBus } from '../lib/events'
import { commandRegistry } from '../lib/commands'

/**
 * Registers all app-level commands on mount, unregisters on unmount.
 * Accepts setRightPanel as a parameter since it comes from the component.
 */
export function useCommandRegistry(
  setRightPanel: (id: 'backlinks' | 'outline' | 'graph' | 'similar') => void
) {
  useEffect(() => {
    commandRegistry.register({ id: 'vault.open', name: 'Open vault folder', category: 'Vault', action: () => eventBus.emit('ui:open-vault', {}) })
    commandRegistry.register({ id: 'note.new', name: 'Create new note', category: 'Note', shortcut: 'Ctrl+N', enabled: () => !!useAppStore.getState().vaultPath, action: () => eventBus.emit('ui:new-note', {}) })
    commandRegistry.register({ id: 'note.daily', name: "Open today's daily note", category: 'Note', shortcut: 'Ctrl+D', enabled: () => !!useAppStore.getState().vaultPath, action: () => eventBus.emit('ui:open-daily-note', {}) })
    commandRegistry.register({ id: 'note.random', name: 'Open random note', category: 'Note', shortcut: 'Ctrl+Shift+R', enabled: () => !!useAppStore.getState().vaultPath, action: () => eventBus.emit('ui:open-random-note', {}) })
    commandRegistry.register({ id: 'note.pin', name: 'Pin / unpin current note', category: 'Note', enabled: () => !!useAppStore.getState().activeNotePath, action: () => { const p = useAppStore.getState().activeNotePath; if (p) useAppStore.getState().togglePin(p) } })
    commandRegistry.register({ id: 'note.export.html', name: 'Export note as HTML', category: 'Note', enabled: () => !!useAppStore.getState().activeNotePath, action: () => eventBus.emit('ui:export-html', {}) })
    commandRegistry.register({ id: 'note.export.pdf', name: 'Export note as PDF', category: 'Note', enabled: () => !!useAppStore.getState().activeNotePath, action: () => eventBus.emit('ui:export-pdf', {}) })
    commandRegistry.register({ id: 'view.reading', name: 'Toggle reading mode', category: 'View', shortcut: 'Ctrl+R', action: () => useAppStore.getState().toggleReadingMode() })
    commandRegistry.register({ id: 'view.preview', name: 'Toggle preview panel', category: 'View', action: () => eventBus.emit('ui:toggle-preview', {}) })
    commandRegistry.register({ id: 'nav.switcher', name: 'Quick switcher — open note by name', category: 'Navigation', shortcut: 'Ctrl+O', action: () => eventBus.emit('ui:open-quick-switcher', {}) })
    commandRegistry.register({ id: 'nav.search', name: 'Focus search bar', category: 'Navigation', shortcut: 'Ctrl+F', action: () => eventBus.emit('ui:focus-search', {}) })
    commandRegistry.register({ id: 'settings.open', name: 'Open settings', category: 'Settings', action: () => eventBus.emit('ui:open-settings', {}) })
    commandRegistry.register({ id: 'settings.recovery', name: 'Open file recovery', category: 'Settings', enabled: () => !!useAppStore.getState().activeNotePath, action: () => eventBus.emit('ui:open-recovery', {}) })
    commandRegistry.register({ id: 'vault.backup', name: 'Backup vault as ZIP', category: 'Vault', enabled: () => !!useAppStore.getState().vaultPath, action: () => eventBus.emit('ui:backup-vault', {}) })
    commandRegistry.register({ id: 'ai.similar', name: 'Find similar notes (AI)', category: 'AI', enabled: () => { const s = useAppStore.getState(); return !!s.activeNotePath && s.embeddingStatus === 'ready' }, action: () => setRightPanel('similar') })

    return () => {
      ['vault.open','note.new','note.daily','note.random','note.pin','note.export.html',
       'note.export.pdf','view.reading','view.preview','nav.switcher','nav.search',
       'settings.open','settings.recovery','vault.backup','ai.similar',
      ].forEach((id) => commandRegistry.unregister(id))
    }
  }, [setRightPanel])
}
