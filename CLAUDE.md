# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Dev (starts Vite + Tauri native window)
npm run tauri dev

# Type-check only (no emit)
npx tsc --noEmit

# Production build
npm run tauri build

# Frontend-only dev server (no native window)
npm run dev
```

Rust recompiles automatically when `src-tauri/src/**` changes during `tauri dev`. Frontend hot-reloads via Vite on port 1420.

---

## Architecture

This is a **Tauri 2 + React 19 + TypeScript** desktop app — a local-first markdown note-taking tool (Obsidian-inspired). There is no database; the file system is the source of truth.

### Two processes

| Process | Language | Entry point |
|---------|----------|-------------|
| Backend | Rust | `src-tauri/src/lib.rs` → `main.rs` |
| Frontend | React/TS | `src/main.tsx` → `src/App.tsx` |

The frontend calls the Rust backend exclusively through **Tauri commands** (`invoke`). All file I/O must go through Tauri — never use browser APIs for file access.

### Frontend data flow

```
React component
  → lib/tauri.ts (typed invoke wrappers)
  → Tauri command (Rust)
  → file system
```

Cross-component communication uses the **typed event bus** (`src/lib/events.ts`).  
Never use `window.dispatchEvent` / `CustomEvent` — always use `eventBus.emit(...)`.

### State management

Global state lives in **Zustand** via a slice pattern:

```
src/store/
├── appStore.ts          ← thin combiner; exports useAppStore (unchanged for all consumers)
└── slices/
    ├── vaultSlice.ts    ← vaultPath, fileTree, setVault, refreshFileTree
    ├── noteSlice.ts     ← activeNotePath, noteContent, saveStatus, readingMode
    ├── indexSlice.ts    ← backlinkIndex, tagIndex
    ├── uiSlice.ts       ← settings, cutPath, creatingMode, isRandomNote
    └── navigationSlice.ts ← pinnedNotes, recentNotes, activeTag
```

All components import `useAppStore` from `src/store/appStore` — no changes needed when slices are modified.

### Adding a Tauri command

1. Write the `#[tauri::command]` fn in the appropriate `src-tauri/src/<module>.rs`
2. Register it in `src-tauri/src/lib.rs` inside `generate_handler![]`
3. Add a typed wrapper in `src/lib/tauri.ts` using `invoke<ReturnType>(...)`

### Rust backend modules

```
src-tauri/src/
├── lib.rs        ← mod declarations + invoke_handler (thin combiner only)
├── fs_utils.rs   ← FileNode, SearchResult, normalize_path, read_dir_recursive, retry_operation
├── vault.rs      ← open_vault, search_vault, propagate_rename
├── notes.rs      ← read_note, write_note, create_note, rename_note, delete_note
├── folders.rs    ← create_folder, rename_folder, delete_folder, move_folder
├── media.rs      ← read_image (base64)
├── export.rs     ← export_pdf, backup_vault
└── recovery.rs   ← save_snapshot, list_snapshots, read_snapshot, delete_snapshot
```

### Key constraints

- TypeScript strict mode — no `any`
- All events go through `eventBus` (`src/lib/events.ts`) — never `window.dispatchEvent`
- Wiki-link parsing: `src/lib/wikilinks.ts`; backlink index: `src/lib/backlinks.ts`
- Autosave debounce: **1000 ms** — hook at `src/components/Editor/useAutosave.ts`
  - After every successful write, a snapshot is saved to `.vault-recovery/` (fire-and-forget)
- Path handling: all paths use forward-slash internally; normalize on entry via `normalizeVaultPath()`
- File operations retry up to 3× with 50 ms delay (handles Windows file locks)

### Tailwind

Uses **Tailwind CSS v4** via `@tailwindcss/vite`. No `tailwind.config.*` file. Single entry: `src/index.css` (`@import "tailwindcss"`).

### Build optimization

`vite.config.ts` splits heavy libraries into separate chunks so the main bundle stays small:

| Chunk | Libraries |
|-------|-----------|
| `d3-*.js` | d3 (lazy-loaded in GraphView) |
| `mermaid-*.js` | mermaid (lazy-loaded via React.lazy) |
| `codemirror-*.js` | codemirror + lang/theme/view/state/autocomplete |

---

## Plugin system

`src/lib/plugins.ts` exposes a `pluginRegistry` singleton. Plugins implement the `Plugin` interface:

```typescript
interface Plugin {
  id: string; name: string; version: string
  activate(ctx: PluginContext): void | Promise<void>
  deactivate?(ctx: PluginContext): void | Promise<void>
}
```

`PluginContext` gives plugins access to: state getters, `eventBus`, `openNote`, `setNoteContent`, and three registration methods:

- `registerSidebarPanel(panel)` — rendered below TagPanel in Sidebar
- `registerContextMenuItem(item)` — appended to FileTree context menu
- `registerCommand(cmd)` — dispatched via Ctrl keybinding in App.tsx

Plugin commands (`pluginRegistry.commands`) are separate from the built-in command palette (`commandRegistry` in `src/lib/commands.ts`).

---

## Command palette (`src/lib/commands.ts`)

`commandRegistry` is a singleton for **app-level commands** (distinct from plugin commands).  
Register with `commandRegistry.register({ id, name, category, shortcut?, action, enabled? })`.  
Built-in commands are registered in `App.tsx` on mount and unregistered on unmount.

`Ctrl+P` opens `CommandPalette` — fuzzy-filtered, grouped by category, arrow-key navigable.

---

## Slash commands (`src/lib/slashCommands.ts`)

Typing `/` at the start of a line in the editor opens a floating `SlashCommandMenu`.  
The CodeMirror extension is in `src/lib/slashCommandExtension.ts`.  
Available triggers: `h1` `h2` `h3` `ul` `ol` `todo` `code` `quote` `hr` `table` `date` `time` `datetime` `note` `warn` `tip` `link` `img` `math` `diagram`

---

## File recovery (`src-tauri/src/recovery.rs`)

Snapshots stored at `<vault>/.vault-recovery/YYYY-MM-DD_HH-MM-SS_notename.md`.  
Max 20 snapshots per note (oldest auto-deleted). Hidden folder — excluded from file tree.  
UI accessible via Settings → "🕐 View Snapshots". Restoring sets `noteContent`; autosave writes to disk.

---

## Event bus (`src/lib/events.ts`)

Full `EventMap` — all valid event keys:

| Key | Payload |
|-----|---------|
| `note:opened` | `{ path, content }` |
| `note:saved` | `{ path, content }` |
| `note:created` | `{ path }` |
| `note:deleted` | `{ path }` |
| `note:renamed` | `{ oldPath, newPath }` |
| `vault:opened` | `{ path }` |
| `vault:closed` | `{}` |
| `ui:new-note` | `{}` |
| `ui:open-daily-note` | `{}` |
| `ui:focus-search` | `{}` |
| `ui:toggle-reading` | `{}` |
| `ui:outline-scroll` | `{ headingId }` |
| `ui:open-random-note` | `{}` |
| `ui:open-vault` | `{}` |
| `ui:toggle-preview` | `{}` |
| `ui:open-quick-switcher` | `{}` |
| `ui:open-settings` | `{}` |
| `ui:open-recovery` | `{}` |
| `ui:export-html` | `{}` |
| `ui:export-pdf` | `{}` |
| `ui:backup-vault` | `{}` |
| `index:backlinks-updated` | `{ index }` |
| `index:tags-updated` | `{ index }` |
| `plugin:activated` | `{ pluginId }` |
| `plugin:deactivated` | `{ pluginId }` |

---

## Current Status ✅

### Features (Complete)

| Feature | Shortcut | Notes |
|---------|----------|-------|
| Vault selection | — | Dialog picker, persisted path |
| File tree sidebar | — | Recursive, expand/collapse, context menu |
| CodeMirror 6 editor | — | Syntax highlighting, markdown |
| Autosave | Ctrl+S | 1000 ms debounce; Ctrl+S saves immediately |
| File recovery | — | Auto-snapshot on save; restore via Settings |
| Markdown preview | — | remark + rehype, syntax highlighting, mermaid |
| Reading mode | Ctrl+R | Full-width rendered view |
| Wiki-link navigation | `[[` | Parsing, clickable, autocomplete |
| Backlink panel | — | All notes linking here, with snippet |
| Full-text search | Ctrl+F | File name + content |
| Command palette | Ctrl+P | All commands, fuzzy search, grouped |
| Slash commands | `/` | 20 insertable snippets at line start |
| Quick switcher | Ctrl+O | Open note by name |
| Create note/folder | Ctrl+N | Button or context menu |
| Rename note/folder | — | Double-click or context menu, propagates [[links]] |
| Delete note/folder | — | Confirmation dialog, recursive for folders |
| Cut/Paste files | Ctrl+X/V | Via keyboard or context menu |
| Daily note | Ctrl+D | Creates `Daily Notes/YYYY-MM-DD.md` |
| Random note | Ctrl+Shift+R | Excludes templates/daily/recovery; 🎲 badge |
| Pin notes | — | Context menu; ★ indicator in tree |
| Recent notes | — | Last 10 opened, shown in sidebar |
| Tag panel | — | `#tag` index, click to filter tree |
| Graph view | — | Force-directed wiki-link graph, d3 (lazy) |
| Outline panel | — | Heading navigator for current note |
| Settings | — | Font size, dark/light theme |
| Backup | — | ZIP export via Settings |
| Export | — | HTML and PDF from editor toolbar |
| Frontmatter panel | — | YAML front-matter editor |
| Help overlay | Ctrl+? | All keyboard shortcuts |

### Code structure

```
src/
├── App.tsx                        ← Layout, global keybindings, command registration
├── store/
│   ├── appStore.ts                ← useAppStore (combiner)
│   └── slices/                    ← vaultSlice, noteSlice, indexSlice, uiSlice, navigationSlice
├── lib/
│   ├── events.ts                  ← TypedEventBus + EventMap
│   ├── plugins.ts                 ← PluginRegistry, PluginContext
│   ├── commands.ts                ← CommandRegistry (app-level command palette)
│   ├── slashCommands.ts           ← 20 slash command definitions
│   ├── slashCommandExtension.ts   ← CodeMirror extension for slash menu
│   ├── tauri.ts                   ← All typed invoke wrappers (incl. snapshot API)
│   ├── wikilinks.ts               ← [[link]] parsing + flattenTree
│   ├── backlinks.ts               ← Backlink index builder
│   ├── tags.ts                    ← Tag index builder
│   ├── randomNote.ts              ← pickRandomNote (excludes templates/daily/recovery)
│   ├── dailyNotes.ts              ← Daily note path + open/create
│   └── ...
├── hooks/
│   ├── useNote.ts                 ← Note state + openNote + saveNow
│   └── useVault.ts                ← Vault state + openVaultDialog + rebuildIndexes
└── components/
    ├── Editor/
    │   ├── Editor.tsx             ← CodeMirror 6, toolbar, slash commands wired
    │   ├── useAutosave.ts         ← Debounced save + snapshot trigger
    │   └── SlashCommandMenu.tsx   ← Floating slash command picker
    ├── CommandPalette/
    │   └── CommandPalette.tsx     ← Ctrl+P modal
    ├── Recovery/
    │   └── FileRecovery.tsx       ← Snapshot list + preview + restore
    ├── Sidebar/
    │   ├── Sidebar.tsx            ← Vault open, daily note, random note, tag filter
    │   └── FileTree.tsx           ← Recursive tree, context menu, plugin items
    ├── Settings/
    │   └── Settings.tsx           ← Font/theme + backup + recovery link
    └── ...

src-tauri/src/
├── lib.rs        ← mod declarations + invoke_handler
├── fs_utils.rs   ← shared types + helpers
├── vault.rs      ← open_vault, search_vault, propagate_rename
├── notes.rs      ← CRUD note operations
├── folders.rs    ← CRUD folder operations
├── media.rs      ← read_image
├── export.rs     ← export_pdf, backup_vault
└── recovery.rs   ← snapshot CRUD + cleanup
```

### Known limitations

- No cloud sync
- No real-time collaboration
- No mobile support
- Graph layout is basic force-directed (not optimized for large vaults)
- Slash commands not triggered inside code blocks (by design)
- Plugin system is in-process only (no external .js plugin files yet)
