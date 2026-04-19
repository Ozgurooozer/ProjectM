import type { FileNode } from '../types'

/** Normalize OS path separators to forward-slash for consistent comparison */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/')
}

export interface WikiLink {
  raw: string
  target: string
  display: string
  hasAlias: boolean
}

export function parseWikiLinks(content: string): WikiLink[] {
  const regex = /\[\[([^\]]+)\]\]/g
  const links: WikiLink[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    const inner = match[1]
    const pipeIndex = inner.indexOf('|')
    if (pipeIndex !== -1) {
      links.push({
        raw: match[0],
        target: inner.slice(0, pipeIndex).trim(),
        display: inner.slice(pipeIndex + 1).trim(),
        hasAlias: true,
      })
    } else {
      links.push({
        raw: match[0],
        target: inner.trim(),
        display: inner.trim(),
        hasAlias: false,
      })
    }
  }
  return links
}

export function extractWikiLinks(content: string): string[] {
  return parseWikiLinks(content).map((l) => l.target)
}

export function flattenTree(nodes: FileNode[]): string[] {
  const paths: string[] = []
  for (const node of nodes) {
    if (!node.isDirectory) {
      paths.push(normalizePath(node.path))
    }
    if (node.children) {
      paths.push(...flattenTree(node.children))
    }
  }
  return paths
}

export function resolveWikiLink(linkName: string, allPaths: string[]): string | null {
  const normalized = linkName.toLowerCase().trim()
  const match = allPaths.find((p) => {
    const fileName = p.split('/').pop() ?? ''
    return fileName.replace(/\.md$/, '').toLowerCase() === normalized
  })
  return match ?? null
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']

export function isImageLink(linkName: string): boolean {
  const lower = linkName.toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export function resolveImageLink(linkName: string, allFilePaths: string[]): string | null {
  const normalized = linkName.toLowerCase().trim()
  const match = allFilePaths.find((p) => {
    const fileName = p.split(/[\\/]/).pop() ?? ''
    return fileName.toLowerCase() === normalized
  })
  return match ?? null
}

export function flattenAllFiles(nodes: FileNode[]): string[] {
  const paths: string[] = []
  for (const node of nodes) {
    if (!node.isDirectory) {
      paths.push(normalizePath(node.path))
    }
    if (node.children) {
      paths.push(...flattenAllFiles(node.children))
    }
  }
  return paths
}
