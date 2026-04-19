import { embeddingWorker } from './embeddingWorkerManager'
import { type VectorStore, type NoteVector } from './vectorStore'
import { hashContent } from './contentHash'
import { preprocessForEmbedding, extractSnippet } from './textPreprocessor'
import { flattenTree } from './wikilinks'
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

async function readAndPrepare(
  path: string
): Promise<{ raw: string; text: string; hash: string; snippet: string } | null> {
  try {
    const raw = await readNote(path)
    const text = preprocessForEmbedding(path, raw)
    const hash = hashContent(raw)
    const snippet = extractSnippet(raw)
    return { raw, text, hash, snippet }
  } catch {
    return null
  }
}

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

  const noteData: Array<{
    path: string
    text: string
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
      text: prepared.text,
      hash: prepared.hash,
      snippet: prepared.snippet,
      title: path.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? '',
    })
  }

  const stale = await vectorStore.findStaleNotes(currentHashes)
  const staleSet = new Set(stale)
  const toIndex = noteData.filter((n) => staleSet.has(n.path))

  const currentPathSet = new Set(allPaths)
  const deleted = await vectorStore.findDeletedNotes(currentPathSet)
  for (const deletedPath of deleted) {
    await vectorStore.deleteVector(deletedPath)
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
      const vector = await embeddingWorker.embed(note.text)

      const entry: NoteVector = {
        path: note.path,
        contentHash: note.hash,
        vector,
        title: note.title,
        snippet: note.snippet,
        indexedAt: Date.now(),
        noteLength: note.text.length,
      }

      await vectorStore.upsertVector(entry)
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
    totalNotes: total,
    lastFullIndex: Date.now(),
  })

  onProgress?.({
    phase: 'done',
    current: toIndex.length,
    total: toIndex.length,
    currentNoteName: '',
    message: `Indexed ${stats.indexed} notes`,
  })

  return stats
}

export async function indexSingleNote(
  notePath: string,
  noteContent: string,
  vectorStore: VectorStore
): Promise<void> {
  if (!shouldIndex(notePath)) return

  const hash = hashContent(noteContent)

  const existing = await vectorStore.getVector(notePath)
  if (existing?.contentHash === hash) return

  const text = preprocessForEmbedding(notePath, noteContent)
  const snippet = extractSnippet(noteContent)
  const title = notePath.split(/[\\/]/).pop()?.replace(/\.md$/, '') ?? ''

  const vector = await embeddingWorker.embed(text)

  await vectorStore.upsertVector({
    path: notePath,
    contentHash: hash,
    vector,
    title,
    snippet,
    indexedAt: Date.now(),
    noteLength: noteContent.length,
  })
}
