import { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { flattenTree, flattenAllFiles, resolveWikiLink, resolveImageLink, isImageLink } from '../lib/wikilinks'
import { resolveEmbeds } from '../lib/embed'
import { readNote, readImage } from '../lib/tauri'
import { parseFrontmatter } from '../lib/frontmatter'
import { extractMermaidBlocks, type MermaidBlock } from '../lib/mermaidProcessor'
import { extractHeadings } from '../lib/outline'

export type { MermaidBlock }

export function useResolvedPreview() {
  const { noteContent, activeNotePath, fileTree } = useAppStore()
  const [html, setHtml] = useState('')
  const [mermaidBlocks, setMermaidBlocks] = useState<MermaidBlock[]>([])
  const [imageCache, setImageCache] = useState<Record<string, string>>({})

  // Load images referenced in note
  useEffect(() => {
    if (!noteContent) return
    const allFiles = flattenAllFiles(fileTree)
    const imageRegex = /!\[\[([^\]]+)\]\]/g
    const found: string[] = []
    let match: RegExpExecArray | null
    while ((match = imageRegex.exec(noteContent)) !== null) {
      const linkName = match[1].trim()
      if (isImageLink(linkName)) found.push(linkName)
    }
    const toLoad = found.filter((name) => !imageCache[name])
    if (toLoad.length === 0) return
    toLoad.forEach(async (linkName) => {
      const resolved = resolveImageLink(linkName, allFiles)
      if (!resolved) return
      try {
        const dataUrl = await readImage(resolved)
        setImageCache((prev) => ({ ...prev, [linkName]: dataUrl }))
      } catch {
        // ignore
      }
    })
  }, [noteContent, fileTree])

  // Resolve and render content
  useEffect(() => {
    if (!noteContent || !activeNotePath) {
      setHtml('')
      setMermaidBlocks([])
      return
    }

    let cancelled = false

    async function resolve() {
      const allMdPaths = flattenTree(fileTree)
      const allFiles = flattenAllFiles(fileTree)

      // Strip frontmatter
      const { body } = parseFrontmatter(noteContent)

      // Resolve note embeds
      const context = {
        allPaths: allMdPaths,
        readFile: readNote,
        visitedPaths: new Set([activeNotePath!]),
        depth: 0,
      }
      let processed = await resolveEmbeds(body, context)
      if (cancelled) return

      // Replace ![[image]] with base64 or loading placeholder
      processed = processed.replace(/!\[\[([^\]]+)\]\]/g, (_, linkName: string) => {
        const trimmed = linkName.trim()
        if (!isImageLink(trimmed)) return `![[${trimmed}]]`
        const dataUrl = imageCache[trimmed]
        if (dataUrl) return `<img src="${dataUrl}" alt="${trimmed}" class="vault-image" />`
        const resolved = resolveImageLink(trimmed, allFiles)
        if (resolved) return `<span class="image-loading">⏳ ${trimmed}</span>`
        return `<span class="image-loading">⏳ ${trimmed}</span>`
      })

      // Replace [[wiki-links]] with alias support
      processed = processed.replace(
        /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g,
        (_, target: string, alias?: string) => {
          const displayText = alias?.trim() ?? target.trim()
          const resolved = resolveWikiLink(target.trim(), allMdPaths)
          if (resolved) {
            return `<a href="#" data-wiki-path="${resolved}" class="wiki-link wiki-link-exists">${displayText}</a>`
          }
          return `<a href="#" data-wiki-path="" class="wiki-link wiki-link-missing">${displayText}</a>`
        }
      )

      // Render #tags as pills
      processed = processed.replace(
        /#([a-zA-Z0-9_/-]+)/g,
        '<span class="inline-tag">#$1</span>'
      )

      // Extract mermaid blocks before markdown render
      const { processed: mermaidStripped, blocks } = extractMermaidBlocks(processed)

      // Render markdown
      const { marked } = await import('marked')
      let renderedHtml = marked(mermaidStripped) as string
      if (cancelled) return

      // Replace mermaid placeholders with React mount points
      for (const block of blocks) {
        renderedHtml = renderedHtml.replace(
          `<p>MERMAID_PLACEHOLDER_${block.id}</p>`,
          `<div id="mermaid-mount-${block.id}" class="mermaid-mount"></div>`
        )
      }

      // Add IDs to headings for outline navigation
      const headings = extractHeadings(body)
      let headingIdx = 0
      renderedHtml = renderedHtml.replace(
        /<h([1-6])>(.*?)<\/h[1-6]>/gi,
        (match, level, content) => {
          const h = headings[headingIdx++]
          if (!h) return match
          return `<h${level} id="${h.id}">${content}</h${level}>`
        }
      )

      setHtml(renderedHtml)
      setMermaidBlocks(blocks)
    }

    resolve()
    return () => {
      cancelled = true
    }
  }, [noteContent, activeNotePath, imageCache, fileTree])

  return { html, mermaidBlocks }
}
