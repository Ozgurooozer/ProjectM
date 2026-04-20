/**
 * Markdown-Aware Recursive Text Chunker
 *
 * Strategy (2026 benchmark-validated):
 * 1. Split by Markdown headings first (heading-aware)
 * 2. Recursively split large sections: paragraph > sentence > space
 * 3. Attach heading path metadata to each chunk for context
 * 4. ~400 token (~1600 char) target, 512 hard limit via tokenizer
 * 5. ~10-15% overlap (150 chars / ~37 tokens)
 *
 * References:
 * - Vectara/NAACL 2025: chunking config matters as much as embedding model
 * - FloTorch 2026: heading-aware chunking improves retrieval 40-60% for Markdown
 * - Industry default: 400-512 tokens with 10-20% overlap
 */

const MAX_CHUNK_CHARS = 1600   // ~400 tokens (safe for bge-micro-v2 with prefix)
const OVERLAP_CHARS = 150      // ~37 tokens (~10% overlap)
const MIN_CHUNK_CHARS = 200    // ~50 tokens (prevent tiny fragments)

export interface TextChunk {
  text: string
  index: number
  startOffset: number
  endOffset: number
  headingPath: string  // e.g. "Installation > Requirements"
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function chunkMarkdownText(text: string): TextChunk[] {
  const cleaned = text.trim()
  if (!cleaned) return []

  // Short text → single chunk
  if (cleaned.length <= MAX_CHUNK_CHARS) {
    return [{
      text: cleaned,
      index: 0,
      startOffset: 0,
      endOffset: cleaned.length,
      headingPath: '',
    }]
  }

  // 1. Split into Markdown sections by headings
  const sections = splitByHeadings(cleaned)

  // 2. Split large sections recursively
  const rawChunks: Omit<TextChunk, 'index'>[] = []

  for (const section of sections) {
    if (section.content.length <= MAX_CHUNK_CHARS) {
      if (section.content.trim().length >= MIN_CHUNK_CHARS) {
        rawChunks.push({
          text: section.content.trim(),
          startOffset: section.startOffset,
          endOffset: section.endOffset,
          headingPath: section.headingPath,
        })
      }
    } else {
      const subChunks = recursiveSplit(
        section.content,
        section.startOffset,
        section.headingPath
      )
      rawChunks.push(...subChunks)
    }
  }

  // 3. Merge tiny chunks
  const merged = mergeSmallChunks(rawChunks)

  // 4. Assign indices
  return merged.map((chunk, i) => ({ ...chunk, index: i }))
}

// ── Split by Markdown headings ────────────────────────────────────────────────

interface MarkdownSection {
  headingPath: string
  content: string
  startOffset: number
  endOffset: number
}

function splitByHeadings(text: string): MarkdownSection[] {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  const sections: MarkdownSection[] = []
  const headingStack: string[] = []

  let lastIndex = 0
  let lastHeadingPath = ''

  const matches: { index: number; level: number; title: string }[] = []
  let match: RegExpExecArray | null
  while ((match = headingRegex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      level: match[1].length,
      title: match[2].trim(),
    })
  }

  for (const m of matches) {
    // Save previous section
    if (lastIndex < m.index) {
      const content = text.slice(lastIndex, m.index)
      if (content.trim().length > 0) {
        sections.push({
          headingPath: lastHeadingPath,
          content,
          startOffset: lastIndex,
          endOffset: m.index,
        })
      }
    }

    // Update heading stack
    while (headingStack.length >= m.level) {
      headingStack.pop()
    }
    headingStack.push(m.title)
    lastHeadingPath = headingStack.join(' > ')
    lastIndex = m.index
  }

  // Last section
  if (lastIndex < text.length) {
    const content = text.slice(lastIndex)
    if (content.trim().length > 0) {
      sections.push({
        headingPath: lastHeadingPath,
        content,
        startOffset: lastIndex,
        endOffset: text.length,
      })
    }
  }

  // No headings → whole text as one section
  if (sections.length === 0) {
    sections.push({
      headingPath: '',
      content: text,
      startOffset: 0,
      endOffset: text.length,
    })
  }

  return sections
}

