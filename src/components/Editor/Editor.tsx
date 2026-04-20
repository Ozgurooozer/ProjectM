import { useEffect, useRef, useState } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view'
import { useAppStore } from '../../store/appStore'
import { useAutosave } from './useAutosave'
import { wikiLinkCompletion } from '../../lib/wikilinkCompletion'
import { wikilinkEditorExtension } from '../../lib/wikilinkEditorExtension'
import { writeNote, readNote } from '../../lib/tauri'
import { exportToPdf } from '../../lib/exportPdf'
import { exportToHtml } from '../../lib/exportHtml'
import { FrontmatterPanel } from './FrontmatterPanel'
import { slashCommandExtension } from '../../lib/slashCommandExtension'
import { eventBus } from '../../lib/events'

interface Props {
  showPreview: boolean
  onTogglePreview: () => void
}

export function Editor({ showPreview, onTogglePreview }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const { noteContent, activeNotePath, vaultPath, setNoteContent, settings, fileTree, setActiveNote, toggleReadingMode, isRandomNote } =
    useAppStore()

  useAutosave()

  useEffect(() => {
    const unsubs = [
      eventBus.on('ui:export-html', () => handleExportHtml()),
      eventBus.on('ui:export-pdf', () => handleExportPdf()),
      eventBus.on('ui:toggle-preview', () => onTogglePreview()),
    ]
    return () => unsubs.forEach((u) => u())
  }, [activeNotePath, noteContent, onTogglePreview])

  useEffect(() => {
    if (!containerRef.current) return

    const state = EditorState.create({
      doc: noteContent,
      extensions: [
        basicSetup,
        markdown(),
        oneDark,
        EditorView.lineWrapping,
        highlightActiveLine(),
        highlightActiveLineGutter(),
        wikiLinkCompletion(fileTree),
        ...wikilinkEditorExtension(fileTree, async (path) => {
          try {
            const content = await readNote(path)
            setActiveNote(path, content)
          } catch (err) {
            console.error('Could not open wiki-link:', err)
          }
        }),
        ...slashCommandExtension((text, from, to) => {
          if (!viewRef.current) return
          viewRef.current.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
          })
        }),
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              const { activeNotePath: path, setSaveStatus: setStatus } = useAppStore.getState()
              if (path) {
                const content = viewRef.current?.state.doc.toString() ?? ''
                writeNote(path, content)
                  .then(() => setStatus('saved'))
                  .catch(() => setStatus('error'))
              }
              return true
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            setNoteContent(update.state.doc.toString())
          }
        }),
      ],
    })

    const view = new EditorView({ state, parent: containerRef.current })
    viewRef.current = view
    return () => { view.destroy() }
  }, [activeNotePath])

  async function handleExportPdf() {
    if (!activeNotePath) return
    const title = activeNotePath.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? 'note'
    const { marked } = await import('marked')
    const html = marked(noteContent) as string
    await exportToPdf(title, html)
  }

  async function handleExportHtml() {
    if (!activeNotePath) return
    const title = activeNotePath.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? 'note'
    await exportToHtml(title, noteContent, {})
  }

  if (!activeNotePath && !vaultPath) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3">
        <p className="text-5xl">📒</p>
        <p className="text-zinc-400 text-sm font-medium">No vault open</p>
        <p className="text-zinc-600 text-xs">Open a folder to get started</p>
      </div>
    )
  }

  if (!activeNotePath) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3">
        <p className="text-zinc-600 text-sm">Select a note from the sidebar</p>
      </div>
    )
  }

  const noteName = activeNotePath.split(/[\\/]/).pop() ?? ''

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-700 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-zinc-300 truncate">{noteName}</span>
          {isRandomNote && (
            <span className="text-xs bg-amber-900/50 text-amber-400 px-2 py-0.5 rounded-full animate-pulse shrink-0">
              🎲 Random
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={toggleReadingMode}
            title="Reading mode (Ctrl+R)"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-1.5 py-1 rounded hover:bg-zinc-700"
          >
            👁 Read
          </button>
          <button
            onClick={onTogglePreview}
            title={showPreview ? 'Hide preview' : 'Show preview'}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-1.5 py-1 rounded hover:bg-zinc-700"
          >
            {showPreview ? '⊟ Preview' : '⊞ Preview'}
          </button>
          <div className="relative">
            <button
              onClick={() => setShowExportMenu((v) => !v)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-1.5 py-1 rounded hover:bg-zinc-700"
            >
              ↗ Export ▾
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 bg-zinc-800 border border-zinc-700 rounded shadow-xl py-1 min-w-[140px]">
                  <button
                    onClick={() => { handleExportHtml(); setShowExportMenu(false) }}
                    className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
                  >
                    Export as HTML
                  </button>
                  <button
                    onClick={() => { handleExportPdf(); setShowExportMenu(false) }}
                    className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
                  >
                    Export as PDF
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      <FrontmatterPanel />
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
        style={{ fontSize: `${settings.fontSize}px` }}
      />
    </div>
  )
}
