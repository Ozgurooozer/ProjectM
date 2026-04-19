export interface HeadingNode {
  id: string
  text: string
  level: number
}

export function extractHeadings(content: string): HeadingNode[] {
  const headings: HeadingNode[] = []
  const lines = content.split('\n')
  const idCount: Record<string, number> = {}
  let inCodeBlock = false

  for (const line of lines) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue

    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (!match) continue

    const level = match[1].length
    const text = match[2].trim()

    let id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()

    if (idCount[id] !== undefined) {
      idCount[id]++
      id = `${id}-${idCount[id]}`
    } else {
      idCount[id] = 0
    }

    headings.push({ id, text, level })
  }

  return headings
}
