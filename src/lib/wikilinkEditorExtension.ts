import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view'
import type { Range } from '@codemirror/state'
import { resolveWikiLink, flattenTree } from './wikilinks'
import type { FileNode } from '../types'

const WIKILINK_REGEX = /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g

const wikilinkMark = Decoration.mark({ class: 'cm-wikilink' })

function buildDecorations(view: EditorView): DecorationSet {
  const decorations: Range<Decoration>[] = []
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    let match: RegExpExecArray | null
    WIKILINK_REGEX.lastIndex = 0
    while ((match = WIKILINK_REGEX.exec(text)) !== null) {
      decorations.push(
        wikilinkMark.range(from + match.index, from + match.index + match[0].length)
      )
    }
  }
  return Decoration.set(decorations, true)
}

export function wikilinkEditorExtension(
  fileTree: FileNode[],
  onNavigate: (path: string) => void
) {
  const allPaths = flattenTree(fileTree)

  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view)
        }
      }
    },
    { decorations: (v) => v.decorations }
  )

  const clickHandler = EditorView.domEventHandlers({
    click(event, view) {
      if (!event.ctrlKey && !event.metaKey) return false

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos === null) return false

      const line = view.state.doc.lineAt(pos)
      const lineText = line.text
      const posInLine = pos - line.from

      WIKILINK_REGEX.lastIndex = 0
      let match: RegExpExecArray | null
      while ((match = WIKILINK_REGEX.exec(lineText)) !== null) {
        const start = match.index
        const end = start + match[0].length
        if (posInLine >= start && posInLine <= end) {
          const inner = match[1].trim()
          const pipeIdx = inner.indexOf('|')
          const linkName = pipeIdx !== -1 ? inner.slice(0, pipeIdx).trim() : inner
          const resolved = resolveWikiLink(linkName, allPaths)
          if (resolved) {
            onNavigate(resolved)
          }
          return true
        }
      }

      return false
    },
  })

  return [plugin, clickHandler]
}
