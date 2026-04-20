import { useEffect, useRef, lazy, Suspense } from 'react'
import { eventBus } from '../../lib/events'
import { createRoot } from 'react-dom/client'
import { useAppStore } from '../../store/appStore'
import { readNote } from '../../lib/tauri'
import { useResolvedPreview } from '../../hooks/useResolvedPreview'
import { openUrl } from '@tauri-apps/plugin-opener'

const MermaidBlock = lazy(() =>
  import('./MermaidBlock').then((m) => ({ default: m.MermaidBlock }))
)

export function Preview() {
  const { activeNotePath, setActiveNote } = useAppStore()
  const { html, mermaidBlocks } = useResolvedPreview()
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const mermaidRootsRef = useRef<Map<string, ReturnType<typeof createRoot>>>(new Map())

  // Scroll-to-heading event from OutlinePanel
  useEffect(() => {
    return eventBus.on('ui:outline-scroll', ({ headingId }) => {
      const el = scrollRef.current?.querySelector(`#${headingId}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  // Mount MermaidBlock components into placeholder divs
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
    const target = e.target as HTMLElement
    const anchor = target.closest('a') as HTMLAnchorElement | null
    if (!anchor) return

    // Wiki-link navigation
    const wikiPath = anchor.getAttribute('data-wiki-path')
    if (wikiPath) {
      e.preventDefault()
      try {
        const content = await readNote(wikiPath)
        setActiveNote(wikiPath, content)
      } catch (err) {
        console.error('Could not open wiki-link:', err)
      }
      return
    }

    // External link guard — open in system browser
    const href = anchor.getAttribute('href')
    if (href) {
      const isExternal = /^https?:\/\//.test(href) || /^mailto:/.test(href) || /^tel:/.test(href)
      if (isExternal) {
        e.preventDefault()
        try {
          await openUrl(href)
        } catch (err) {
          console.error('Could not open external link:', err)
        }
      }
    }
  }

  if (!activeNotePath) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-sm">Preview</div>
    )
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto p-4" onClick={handleClick}>
      <div
        ref={contentRef}
        className="prose prose-invert prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
