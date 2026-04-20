import type { BacklinkEntry } from '../types'
import { pathToTitle } from './wikilinks'

export interface GraphNode {
  id: string
  name: string
  linkCount: number
}

export interface GraphEdge {
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export function buildGraphData(
  backlinkIndex: Record<string, BacklinkEntry[]>
): GraphData {
  const nodeMap = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []

  for (const [targetPath, entries] of Object.entries(backlinkIndex)) {
    if (!nodeMap.has(targetPath)) {
      nodeMap.set(targetPath, {
        id: targetPath,
        name: pathToTitle(targetPath) || targetPath,
        linkCount: 0,
      })
    }

    for (const entry of entries) {
      if (!nodeMap.has(entry.sourcePath)) {
        nodeMap.set(entry.sourcePath, {
          id: entry.sourcePath,
          name: pathToTitle(entry.sourcePath) || entry.sourcePath,
          linkCount: 0,
        })
      }

      edges.push({ source: entry.sourcePath, target: targetPath })

      const sourceNode = nodeMap.get(entry.sourcePath)!
      sourceNode.linkCount++
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
  }
}
