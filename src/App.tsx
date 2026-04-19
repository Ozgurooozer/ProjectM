import { useEffect, useState } from 'react'
import './index.css'
import { loadLastVaultPath, loadLastNotePath, loadSettings, loadPinnedNotes, loadRecentNotes } from './lib/persistence'
import { openVault, readNote } from './lib/tauri'
import { buildBacklinkIndex } from './lib/backlinks'
import { buildTagIndex } from './lib/tags'
import { flattenTree } from './lib/wikilinks'
import { useAppStore } from './store/appStore'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ErrorBoundary } from './components/ErrorBoundary'
import { NotificationCenter } from './components/NotificationCenter'
import { Sidebar } from './components/Sidebar/Sidebar'
import { Editor } from './components/Editor/Editor'
import { PreviewPanel } from './components/Preview/PreviewPanel'
import { Backlinks } from './components/Backlinks/Backlinks'
import { Settings } from './components/Settings/Settings'
import { GraphView } from './components/Graph/GraphView'
import { ShortcutHelp } from './components/Help/ShortcutHelp'
import { ResizableSplit } from './components/Layout/ResizableSplit'
import { OutlinePanel } from './components/Outline/OutlinePanel'
import { ReadingView } from './components/Reading/ReadingView'
import { QuickSwitcher } from './components/QuickSwitcher/QuickSwitcher'
import { CommandPalette } from './components/CommandPalette/CommandPalette'
import { SimilarNotesPanel } from './components/Similar/SimilarNotesPanel'
import { ToastContainer } from './components/UI/Toast'
import { eventBus } from './lib/events'
import { pluginRegistry } from './lib/plugins'
import { commandRegistry } from './lib/commands'
import { embeddingWorker } from './lib/embeddingWorkerManager'
import { VectorStore } from './lib/vectorStore'
import { useSimilarNotes } from './hooks/useSimilarNotes'
import { indexVault } from './lib/indexingPipeline'

