import { embeddingWorker } from './embeddingWorkerManager'
import { type VectorStore, type NoteVector } from './vectorStore'

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
  }
  return Math.max(-1, Math.min(1, dot))
}

export interface SimilarityResult {
  path: string
  title: string
  snippet: string
  score: number
  scoreLabel: string
}

function scoreLabel(score: number): string {
  if (score >= 0.80) return 'Very similar'
  if (score >= 0.65) return 'Similar'
  if (score >= 0.50) return 'Related'
  return 'Loosely related'
}

export async function searchByQuery(
  query: string,
  vectorStore: VectorStore,
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

  const allVectors = await vectorStore.getAllVectors()

  return computeTopK(queryVector, allVectors, { topK, minScore, excludePath })
}

export async function searchByNote(
  notePath: string,
  vectorStore: VectorStore,
  options: {
    topK?: number
    minScore?: number
  } = {}
): Promise<SimilarityResult[]> {
  const { topK = 8, minScore = 0.50 } = options

  const noteVector = await vectorStore.getVector(notePath)
  if (!noteVector) return []

  const allVectors = await vectorStore.getAllVectors()

  return computeTopK(noteVector.vector, allVectors, {
    topK,
    minScore,
    excludePath: notePath,
  })
}

function computeTopK(
  queryVector: number[],
  allVectors: NoteVector[],
  options: {
    topK: number
    minScore: number
    excludePath: string | null
  }
): SimilarityResult[] {
  const { topK, minScore, excludePath } = options

  const results: SimilarityResult[] = []

  for (const entry of allVectors) {
    if (entry.path === excludePath) continue
    if (entry.vector.length === 0) continue

    const score = cosineSimilarity(queryVector, entry.vector)

    if (score >= minScore) {
      results.push({
        path: entry.path,
        title: entry.title,
        snippet: entry.snippet,
        score,
        scoreLabel: scoreLabel(score),
      })
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

export interface HybridResult extends SimilarityResult {
  matchType: 'semantic' | 'keyword' | 'both'
  keywordScore: number
}

export function mergeSearchResults(
  semanticResults: SimilarityResult[],
  keywordPaths: string[],
  allVectors: NoteVector[]
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
    const vectorEntry = allVectors.find((v) => v.path === path)
    if (!vectorEntry) continue

    merged.push({
      path,
      title: vectorEntry.title,
      snippet: vectorEntry.snippet,
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
