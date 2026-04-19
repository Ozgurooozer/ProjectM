import type { FileNode } from '../types'

const TEMPLATES_FOLDER = '_templates'

export function findTemplates(nodes: FileNode[]): FileNode[] {
  const dir = nodes.find((n) => n.isDirectory && n.name === TEMPLATES_FOLDER)
  if (!dir?.children) return []
  return dir.children.filter((n) => !n.isDirectory)
}

export function applyTemplate(
  content: string,
  variables: { title: string; date: string }
): string {
  return content
    .replace(/\{\{title\}\}/g, variables.title)
    .replace(/\{\{date\}\}/g, variables.date)
}

export function todayString(): string {
  return new Date().toISOString().split('T')[0]
}
