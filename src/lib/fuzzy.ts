export interface FuzzyMatch {
  score: number
  indices: number[]
}

export function fuzzyMatch(pattern: string, text: string): FuzzyMatch | null {
  const lowerPattern = pattern.toLowerCase()
  const lowerText = text.toLowerCase()

  if (!lowerPattern) return { score: 1, indices: [] }

  const indices: number[] = []
  let pi = 0

  for (let i = 0; i < lowerText.length && pi < lowerPattern.length; i++) {
    if (lowerText[i] === lowerPattern[pi]) {
      indices.push(i)
      pi++
    }
  }

  if (pi < lowerPattern.length) return null

  let score = indices.length / text.length
  let consecutive = 0
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] === indices[i - 1] + 1) consecutive++
  }
  score += consecutive * 0.5
  if (indices[0] === 0) score += 0.3

  return { score, indices }
}

export interface FuzzyResult<T> {
  item: T
  score: number
  indices: number[]
}

export function fuzzySearch<T>(
  items: T[],
  pattern: string,
  getText: (item: T) => string
): FuzzyResult<T>[] {
  if (!pattern.trim()) return items.map((item) => ({ item, score: 1, indices: [] }))

  const results: FuzzyResult<T>[] = []
  for (const item of items) {
    const text = getText(item)
    const match = fuzzyMatch(pattern, text)
    if (match) results.push({ item, score: match.score, indices: match.indices })
  }
  return results.sort((a, b) => b.score - a.score)
}
