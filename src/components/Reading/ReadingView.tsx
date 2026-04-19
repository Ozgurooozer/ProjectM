import { useEffect, useRef, lazy, Suspense } from 'react'
import { eventBus } from '../../lib/events'
import { createRoot } from 'react-dom/client'
import { useAppStore } from '../../store/appStore'
import { readNote } from '../../lib/tauri'
import { useResolvedPreview } from '../../hooks/useResolvedPreview'

const MermaidBlock = lazy(() =>
  import('../Preview/MermaidBlock').then((m) => ({ default: m.MermaidBlock }))
)

interface Props {
  onEdit: () => void
}

export function ReadingView({ onEdit }: Props) {
  const { activeNotePath, setActiveNote } = useAppStore()
  const { html, mermaidBlocks } = useResolvedPreview()
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const mermaidRootsRef = useRef<Map<string, ReturnType<typeof createRoot>>>(new Map())

  useEffect(() => {
    return eventBus.on('ui:outline-scroll', ({ headingId }) => {
      const el = scrollRef.current?.querySelector(`#${headingId}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  // Mount MermaidBlock components
  useEffect(() => {
    mermaidRootsRef.current.forEach((root) => root.unmount())
    mermaidRootsRef.current.clear()

    if (!contentRef.current || mermaidBlocks.length === 0) return

    for (const block of mermaidBlocks) {
      const mountEl = contentRef.current.querySelector(`#mermaid-mount-${block.id}`)
      if (!mountEl) continue
      const root = createRoot(mountEl)
      root.render(
        <Suspense fallback={<div className="text-zinc-500 text-xs p-2">Loading diagram...</div>}>
          <MermaidBlock code={block.code} />
        </Suspense>
      )
      mermaidRootsRef.current.set(block.id, root)
    }

    return () => {
      mermaidRootsRef.current.forEach((root) => root.unmount())
      mermaidRootsRef.current.clear()
    }
  }, [html, mermaidBlocks])

  async function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const anchor = (e.target as HTMLElement).closest(
      'a[data-wiki-path]'
    ) as HTMLAnchorElement | null
    if (!anchor) return
    e.preventDefault()
    const path = anchor.getAttribute('data-wiki-path')
    if (!path) return
    try {
      const content = await readNote(path)
      setActiveNote(path, content)
      scrollRef.current?.scrollTo({ top: 0 })
    } catch (err) {
      console.error('Could not open wiki-link:', err)
    }
  }

  const noteName = activeNotePath?.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? ''

  if (!activeNotePath) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
        Select a note to read
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900">
      <div className="flex items-center justify-between px-6 py-2 border-b border-zinc-800 shrink-0">
        <span className="text-sm text-zinc-400 font-medium">{noteName}</span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-600">Reading Mode</span>
          <button
            onClick={onEdit}
            className="text-xs bg-zinc-700 hover:bg-zinc-600 text-zinc-200 px-3 py-1 rounded transition-colors"
          >
            ✏️ Edit
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto reading-scroll"
        onClick={handleClick}
      >
        <div
          ref={contentRef}
          className="prose prose-invert max-w-2xl mx-auto px-8 py-10 prose-headings:font-semibold prose-h1:text-2xl prose-a:text-violet-400 prose-code:bg-zinc-800 prose-code:px-1.5 prose-code:rounded prose-pre:bg-zinc-800 prose-blockquote:border-violet-500 prose-blockquote:text-zinc-400"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}