function AppContent() {
  const {
    setVault, setBacklinkIndex, setActiveNote, updateSettings, settings,
    setTagIndex, setPinnedNotes, setRecentNotes,
    readingMode, toggleReadingMode,
    setEmbeddingStatus, setEmbeddingProgress,
    setVectorStore,
    similarNotes,
  } = useAppStore()
  const [showSettings, setShowSettings] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'ai'>('general')
  const [showHelp, setShowHelp] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [rightPanel, setRightPanel] = useState<'backlinks' | 'graph' | 'outline' | 'similar'>('backlinks')

  // Auto-find similar notes when active note changes
  useSimilarNotes()

  // Load embedding model on startup
  useEffect(() => {
    const unsubStatus = embeddingWorker.onStatusChange((status) => {
      setEmbeddingStatus(status)
    })

    const unsubProgress = embeddingWorker.onProgress((status, progress) => {
      setEmbeddingProgress({ status, progress })
    })

    embeddingWorker.loadModel().catch((err) => {
      console.warn('Could not load embedding model:', err)
    })

    return () => {
      unsubStatus()
      unsubProgress()
    }
  }, [])

  useEffect(() => {
    const { vaultPath, activeNotePath } = useAppStore.getState()

    commandRegistry.register({
      id: 'vault.open',
      name: 'Open vault folder',
      category: 'Vault',
      action: () => eventBus.emit('ui:open-vault', {}),
    })
    commandRegistry.register({
      id: 'note.new',
      name: 'Create new note',
      category: 'Note',
      shortcut: 'Ctrl+N',
      enabled: () => !!useAppStore.getState().vaultPath,
      action: () => eventBus.emit('ui:new-note', {}),
    })
    commandRegistry.register({
      id: 'note.daily',
      name: "Open today's daily note",
      category: 'Note',
      shortcut: 'Ctrl+D',
      enabled: () => !!useAppStore.getState().vaultPath,
      action: () => eventBus.emit('ui:open-daily-note', {}),
    })
    commandRegistry.register({
      id: 'note.random',
      name: 'Open random note',
      category: 'Note',
      shortcut: 'Ctrl+Shift+R',
      enabled: () => !!useAppStore.getState().vaultPath,
      action: () => eventBus.emit('ui:open-random-note', {}),
    })
    commandRegistry.register({
      id: 'note.pin',
      name: 'Pin / unpin current note',
      category: 'Note',
      enabled: () => !!useAppStore.getState().activeNotePath,
      action: () => {
        const path = useAppStore.getState().activeNotePath
        if (path) useAppStore.getState().togglePin(path)
      },
    })
    commandRegistry.register({
      id: 'note.export.html',
      name: 'Export note as HTML',
      category: 'Note',
      enabled: () => !!useAppStore.getState().activeNotePath,
      action: () => eventBus.emit('ui:export-html', {}),
    })
    commandRegistry.register({
      id: 'note.export.pdf',
      name: 'Export note as PDF',
      category: 'Note',
      enabled: () => !!useAppStore.getState().activeNotePath,
      action: () => eventBus.emit('ui:export-pdf', {}),
    })
    commandRegistry.register({
      id: 'view.reading',
      name: 'Toggle reading mode',
      category: 'View',
      shortcut: 'Ctrl+R',
      action: () => useAppStore.getState().toggleReadingMode(),
    })
    commandRegistry.register({
      id: 'view.preview',
      name: 'Toggle preview panel',
      category: 'View',
      action: () => eventBus.emit('ui:toggle-preview', {}),
    })
    commandRegistry.register({
      id: 'nav.switcher',
      name: 'Quick switcher — open note by name',
      category: 'Navigation',
      shortcut: 'Ctrl+O',
      action: () => eventBus.emit('ui:open-quick-switcher', {}),
    })
    commandRegistry.register({
      id: 'nav.search',
      name: 'Focus search bar',
      category: 'Navigation',
      shortcut: 'Ctrl+F',
      action: () => eventBus.emit('ui:focus-search', {}),
    })
    commandRegistry.register({
      id: 'settings.open',
      name: 'Open settings',
      category: 'Settings',
      action: () => eventBus.emit('ui:open-settings', {}),
    })
    commandRegistry.register({
      id: 'settings.recovery',
      name: 'Open file recovery',
      category: 'Settings',
      enabled: () => !!useAppStore.getState().activeNotePath,
      action: () => eventBus.emit('ui:open-recovery', {}),
    })
    commandRegistry.register({
      id: 'vault.backup',
      name: 'Backup vault as ZIP',
      category: 'Vault',
      enabled: () => !!useAppStore.getState().vaultPath,
      action: () => eventBus.emit('ui:backup-vault', {}),
    })
    commandRegistry.register({
      id: 'ai.similar',
      name: 'Find similar notes (AI)',
      category: 'AI',
      enabled: () => {
        const s = useAppStore.getState()
        return !!s.activeNotePath && s.embeddingStatus === 'ready'
      },
      action: () => setRightPanel('similar'),
    })

    void vaultPath
    void activeNotePath

    return () => {
      [
        'vault.open', 'note.new', 'note.daily', 'note.random',
        'note.pin', 'note.export.html', 'note.export.pdf',
        'view.reading', 'view.preview', 'nav.switcher',
        'nav.search', 'settings.open', 'settings.recovery', 'vault.backup',
        'ai.similar',
      ].forEach((id) => commandRegistry.unregister(id))
    }
  }, [])

  useEffect(() => {
    async function restoreVault() {
      const lastPath = await loadLastVaultPath()
      if (!lastPath) return

      try {
        const tree = await openVault(lastPath)
        setVault(lastPath, tree)

        const appWindow = getCurrentWindow()
        appWindow.setTitle(`${lastPath.split(/[\\/]/).pop()} — Vault`)

        const index = await buildBacklinkIndex(tree, readNote)
        setBacklinkIndex(index)

        const tagIdx = await buildTagIndex(flattenTree(tree), readNote)
        setTagIndex(tagIdx)

        // Restore vector store for this vault
        const store = new VectorStore(lastPath)
        await store.open()
        setVectorStore(store)

        // Start indexing when model is ready
        function tryIndex() {
          const status = embeddingWorker.getStatus()
          if (status === 'ready') {
            const { fileTree, setIndexingProgress: setIP } = useAppStore.getState()
            setIP({ phase: 'checking', current: 0, total: 0, message: 'Starting...' })
            indexVault(fileTree, store, (p) => {
              setIP({
                phase: p.phase as 'idle' | 'checking' | 'embedding' | 'done' | 'error',
                current: p.current,
                total: p.total,
                message: p.message,
              })
            }).catch(console.warn)
          } else if (status === 'loading' || status === 'idle') {
            const unsub = embeddingWorker.onStatusChange((s) => {
              if (s === 'ready') {
                unsub()
                const { fileTree, setIndexingProgress: setIP } = useAppStore.getState()
                setIP({ phase: 'checking', current: 0, total: 0, message: 'Starting...' })
                indexVault(fileTree, store, (p) => {
                  setIP({
                    phase: p.phase as 'idle' | 'checking' | 'embedding' | 'done' | 'error',
                    current: p.current,
                    total: p.total,
                    message: p.message,
                  })
                }).catch(console.warn)
              }
            })
          }
        }
        tryIndex()

        const lastNotePath = await loadLastNotePath()
        if (lastNotePath) {
          try {
            const content = await readNote(lastNotePath)
            setActiveNote(lastNotePath, content)
          } catch {
            // Note may have been deleted
          }
        }
      } catch (err) {
        console.warn('Could not restore last vault:', err)
      }
    }

    async function restoreSettings() {
      const saved = await loadSettings()
      if (saved) updateSettings(saved)
    }

    async function restorePersisted() {
      const [pinned, recent] = await Promise.all([loadPinnedNotes(), loadRecentNotes()])
      setPinnedNotes(pinned)
      setRecentNotes(recent)
    }

    restoreVault()
    restoreSettings()
    restorePersisted()
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('light-theme', settings.theme === 'light')
  }, [settings.theme])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey) {
        document.body.classList.add('ctrl-held')
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        eventBus.emit('ui:new-note', {})
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        eventBus.emit('ui:focus-search', {})
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault()
        toggleReadingMode()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault()
        setShowQuickSwitcher((v) => !v)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault()
        setShowCommandPalette((v) => !v)
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
        e.preventDefault()
        eventBus.emit('ui:open-random-note', {})
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault()
        eventBus.emit('ui:open-daily-note', {})
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '?') {
        e.preventDefault()
        setShowHelp((v) => !v)
      }
      if (e.key === 'Escape') {
        setShowHelp(false)
        setShowSettings(false)
        setShowQuickSwitcher(false)
        setShowCommandPalette(false)
      }

      // Plugin-registered commands
      for (const cmd of pluginRegistry.commands) {
        if (!cmd.keybinding) continue
        const parts = cmd.keybinding.toLowerCase().split('+')
        const needsCtrl = parts.includes('ctrl') || parts.includes('meta')
        const needsShift = parts.includes('shift')
        const needsAlt = parts.includes('alt')
        const key = parts[parts.length - 1]
        if (
          (needsCtrl === (e.ctrlKey || e.metaKey)) &&
          (needsShift === e.shiftKey) &&
          (needsAlt === e.altKey) &&
          e.key.toLowerCase() === key
        ) {
          e.preventDefault()
          cmd.execute()
        }
      }
    }

    function handleKeyUp() {
      document.body.classList.remove('ctrl-held')
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [toggleReadingMode])

  useEffect(() => {
    const unsubs = [
      eventBus.on('ui:open-quick-switcher', () => setShowQuickSwitcher(true)),
      eventBus.on('ui:open-settings', () => {
        setSettingsInitialTab('general')
        setShowSettings(true)
      }),
    ]
    // open-settings-ai: click AI dot in sidebar → open Settings on AI tab
    function handleOpenSettingsAI() {
      setSettingsInitialTab('ai')
      setShowSettings(true)
    }
    window.addEventListener('open-settings-ai', handleOpenSettingsAI)

    return () => {
      unsubs.forEach((u) => u())
      window.removeEventListener('open-settings-ai', handleOpenSettingsAI)
    }
  }, [])

  const rightPanels = ['backlinks', 'graph', 'outline', 'similar'] as const

  return (
    <div
      className="flex h-screen w-screen overflow-hidden text-zinc-100"
      style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      {/* Sidebar */}
      <div className="w-64 shrink-0 h-full">
        <Sidebar />
      </div>

      {/* Center: Editor+Preview split OR Reading mode */}
      <div className="flex-1 h-full overflow-hidden">
        {readingMode ? (
          <ReadingView onEdit={toggleReadingMode} />
        ) : (
          <ResizableSplit
            left={
              <Editor
                showPreview={showPreview}
                onTogglePreview={() => setShowPreview((v) => !v)}
              />
            }
            right={<PreviewPanel onHide={() => setShowPreview(false)} />}
            showRight={showPreview}
            defaultLeftPercent={55}
          />
        )}
      </div>

      {/* Right panel */}
      <div className="w-72 shrink-0 h-full border-l border-zinc-700 flex flex-col overflow-hidden">
        <div className="flex items-center border-b border-zinc-700 shrink-0">
          {rightPanels.map((panel) => (
            <button
              key={panel}
              onClick={() => setRightPanel(panel)}
              className={`flex-1 text-xs py-2 capitalize transition-colors relative ${
                rightPanel === panel
                  ? 'text-zinc-200 border-b-2 border-violet-500'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {panel === 'similar' ? '🧠' : panel}
              {panel === 'similar' && similarNotes.length > 0 && rightPanel !== 'similar' && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-violet-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          {rightPanel === 'graph' ? <GraphView /> :
           rightPanel === 'outline' ? <OutlinePanel /> :
           rightPanel === 'similar' ? <SimilarNotesPanel /> :
           <Backlinks />}
        </div>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="p-2 text-zinc-600 hover:text-zinc-400 border-t border-zinc-700 text-xs transition-colors"
        >
          ⚙️ Settings
        </button>
      </div>

      {showSettings && (
        <Settings
          onClose={() => setShowSettings(false)}
          initialTab={settingsInitialTab}
        />
      )}
      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}
      {showQuickSwitcher && <QuickSwitcher onClose={() => setShowQuickSwitcher(false)} />}
      {showCommandPalette && <CommandPalette onClose={() => setShowCommandPalette(false)} />}
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
      <NotificationCenter />
      <ToastContainer />
    </ErrorBoundary>
  )
}
