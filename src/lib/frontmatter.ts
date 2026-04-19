import yaml from 'js-yaml'

export interface Frontmatter {
  [key: string]: unknown
}

export interface ParsedNote {
  frontmatter: Frontmatter | null
  body: string
  rawFrontmatter: string
}

export function parseFrontmatter(content: string): ParsedNote {
  if (!content.startsWith('---')) {
    return { frontmatter: null, body: content, rawFrontmatter: '' }
  }

  const end = content.indexOf('\n---', 3)
  if (end === -1) {
    return { frontmatter: null, body: content, rawFrontmatter: '' }
  }

  const rawFrontmatter = content.slice(3, end).trim()
  const body = content.slice(end + 4).trimStart()

  try {
    const parsed = yaml.load(rawFrontmatter)
    if (typeof parsed === 'object' && parsed !== null) {
      return { frontmatter: parsed as Frontmatter, body, rawFrontmatter }
    }
  } catch {
    // Invalid YAML — treat as no frontmatter
  }

  return { frontmatter: null, body: content, rawFrontmatter: '' }
}

export function serializeFrontmatter(fields: Frontmatter, body: string): string {
  const yamlStr = yaml.dump(fields, { lineWidth: -1 }).trim()
  return `---\n${yamlStr}\n---\n\n${body}`
}

export function getFrontmatterTags(frontmatter: Frontmatter | null): string[] {
  if (!frontmatter?.tags) return []
  const tags = frontmatter.tags
  if (Array.isArray(tags)) return (tags as unknown[]).map(String).map((t) => t.toLowerCase())
  if (typeof tags === 'string') return [tags.toLowerCase()]
  return []
}
