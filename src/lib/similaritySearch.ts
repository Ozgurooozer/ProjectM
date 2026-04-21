import { embeddingWorker } from './embeddingWorkerManager'
import { type VectorStore, type ChunkVector } from './vectorStore'
import { vectorSearch } from './tauri'

// ── Cosine similarity (kept for external use / tests) ─────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  if (denom === 0) return 0
  return Math.max(-1, Math.min(1, dot / denom))
}

// ── Result types ──────────────────────────────────────────────────────────────

export interface SimilarityResult {
  path: string
  title: string
  snippet: string
  score: number
  scoreLabel: string
  headingPath?: string
}

function scoreLabel(score: number): string {
  if (score >= 0.80) return 'Very similar'
  if (score >= 0.65) return 'Similar'
  if (score >= 0.50) return 'Related'
  return 'Loosely related'
}

function wireToResult(wire: { notePath: string; title: string; snippet: string; score: number; headingPath: string }): SimilarityResult {
  return {
    path: wire.notePath,
    title: wire.title,
    snippet: wire.snippet,
    score: wire.score,
    scoreLabel: scoreLabel(wire.score),
    headingPath: wire.headingPath || undefined,
  }
}

// ── Public search API ─────────────────────────────────────────────────────────

export async function searchByQuery(
  query: string,
  _vectorStore: VectorStore,
  options: {
    topK?: number
    minScore?: number
    excludePath?: string | null
  } = {}
): Promise<SimilarityResult[]> {
  const { topK = 10, minScore = 0.40, excludePath = null } = options

  if (!query.trim()) return []

  const queryVector = await embeddingWorker.embed(
    `Represent this query for searching relevant passages: ${query}`
  )

  const results = await vectorSearch(queryVector, topK, minScore, excludePath)
  return results.map(wireToResult)
}

export async function searchByNote(
  notePath: string,
  vectorStore: VectorStore,
  options: {
    topK?: number
    minScore?: number
  } = {}
): Promise<SimilarityResult[]> {
  const { topK = 8, minScore = 0.45 } = options

  const noteChunks = await vectorStore.getChunksForNote(notePath)
  if (noteChunks.length === 0) return []

  const queryChunk = noteChunks.reduce((best, c) =>
    (c.endOffset - c.startOffset) > (best.endOffset - best.startOffset) ? c : best
  )

  const results = await vectorSearch(queryChunk.vector, topK, minScore, notePath)
  return results.map(wireToResult)
}

// ── Hybrid search result types ────────────────────────────────────────────────

export interface HybridResult extends SimilarityResult {
  matchType: 'semantic' | 'keyword' | 'both'
  keywordScore: number
}

export function mergeSearchResults(
  semanticResults: SimilarityResult[],
  keywordPaths: string[],
  allChunks: ChunkVector[]
): HybridResult[] {
  const keywordSet = new Set(keywordPaths)
  const semanticMap = new Map(semanticResults.map((r) => [r.path, r]))
  const merged: HybridResult[] = []

  for (const result of semanticResults) {
    merged.push({
      ...result,
      matchType: keywordSet.has(result.path) ? 'both' : 'semantic',
      keywordScore: keywordSet.has(result.path) ? 1 : 0,
    })
  }

  for (const path of keywordPaths) {
    if (semanticMap.has(path)) continue
    const chunk = allChunks.find((c) => c.notePath === path)
    if (!chunk) continue
    merged.push({
      path,
      title: chunk.title,
      snippet: chunk.snippet,
      score: 0.4,
      scoreLabel: 'Keyword match',
      matchType: 'keyword',
      keywordScore: 1,
    })
  }

  return merged.sort((a, b) => {
    if (a.matchType === 'both' && b.matchType !== 'both') return -1
    if (b.matchType === 'both' && a.matchType !== 'both') return 1
    return b.score - a.score
  })
}