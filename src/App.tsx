import { useEffect, useState, useCallback } from 'react'
import './index.css'
import {
  loadLastVaultPath, loadLastNotePath,
  loadSettings, loadPinnedNotes, loadRecentNotes,
} from './lib/persistence'
import { openVault, readNote, getOrCreateVaultId, backlinksGetAll, tagsGetAll } from './lib/tauri'
import { buildBacklinkIndex } from './lib/backlinks'
import { buildTagIndex } from './lib/tags'
import { flattenTree } from './lib/wikilinks'
import { useAppStore } from './store/appStore'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { ErrorBoundary } from './components/ErrorBoundary'
import { NotificationCenter } from './components/NotificationCenter'
import { Editor } from './components/Editor/Editor'
import { PreviewPanel } from './components/Preview/PreviewPanel'
import { Settings } from './components/Settings/Settings'
import { ShortcutHelp } from './components/Help/ShortcutHelp'
import { ResizableSplit } from './components/Layout/ResizableSplit'
import { ReadingView } from './components/Reading/ReadingView'
import { QuickSwitcher } from './components/QuickSwitcher/QuickSwitcher'
import { CommandPalette } from './components/CommandPalette/CommandPalette'
import { ToastContainer } from './components/UI/Toast'
import { ActivityBar } from './components/Layout/ActivityBar'
import { RightActivityBar } from './components/Layout/RightActivityBar'
import { LeftPanel } from './components/Layout/LeftPanel'
import { RightPanel } from './components/Layout/RightPanel'
import { StatusBar } from './components/Layout/StatusBar'
import { eventBus } from './lib/events'
import { pluginRegistry } from './lib/plugins'
import { openVectorStore, startIndexingWhenReady } from './lib/vaultSetup'
import type { BacklinkEntry } from './types'
import { useSimilarNotes } from './hooks/useSimilarNotes'
import { usePanelLayout } from './hooks/usePanelLayout'
import { useCommandRegistry } from './hooks/useCommandRegistry'
import { useModelLoader } from './hooks/useModelLoader'
import { openOrCreateDailyNote } from './lib/dailyNotes'
import { pickRandomNote } from './lib/randomNote'

