import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import type { Completion } from '@codemirror/autocomplete'
import { flattenTree } from './wikilinks'
import type { FileNode } from '../types'

export function wikiLinkCompletion(fileTree: FileNode[]) {
  const allPaths = flattenTree(fileTree)

  // Deduplicate: prefer shorter path when names clash
  const nameToPath = new Map<string, string>()
  for (const p of allPaths) {
    const name = p.split('/').pop()?.replace(/\.md$/, '') ?? ''
    if (!name) continue
    const existing = nameToPath.get(name.toLowerCase())
    if (!existing || p.length < existing.length) {
      nameToPath.set(name.toLowerCase(), name)
    }
  }
  const uniqueNames = Array.from(new Set(nameToPath.values()))

  return autocompletion({
    override: [
      (context: CompletionContext): CompletionResult | null => {
        const before = context.matchBefore(/\[\[[^\]]]*/)
        if (!before) return null

        const afterBrackets = before.text.slice(2)
        // Stop suggestions after pipe (user is typing alias)
        if (afterBrackets.includes('|')) return null

        const query = afterBrackets.toLowerCase()

        const options = uniqueNames
          .filter((name) => name.toLowerCase().includes(query))
          .map((name) => ({
            label: name,
            apply: (view: EditorView, _c: Completion, from: number, to: number) => {
              const fullFrom = from - 2
              view.dispatch({
                changes: { from: fullFrom, to, insert: `[[${name}]]` },
                selection: { anchor: fullFrom + name.length + 4 },
              })
            },
          }))

        return { from: before.from + 2, options, validFor: /^[^|\]]*$/ }
      },
    ],
  })
}