// ── Recursive split for large sections ───────────────────────────────────────

function recursiveSplit(
  text: string,
  baseOffset: number,
  headingPath: string
): Omit<TextChunk, 'index'>[] {
  const chunks: Omit<TextChunk, 'index'>[] = []
  let position = 0

  while (position < text.length) {
    // Last chunk
    if (position + MAX_CHUNK_CHARS >= text.length) {
      const remaining = text.slice(position).trim()
      if (remaining.length >= MIN_CHUNK_CHARS) {
        chunks.push({
          text: remaining,
          startOffset: baseOffset + position,
          endOffset: baseOffset + text.length,
          headingPath,
        })
      } else if (chunks.length > 0) {
        // Too short → append to previous
        const last = chunks[chunks.length - 1]
        last.text = (last.text + '\n\n' + remaining).trim()
        last.endOffset = baseOffset + text.length
      }
      break
    }

    // Find natural break point
    const searchStart = Math.floor(position + MAX_CHUNK_CHARS * 0.6)
    const searchEnd = position + MAX_CHUNK_CHARS
    const end = findNaturalBreak(text, searchStart, searchEnd)

    const chunkText = text.slice(position, end).trim()
    if (chunkText.length >= MIN_CHUNK_CHARS) {
      chunks.push({
        text: chunkText,
        startOffset: baseOffset + position,
        endOffset: baseOffset + end,
        headingPath,
      })
    }

    // Advance with overlap
    position = Math.max(position + 1, end - OVERLAP_CHARS)
  }

  return chunks
}

// ── Find natural break point ──────────────────────────────────────────────────
// Priority: paragraph > line break > sentence end > comma > space

function findNaturalBreak(text: string, searchStart: number, searchEnd: number): number {
  const segment = text.slice(searchStart, searchEnd)

  // 1. Paragraph break (\n\n)
  const paraBreak = segment.lastIndexOf('\n\n')
  if (paraBreak !== -1) return searchStart + paraBreak + 2

  // 2. Line break (\n)
  const lineBreak = segment.lastIndexOf('\n')
  if (lineBreak !== -1) return searchStart + lineBreak + 1

  // 3. Sentence end (. ! ?) — works for Turkish and English
  const sentenceEnd = findLastSentenceEnd(segment)
  if (sentenceEnd !== -1) return searchStart + sentenceEnd + 1

  // 4. Comma or semicolon
  const commaBreak = Math.max(segment.lastIndexOf(', '), segment.lastIndexOf('; '))
  if (commaBreak !== -1) return searchStart + commaBreak + 2

  // 5. Any space
  const spaceBreak = segment.lastIndexOf(' ')
  if (spaceBreak !== -1) return searchStart + spaceBreak + 1

  return searchEnd
}

function findLastSentenceEnd(text: string): number {
  for (let i = text.length - 1; i >= 0; i--) {
    if (
      (text[i] === '.' || text[i] === '!' || text[i] === '?') &&
      (i + 1 >= text.length || text[i + 1] === ' ' || text[i + 1] === '\n')
    ) {
      return i
    }
  }
  return -1
}

// ── Merge tiny chunks ─────────────────────────────────────────────────────────

function mergeSmallChunks(
  chunks: Omit<TextChunk, 'index'>[]
): Omit<TextChunk, 'index'>[] {
  if (chunks.length <= 1) return chunks

  const merged: Omit<TextChunk, 'index'>[] = []

  for (const chunk of chunks) {
    const last = merged[merged.length - 1]

    // Merge if previous is too small AND same heading
    if (
      last &&
      last.text.length < MIN_CHUNK_CHARS &&
      last.headingPath === chunk.headingPath
    ) {
      last.text = (last.text + '\n\n' + chunk.text).trim()
      last.endOffset = chunk.endOffset
    } else {
      merged.push({ ...chunk })
    }
  }

  return merged
}

// ── Utility ───────────────────────────────────────────────────────────────────

export function estimateChunkCount(textLength: number): number {
  if (textLength <= MAX_CHUNK_CHARS) return 1
  return Math.ceil(textLength / (MAX_CHUNK_CHARS - OVERLAP_CHARS))
}
