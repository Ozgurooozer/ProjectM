export interface MermaidBlock {
  id: string
  code: string
}

let blockIndex = 0

export function extractMermaidBlocks(content: string): {
  processed: string
  blocks: MermaidBlock[]
} {
  const blocks: MermaidBlock[] = []

  const processed = content.replace(
    /```mermaid\n([\s\S]*?)```/g,
    (_, code: string) => {
      const id = `MERMAID_BLOCK_${blockIndex++}`
      blocks.push({ id, code })
      return `MERMAID_PLACEHOLDER_${id}`
    }
  )

  return { processed, blocks }
}
