import { EditorView, ViewPlugin, ViewUpdate, keymap } from '@codemirror/view'
import { filterSlashCommands, type SlashCommand } from './slashCommands'
import { createRoot } from 'react-dom/client'
import { createElement } from 'react'
import { SlashCommandMenu } from '../components/Editor/SlashCommandMenu'

interface SlashState {
  active: boolean
  query: string
  from: number
  selectedIndex: number
  menuEl: HTMLDivElement | null
  root: ReturnType<typeof createRoot> | null
}

function initialState(): SlashState {
  return { active: false, query: '', from: -1, selectedIndex: 0, menuEl: null, root: null }
}

export function slashCommandExtension(
  onInsert: (text: string, from: number, to: number) => void
) {
  let state = initialState()

  function closeMenu() {
    if (state.root) {
      state.root.unmount()
      state.root = null
    }
    if (state.menuEl?.parentNode) {
      state.menuEl.parentNode.removeChild(state.menuEl)
      state.menuEl = null
    }
    state = { ...state, active: false, query: '', from: -1, selectedIndex: 0 }
  }

  function renderMenu(view: EditorView, from: number, _query: string, commands: SlashCommand[]) {
    const coords = view.coordsAtPos(from)
    if (!coords) return

    if (!state.menuEl) {
      state.menuEl = document.createElement('div')
      document.body.appendChild(state.menuEl)
    }
    if (!state.root) {
      state.root = createRoot(state.menuEl)
    }

    const position = { top: coords.bottom + 4, left: Math.max(8, coords.left - 8) }

    state.root.render(
      createElement(SlashCommandMenu, {
        commands,
        selectedIndex: state.selectedIndex,
        position,
        onSelect: (cmd: SlashCommand) => insertCommand(view, cmd),
        onHover: (index: number) => {
          state = { ...state, selectedIndex: index }
          renderMenu(view, state.from, state.query, filterSlashCommands(state.query))
        },
      })
    )
  }

  function insertCommand(view: EditorView, cmd: SlashCommand) {
    const text = cmd.insert()
    const from = state.from
    const to = view.state.selection.main.head
    closeMenu()
    onInsert(text, from, to)
  }

  const plugin = ViewPlugin.fromClass(
    class {
      update(update: ViewUpdate) {
        if (!update.docChanged && !update.selectionSet) return

        const pos = update.view.state.selection.main.head
        const line = update.view.state.doc.lineAt(pos)
        const textToPos = line.text.slice(0, pos - line.from)
        const slashMatch = textToPos.match(/^\/([\w]*)$/)

        if (slashMatch) {
          const query = slashMatch[1]
          const from = line.from
          const commands = filterSlashCommands(query)
          state = { ...state, active: true, query, from }

          if (commands.length > 0) {
            renderMenu(update.view, from, query, commands)
          } else {
            closeMenu()
          }
        } else if (state.active) {
          closeMenu()
        }
      }

      destroy() {
        closeMenu()
      }
    }
  )

  const slashKeymap = keymap.of([
    {
      key: 'ArrowDown',
      run: (view) => {
        if (!state.active) return false
        const commands = filterSlashCommands(state.query)
        state = { ...state, selectedIndex: Math.min(state.selectedIndex + 1, commands.length - 1) }
        renderMenu(view, state.from, state.query, commands)
        return true
      },
    },
    {
      key: 'ArrowUp',
      run: (view) => {
        if (!state.active) return false
        const commands = filterSlashCommands(state.query)
        state = { ...state, selectedIndex: Math.max(state.selectedIndex - 1, 0) }
        renderMenu(view, state.from, state.query, commands)
        return true
      },
    },
    {
      key: 'Enter',
      run: (view) => {
        if (!state.active) return false
        const commands = filterSlashCommands(state.query)
        const cmd = commands[state.selectedIndex]
        if (cmd) insertCommand(view, cmd)
        return true
      },
    },
    {
      key: 'Escape',
      run: () => {
        if (!state.active) return false
        closeMenu()
        return true
      },
    },
  ])

  return [plugin, slashKeymap]
}
