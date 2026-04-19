import { parseFrontmatter } from './frontmatter'

const MAX_CHARS = 2000

export function preprocessForEmbedding(
  notePath: string,
  rawContent: string
): string {
  const title = notePath
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.md$/, '') ?? ''

  const { body, frontmatter } = parseFrontmatter(rawContent)

  const fmTags = frontmatter?.tags
    ? Array.isArray(frontmatter.tags)
      ? (frontmatter.tags as string[]).join(' ')
      : String(frontmatter.tags)
    : ''

  let text = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/!\[\[.*?\]\]/g, '')
    .replace(/\[\[([^|\]]+)(?:\|[^\]]*)?\]\]/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')
    .replace(/^\s*[-*+]\s/gm, '')
    .replace(/^\s*\d+\.\s/gm, '')
    .replace(/^\s*>\s/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const parts = [title]
  if (fmTags) parts.push(fmTags)
  parts.push(text)

  return parts.join('\n').trim().slice(0, MAX_CHARS)
}

export function extractSnippet(rawContent: string, maxLength = 200): string {
  const { body } = parseFrontmatter(rawContent)
  const clean = body
    .replace(/#{1,6}\s/g, '')
    .replace(/[*_~`]/g, '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\n+/g, ' ')
    .trim()
  return clean.slice(0, maxLength)
}
