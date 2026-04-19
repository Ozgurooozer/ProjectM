import { flattenTree } from './wikilinks'
import type { FileNode } from '../types'

const EXCLUDED_FOLDERS = ['_templates', 'Daily Notes', '.vault-recovery']

function isExcluded(path: string): boolean {
  const parts = path.split(/[\\/]/)
  return EXCLUDED_FOLDERS.some((folder) => parts.some((part) => part === folder))
}

export function pickRandomNote(
  fileTree: FileNode[],
  excludePath?: string | null
): string | null {
  const allPaths = flattenTree(fileTree)
  const eligible = allPaths.filter((p) => !isExcluded(p) && p !== excludePath)
  if (eligible.length === 0) return null
  return eligible[Math.floor(Math.random() * eligible.length)]
}
