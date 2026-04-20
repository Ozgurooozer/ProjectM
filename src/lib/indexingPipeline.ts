import { embeddingWorker } from './embeddingWorkerManager'
import { type VectorStore, type ChunkVector } from './vectorStore'
import { hashContent } from './contentHash'
import { preprocessForEmbedding, extractSnippet } from './textPreprocessor'
import { chunkMarkdownText } from './textChunker'
import { flattenTree, pathToTitle } from './wikilinks'
import { readNote } from './tauri'
import type { FileNode } from '../types'

export interface IndexingProgress {
  phase: 'checking' | 'embedding' | 'done' | 'error'
  current: number
  total: number
  currentNoteName: string
  message: string
}

export type ProgressCallback = (progress: IndexingProgress) => void

// Paths excluded from indexing
const EXCLUDED_PREFIXES = ['_templates', '.vault-recovery', 'Daily Notes']

function shouldIndex(path: string): boolean {
  const normalized = path.replace(/\\/g, '/')
  return !EXCLUDED_PREFIXES.some((prefix) =>
    normalized.includes('/' + prefix + '/') || normalized.includes('/' + prefix)
  )
}

async function readAndPrepare(path: string): Promise<{
  raw: string
  cleanText: string
  hash: string
  snippet: string
  title: string
} | null> {
  try {
    const raw = await readNote(path)
    const cleanText = preprocessForEmbedding(path, raw)
    const hash = hashContent(raw)
    const snippet = extractSnippet(raw)
    const title = pathToTitle(path)
    return { raw, cleanText, hash, snippet, title }
  } catch {
    return null
  }
}

// ── Full vault indexing ───────────────────────────────────────────────────────

export async function indexVault(
  fileTree: FileNode[],
  vectorStore: VectorStore,
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<{ indexed: number; skipped: number; errors: number }> {
  const allPaths = flattenTree(fileTree).filter(shouldIndex)
  const stats = { indexed: 0, skipped: 0, errors: 0 }

  onProgress?.({
    phase: 'checking',
    current: 0,
    total: allPaths.length,
    currentNoteName: '',
    message: 'Checking which notes need indexing...',
  })

  // Read all notes and compute hashes
  const noteData: Array<{
    path: string
    cleanText: string
    hash: string
    snippet: string
    title: string
  }> = []

  const currentHashes: Array<{ path: string; contentHash: string }> = []

  for (const path of allPaths) {
    if (signal?.aborted) return stats

    const prepared = await readAndPrepare(path)
    if (!prepared) { stats.errors++; continue }

    currentHashes.push({ path, contentHash: prepared.hash })
    noteData.push({
      path,
      cleanText: prepared.cleanText,
      hash: prepared.hash,
      snippet: prepared.snippet,
      title: prepared.title,
    })
  }

  // Find stale and deleted notes
  const stale = await vectorStore.findStaleNotes(currentHashes)
  const staleSet = new Set(stale)
  const toIndex = noteData.filter((n) => staleSet.has(n.path))

  const currentPathSet = new Set(allPaths)
  const deleted = await vectorStore.findDeletedNotes(currentPathSet)
  for (const deletedPath of deleted) {
    await vectorStore.deleteChunksForNote(deletedPath)
  }

  if (toIndex.length === 0) {
    onProgress?.({
      phase: 'done',
      current: allPaths.length,
      total: allPaths.length,
      currentNoteName: '',
      message: `All ${allPaths.length} notes up to date`,
    })
    stats.skipped = allPaths.length
    return stats
  }

  // Index stale notes with chunk-based approach
  for (let i = 0; i < toIndex.length; i++) {
    if (signal?.aborted) return stats

    const note = toIndex[i]

    onProgress?.({
      phase: 'embedding',
      current: i,
      total: toIndex.length,
      currentNoteName: note.title,
      message: `Indexing: ${note.title}`,
    })

    try {
      await indexNoteChunks(note.path, note.cleanText, note.hash, note.snippet, note.title, vectorStore)
      stats.indexed++
    } catch (err) {
      console.warn(`Failed to embed note: ${note.path}`, err)
      stats.errors++
    }
  }

  const total = await vectorStore.count()
  await vectorStore.setMeta({
    vaultPath: '',
    modelVersion: 'bge-micro-v2',
    totalNotes: toIndex.length,
    lastFullIndex: Date.now(),
  })

  onProgress?.({
    phase: 'done',
    current: toIndex.length,
    total: toIndex.length,
    currentNoteName: '',
    message: `Indexed ${stats.indexed} notes (${total} chunks total)`,
  })

  return stats
}

// ── Single note chunk indexing ────────────────────────────────────────────────

async function indexNoteChunks(
  notePath: string,
  cleanText: string,
  contentHash: string,
  snippet: string,
  title: string,
  vectorStore: VectorStore
): Promise<void> {
  // Delete old chunks for this note
  await vectorStore.deleteChunksForNote(notePath)

  // Split into chunks
  const chunks = chunkMarkdownText(cleanText)

  // Embed each chunk with heading context
  const chunkVectors: ChunkVector[] = []

  for (const chunk of chunks) {
    const vector = await embeddingWorker.embedWithHeading(chunk.text, chunk.headingPath)

    chunkVectors.push({
      id: `${notePath}::${chunk.index}`,
      notePath,
      chunkIndex: chunk.index,
      contentHash,
      vector,
      title,
      snippet,
      headingPath: chunk.headingPath,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      indexedAt: Date.now(),
    })
  }

  await vectorStore.upsertChunks(chunkVectors)
}

// ── Incremental single note indexing (called after autosave) ──────────────────

export async function indexSingleNote(
  notePath: string,
  noteContent: string,
  vectorStore: VectorStore
): Promise<void> {
  if (!shouldIndex(notePath)) return

  const hash = hashContent(noteContent)

  // Check if already up to date
  const existingChunks = await vectorStore.getChunksForNote(notePath)
  if (existingChunks.length > 0 && existingChunks[0].contentHash === hash) return

  const cleanText = preprocessForEmbedding(notePath, noteContent)
  const snippet = extractSnippet(noteContent)
  const title = pathToTitle(notePath)

  await indexNoteChunks(notePath, cleanText, hash, snippet, title, vectorStore)
}
