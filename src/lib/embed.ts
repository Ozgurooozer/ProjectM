import { resolveWikiLink } from './wikilinks'

export interface EmbedContext {
  allPaths: string[]
  readFile: (path: string) => Promise<string>
  visitedPaths: Set<string>
  depth: number
}

const MAX_EMBED_DEPTH = 3
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']

export async function resolveEmbeds(
  content: string,
  context: EmbedContext
): Promise<string> {
  if (context.depth >= MAX_EMBED_DEPTH) return content

  const embedRegex = /!\[\[([^|\]]+?)(?:\|[^\]]*)?\]\]/g
  const matches: Array<{ raw: string; linkName: string }> = []

  let match: RegExpExecArray | null
  while ((match = embedRegex.exec(content)) !== null) {
    const linkName = match[1].trim()
    if (IMAGE_EXTS.some((ext) => linkName.toLowerCase().endsWith(ext))) continue
    matches.push({ raw: match[0], linkName })
  }

  if (matches.length === 0) return content

  let result = content

  for (const { raw, linkName } of matches) {
    const targetPath = resolveWikiLink(linkName, context.allPaths)

    if (!targetPath) {
      result = result.replace(
        raw,
        `<div class="embed-missing">📄 Note not found: ${linkName}</div>`
      )
      continue
    }

    if (context.visitedPaths.has(targetPath)) {
      result = result.replace(
        raw,
        `<div class="embed-circular">⚠️ Circular embed: ${linkName}</div>`
      )
      continue
    }

    try {
      const embedContent = await context.readFile(targetPath)
      const childContext: EmbedContext = {
        ...context,
        visitedPaths: new Set([...context.visitedPaths, targetPath]),
        depth: context.depth + 1,
      }
      const resolvedContent = await resolveEmbeds(embedContent, childContext)

      const { marked } = await import('marked')
      const renderedContent = marked(resolvedContent) as string

      const embedHtml = `<div class="note-embed" data-source-path="${targetPath}">
  <div class="embed-header">
    <a href="#" data-wiki-path="${targetPath}" class="embed-title wiki-link wiki-link-exists">📄 ${linkName}</a>
  </div>
  <div class="embed-content">${renderedContent}</div>
</div>`
      result = result.replace(raw, embedHtml)
    } catch {
      result = result.replace(
        raw,
        `<div class="embed-missing">📄 Could not load: ${linkName}</div>`
      )
    }
  }

  return result
}
