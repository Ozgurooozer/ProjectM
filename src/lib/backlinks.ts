import { extractWikiLinks, flattenTree, resolveWikiLink, normalizePath } from './wikilinks'
import type { FileNode, BacklinkEntry } from '../types'

/**
 * Extract the line containing [[linkName]] and clean it for display.
 * Strips markdown syntax so the snippet reads naturally.
 */
function getSnippet(content: string, linkName: string): string {
  const escaped = linkName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`\\[\\[${escaped}\\]\\]`, 'i')
  const line = content.split('\n').find((l) => pattern.test(l))
  if (!line) return ''
  return line
    .trim()
    .replace(/^#+\s*/, '')        // strip heading markers
    .replace(/\*\*([^*]+)\*\*/g, '$1') // strip bold
    .replace(/\*([^*]+)\*/g, '$1')     // strip italic
    .replace(/`([^`]+)`/g, '$1')       // strip inline code
    .slice(0, 120)
}

export async function buildBacklinkIndex(
  nodes: FileNode[],
  readFile: (path: string) => Promise<string>
): Promise<Record<string, BacklinkEntry[]>> {
  const allPaths = flattenTree(nodes) // already normalized
  const index: Record<string, BacklinkEntry[]> = {}

  for (const path of allPaths) {
    index[path] = []
  }

  for (const sourcePath of allPaths) {
    let content: string
    try {
      content = await readFile(sourcePath)
    } catch {
      continue
    }

    for (const linkName of extractWikiLinks(content)) {
      const targetPath = resolveWikiLink(linkName, allPaths)
      if (!targetPath || targetPath === sourcePath) continue

      if (!index[targetPath]) index[targetPath] = []

      const alreadyAdded = index[targetPath].some((e) => e.sourcePath === sourcePath)
      if (!alreadyAdded) {
        index[targetPath].push({ sourcePath, snippet: getSnippet(content, linkName) })
      }
    }
  }

  return index
}

/**
 * Incrementally update the index for a single changed note.
 * Safe even if the note is new (not previously in the index).
 */
export function updateBacklinkIndex(
  index: Record<string, BacklinkEntry[]>,
  changedPath: string,
  newContent: string,
  allPaths: string[]
): Record<string, BacklinkEntry[]> {
  const normalized = normalizePath(changedPath)

  // Copy and strip all backlinks that came FROM this note
  const newIndex: Record<string, BacklinkEntry[]> = {}
  for (const key of allPaths) {
    newIndex[key] = (index[key] ?? []).filter((e) => e.sourcePath !== normalized)
  }

  // Re-add backlinks from the new content
  for (const linkName of extractWikiLinks(newContent)) {
    const targetPath = resolveWikiLink(linkName, allPaths)
    if (!targetPath || targetPath === normalized) continue

    if (!newIndex[targetPath]) newIndex[targetPath] = []

    const alreadyAdded = newIndex[targetPath].some((e) => e.sourcePath === normalized)
    if (!alreadyAdded) {
      newIndex[targetPath].push({ sourcePath: normalized, snippet: getSnippet(newContent, linkName) })
    }
  }

  return newIndex
}
