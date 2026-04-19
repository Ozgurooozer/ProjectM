import { parseFrontmatter, getFrontmatterTags } from './frontmatter'

export function extractTags(content: string): string[] {
  const tags = new Set<string>()

  // Frontmatter tags
  const { frontmatter, body } = parseFrontmatter(content)
  for (const tag of getFrontmatterTags(frontmatter)) {
    tags.add(tag)
  }

  // Inline #tags
  const lines = body.split('\n')
  let inCodeBlock = false

  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue
    if (/^#{1,6}\s/.test(line.trimStart())) continue

    const regex = /#([a-zA-Z0-9_/-]+)/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(line)) !== null) {
      tags.add(match[1].toLowerCase())
    }
  }

  return Array.from(tags)
}

export async function buildTagIndex(
  allPaths: string[],
  readFile: (path: string) => Promise<string>
): Promise<Record<string, string[]>> {
  const index: Record<string, string[]> = {}

  for (const path of allPaths) {
    let content: string
    try {
      content = await readFile(path)
    } catch {
      continue
    }

    for (const tag of extractTags(content)) {
      if (!index[tag]) index[tag] = []
      if (!index[tag].includes(path)) index[tag].push(path)
    }
  }

  return index
}

export function updateTagIndex(
  index: Record<string, string[]>,
  changedPath: string,
  newContent: string
): Record<string, string[]> {
  const newIndex: Record<string, string[]> = {}

  for (const [tag, paths] of Object.entries(index)) {
    const filtered = paths.filter((p) => p !== changedPath)
    if (filtered.length > 0) newIndex[tag] = filtered
  }

  for (const tag of extractTags(newContent)) {
    if (!newIndex[tag]) newIndex[tag] = []
    if (!newIndex[tag].includes(changedPath)) newIndex[tag].push(changedPath)
  }

  return newIndex
}