function AppContent() {
  const {
    setVault, setBacklinkIndex, setActiveNote, updateSettings, settings,
    setTagIndex, setPinnedNotes, setRecentNotes,
    readingMode, toggleReadingMode,
    setVectorStore, setIndexingProgress,
    leftPanelOpen, rightPanelOpen,
    setRightPanel,
    vaultPath, fileTree, refreshFileTree, setIsRandomNote, activeNotePath,
  } = useAppStore()

  const [showSettings, setShowSettings] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'ai'>('general')
  const [showHelp, setShowHelp] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [showQuickSwitcher, setShowQuickSwitcher] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const { leftPanelWidth, rightPanelWidth, isResizingLeft, isResizingRight } = usePanelLayout()

  useSimilarNotes()
  useCommandRegistry(setRightPanel)
  useModelLoader()

  // ── Daily note handler ─────────────────────────────────────
  const handleDailyNote = useCallback(async () => {
    if (!vaultPath) return
    try {
      const { path, content } = await openOrCreateDailyNote(vaultPath, fileTree)
      const newTree = await openVault(vaultPath)
      refreshFileTree(newTree)
      setActiveNote(path, content)
    } catch (err) {
      console.error('Could not open daily note:', err)
    }
  }, [vaultPath, fileTree, refreshFileTree, setActiveNote])

  // ── Random note handler ────────────────────────────────────
  const handleRandomNote = useCallback(async () => {
    if (!vaultPath) return
    const randomPath = pickRandomNote(fileTree, activeNotePath)
    if (!randomPath) return
    try {
      const content = await readNote(randomPath)
      setActiveNote(randomPath, content)
      setIsRandomNote(true)
      setTimeout(() => setIsRandomNote(false), 2000)
    } catch (err) {
      console.error('Could not open random note:', err)
    }
  }, [vaultPath, fileTree, activeNotePath, setActiveNote, setIsRandomNote])

  useEffect(() => eventBus.on('ui:open-daily-note', handleDailyNote), [handleDailyNote])
  useEffect(() => eventBus.on('ui:open-random-note', handleRandomNote), [handleRandomNote])

  // ── Restore persisted state on startup ────────────────────
  useEffect(() => {
    async function restoreVault() {
      const lastPath = await loadLastVaultPath()
      if (!lastPath) return

      // Step 1: open vault file tree — must succeed for anything to show
      let tree: import('./types').FileNode[]
      let vaultId: string
      try {
        ;[tree, vaultId] = await Promise.all([
          openVault(lastPath),
          getOrCreateVaultId(lastPath),
        ])
      } catch (err) {
        console.warn('Could not restore last vault (open failed):', err)
        return
      }

      setVault(lastPath, tree)
      getCurrentWindow().setTitle(`${lastPath.split(/[\\/]/).pop()} — Vault`)

      // Step 2: restore last note (independent of SQLite)
      const lastNotePath = await loadLastNotePath()
      if (lastNotePath) {
        try {
          const content = await readNote(lastNotePath)
          setActiveNote(lastNotePath, content)
        } catch {
          // Note may have been deleted
        }
      }

      // Step 3: SQLite + indexing — errors here must NOT block the file tree
      try {
        const store = await openVectorStore(vaultId, lastPath)
        setVectorStore(store)
        await store.setVaultPathInMeta(lastPath)

        // Try loading indexes from SQLite; fall back to full rebuild
        try {
          const [blRows, tagRows] = await Promise.all([
            backlinksGetAll(),
            tagsGetAll(),
          ])
          if (blRows.length > 0 || tagRows.length > 0) {
            const backlinkIdx: Record<string, BacklinkEntry[]> = {}
            for (const row of blRows) {
              if (!backlinkIdx[row.targetPath]) backlinkIdx[row.targetPath] = []
              backlinkIdx[row.targetPath].push({ sourcePath: row.sourcePath, snippet: row.snippet })
            }
            const tagIdx: Record<string, string[]> = {}
            for (const row of tagRows) {
              if (!tagIdx[row.tag]) tagIdx[row.tag] = []
              tagIdx[row.tag].push(row.notePath)
            }
            setBacklinkIndex(backlinkIdx)
            setTagIndex(tagIdx)
          } else {
            const [backlinkIdx, tagIdx] = await Promise.all([
              buildBacklinkIndex(tree, readNote),
              buildTagIndex(flattenTree(tree), readNote),
            ])
            setBacklinkIndex(backlinkIdx)
            setTagIndex(tagIdx)
          }
        } catch {
          const [backlinkIdx, tagIdx] = await Promise.all([
            buildBacklinkIndex(tree, readNote),
            buildTagIndex(flattenTree(tree), readNote),
          ])
          setBacklinkIndex(backlinkIdx)
          setTagIndex(tagIdx)
        }

        startIndexingWhenReady(
          store,
          () => useAppStore.getState().fileTree,
          (p) => setIndexingProgress({
            phase: p.phase as 'idle' | 'checking' | 'embedding' | 'done' | 'error',
            current: p.current,
            total: p.total,
            message: p.message,
          })
        )
      } catch (err) {
        console.warn('SQLite/indexing setup failed (file tree still shown):', err)
      }
    }

    async function restoreSettings() {
      const saved = await loadSettings()
      if (saved) updateSettings(saved)
    }

    async function restoreNavigation() {
      const [pinned, recent] = await Promise.all([loadPinnedNotes(), loadRecentNotes()])
      setPinnedNotes(pinned)
      setRecentNotes(recent)
    }

    restoreVault()
    restoreSettings()
    restoreNavigation()
  }, [])

  // ── Theme ──────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.classList.toggle('light-theme', settings.theme === 'light')
  }, [settings.theme])

  // ── Keyboard shortcuts ─────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl) document.body.classList.add('ctrl-held')

      if (ctrl && e.key === 'n') { e.preventDefault(); eventBus.emit('ui:new-note', {}) }
      if (ctrl && e.key === 'f') { e.preventDefault(); eventBus.emit('ui:focus-search', {}) }
      if (ctrl && e.key === 'r') { e.preventDefault(); toggleReadingMode() }
      if (ctrl && e.key === 'o') { e.preventDefault(); setShowQuickSwitcher((v) => !v) }
      if (ctrl && e.key === 'p') { e.preventDefault(); setShowCommandPalette((v) => !v) }
      if (ctrl && e.shiftKey && e.key === 'R') { e.preventDefault(); eventBus.emit('ui:open-random-note', {}) }
      if (ctrl && e.key === 'd') { e.preventDefault(); eventBus.emit('ui:open-daily-note', {}) }
      if (ctrl && e.key === '?') { e.preventDefault(); setShowHelp((v) => !v) }
      if (e.key === 'Escape') {
        setShowHelp(false)
        setShowSettings(false)
        setShowQuickSwitcher(false)
        setShowCommandPalette(false)
      }

      for (const cmd of pluginRegistry.commands) {
        if (!cmd.keybinding) continue
        const parts = cmd.keybinding.toLowerCase().split('+')
        const needsCtrl = parts.includes('ctrl') || parts.includes('meta')
        const needsShift = parts.includes('shift')
        const needsAlt = parts.includes('alt')
        const key = parts[parts.length - 1]
        if (
          needsCtrl === ctrl &&
          needsShift === e.shiftKey &&
          needsAlt === e.altKey &&
          e.key.toLowerCase() === key
        ) {
          e.preventDefault()
          cmd.execute()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', () => document.body.classList.remove('ctrl-held'))
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', () => document.body.classList.remove('ctrl-held'))
    }
  }, [toggleReadingMode])

  // ── Event bus listeners ────────────────────────────────────
  useEffect(() => {
    function openSettingsAI() { setSettingsInitialTab('ai'); setShowSettings(true) }
    const unsubs = [
      eventBus.on('ui:open-quick-switcher', () => setShowQuickSwitcher(true)),
      eventBus.on('ui:open-settings', () => { setSettingsInitialTab('general'); setShowSettings(true) }),
    ]
    window.addEventListener('open-settings-ai', openSettingsAI)
    return () => {
      unsubs.forEach((u) => u())
      window.removeEventListener('open-settings-ai', openSettingsAI)
    }
  }, [])

  return (
    <div
      className="flex flex-col h-screen w-screen overflow-hidden"
      style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      {/* ── Main area (activity bars + panels + editor) ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left activity bar */}
        <ActivityBar onOpenSettings={() => { setSettingsInitialTab('general'); setShowSettings(true) }} />

        {/* Left panel (collapsible + resizable) */}
        {leftPanelOpen && (
          <div
            style={{ width: leftPanelWidth }}
            className="shrink-0 h-full bg-zinc-900 overflow-hidden flex flex-col relative"
          >
            <LeftPanel />
            {/* Resize sash */}
            <div
              className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-violet-500 transition-colors z-10"
              onMouseDown={() => {
                isResizingLeft.current = true
                document.body.style.cursor = 'col-resize'
                document.body.style.userSelect = 'none'
              }}
            />
          </div>
        )}

        {/* Center: editor + preview */}
        <div className="flex-1 h-full overflow-hidden flex flex-col">
          {readingMode ? (
            <ReadingView onEdit={toggleReadingMode} />
          ) : (
            <ResizableSplit
              left={<Editor showPreview={showPreview} onTogglePreview={() => setShowPreview((v) => !v)} />}
              right={<PreviewPanel onHide={() => setShowPreview(false)} />}
              showRight={showPreview}
              defaultLeftPercent={55}
            />
          )}
        </div>

        {/* Right panel (collapsible + resizable) */}
        {rightPanelOpen && (
          <div
            style={{ width: rightPanelWidth }}
            className="shrink-0 h-full bg-zinc-900 overflow-hidden flex flex-col relative"
          >
            {/* Resize sash */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-violet-500 transition-colors z-10"
              onMouseDown={() => {
                isResizingRight.current = true
                document.body.style.cursor = 'col-resize'
                document.body.style.userSelect = 'none'
              }}
            />
            <RightPanel />
          </div>
        )}

        {/* Right activity bar */}
        <RightActivityBar />
      </div>

      {/* ── Status bar ── */}
      <StatusBar />

      {/* ── Modals ── */}
      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} initialTab={settingsInitialTab} />
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

