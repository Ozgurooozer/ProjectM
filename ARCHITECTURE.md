# ARCHITECTURE.md

> Last updated: 2026-04-20 — reflects all 12 commits on `main`.

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Desktop shell | Tauri 2 (Rust) | ~10MB binary, native OS access, no Electron |
| Frontend | React 19 + TypeScript | Strict mode, no `any` |
| Build tool | Vite 7 | Bundle analyzer: `npm run build:analyze` |
| Styling | Tailwind CSS v4 | No config file, single entry `src/index.css` |
| Editor | CodeMirror 6 | Markdown, slash commands, wiki-link autocomplete |
| Markdown render | remark + rehype | Preview pipeline |
| State management | Zustand 5 (slice pattern) | 6 slices, `useAppStore()` everywhere |
| Graph view | D3.js | Force-directed wiki-link graph, lazy-loaded |
| Diagrams | Mermaid | `React.lazy()` in preview |
| Semantic search | bge-micro-v2 (ONNX) | ~23MB, fully local, Web Worker |
| Vector storage | **SQLite via Rust (rusqlite)** | `<vault>/.vault-index/index.db` |
| Backlink/tag index | **SQLite via Rust** | Persisted, no rebuild on reopen |
| Embedding runtime | Web Worker + @huggingface/transformers | Non-blocking ONNX inference |
| Linting | ESLint + TypeScript | `npm run lint` — 0 warnings enforced |

---

## Vault File Layout

```
<vault>/
  .vault-id              ← Stable UUID (survives move/rename)
  .vault-index/
    index.db             ← SQLite: vectors, backlinks, tags, metadata
  .vault-recovery/       ← Snapshots (hidden, excluded from file tree)
  Notes/
    My Note.md
    ...
```

**`.vault-id`** — generated on first open, used as IndexedDB-free identity.
**`index.db`** — WAL mode, locking_mode=EXCLUSIVE, moves with the vault.

---

## Folder Structure

```
my-vault-app/
├── src-tauri/src/
│   ├── lib.rs            ← mod declarations + invoke_handler + VectorStoreState
│   ├── main.rs           ← Tauri entry point
│   ├── fs_utils.rs       ← FileNode, SearchResult, normalize_path, retry_operation
│   ├── vault.rs          ← open_vault, search_vault (rayon+memchr), propagate_rename,
│   │                        get_or_create_vault_id
│   ├── notes.rs          ← read_note, write_note, create_note, rename_note, delete_note
│   ├── folders.rs        ← create_folder, rename_folder, delete_folder, move_folder
│   ├── media.rs          ← read_image (base64)
│   ├── export.rs         ← export_pdf, backup_vault
│   ├── recovery.rs       ← save_snapshot, list_snapshots, read_snapshot, delete_snapshot
│   └── vector_store.rs   ← SQLite vector/backlink/tag store (12+ commands)
│
└── src/
    ├── main.tsx
    ├── App.tsx                        ← Layout, keybindings, commands, panel resize
    ├── index.css                      ← Tailwind v4 + CSS variables + desktop batteries
    ├── components/
    │   ├── Editor/
    │   │   ├── Editor.tsx             ← CodeMirror 6, toolbar, TabBar
    │   │   ├── TabBar.tsx             ← Open notes as tabs, close with ×
    │   │   ├── FrontmatterPanel.tsx   ← YAML frontmatter editor
    │   │   ├── SaveStatus.tsx         ← Saved / Saving / Error indicator
    │   │   ├── SlashCommandMenu.tsx   ← Floating slash command picker
    │   │   └── useAutosave.ts         ← Debounce save + snapshot + index persist
    │   ├── Layout/
    │   │   ├── ActivityBar.tsx        ← Left icon bar (48px fixed)
    │   │   ├── RightActivityBar.tsx   ← Right icon bar
    │   │   ├── LeftPanel.tsx          ← Collapsible + resizable left panel
    │   │   ├── RightPanel.tsx         ← Collapsible + resizable right panel
    │   │   ├── ResizableSplit.tsx     ← Editor/preview draggable split
    │   │   └── StatusBar.tsx          ← Bottom status bar
    │   ├── Backlinks/Backlinks.tsx    ← Backlink panel with snippets
    │   ├── CommandPalette/            ← Ctrl+P modal
    │   ├── Graph/GraphView.tsx        ← D3 force-directed graph
    │   ├── Help/ShortcutHelp.tsx      ← Ctrl+? overlay
    │   ├── Outline/OutlinePanel.tsx   ← Heading navigator
    │   ├── Preview/                   ← Markdown render + Mermaid
    │   ├── QuickSwitcher/             ← Ctrl+O open-by-name
    │   ├── Reading/ReadingView.tsx    ← Full-width reading mode
    │   ├── Recovery/FileRecovery.tsx  ← Snapshot list + restore
    │   ├── Search/Search.tsx          ← Hybrid keyword + semantic search
    │   ├── Settings/
    │   │   ├── Settings.tsx
    │   │   └── AIStatusPanel.tsx      ← Model info, index stats, "X min ago"
    │   ├── Sidebar/
    │   │   ├── FileTree.tsx           ← Recursive tree, context menu, cut/paste
    │   │   ├── NewItemButton.tsx
    │   │   ├── PinnedNotes.tsx
    │   │   ├── RecentNotes.tsx
    │   │   └── IndexingStatus.tsx
    │   ├── Similar/SimilarNotesPanel.tsx ← AI similar notes with score bars
    │   ├── Tags/TagPanel.tsx          ← #tag index, click to filter
    │   ├── UI/Toast.tsx
    │   ├── ErrorBoundary.tsx
    │   └── NotificationCenter.tsx
    ├── hooks/
    │   ├── useVault.ts                ← Vault open, index load/build, SQLite persist
    │   ├── useNote.ts                 ← Note open/save, opens tab
    │   ├── useSimilarNotes.ts         ← Semantic search on note change
    │   └── useResolvedPreview.ts      ← Wiki-links + images + Mermaid for preview
    ├── store/
    │   ├── appStore.ts                ← useAppStore (thin combiner)
    │   ├── notificationStore.ts
    │   └── slices/
    │       ├── vaultSlice.ts          ← vaultPath, fileTree, vectorStore
    │       ├── noteSlice.ts           ← activeNotePath, noteContent, saveStatus
    │       ├── indexSlice.ts          ← backlinkIndex, tagIndex (RAM cache)
    │       ├── uiSlice.ts             ← settings, panel state, cutPath
    │       ├── navigationSlice.ts     ← pinnedNotes, recentNotes, openTabs, activeTag
    │       └── embeddingSlice.ts      ← embeddingStatus, indexingProgress, similarNotes
    ├── lib/
    │   ├── tauri.ts                   ← All typed invoke wrappers (30+ commands)
    │   ├── events.ts                  ← TypedEventBus + EventMap
    │   ├── plugins.ts                 ← PluginRegistry, PluginContext
    │   ├── commands.ts                ← CommandRegistry
    │   ├── wikilinks.ts               ← [[link]] parsing, flattenTree, pathToTitle
    │   ├── backlinks.ts               ← Backlink index builder (TS side)
    │   ├── tags.ts                    ← Tag index builder + extractTags
    │   ├── persistence.ts             ← tauri-plugin-store: settings, layout, pinned...
    │   ├── vaultSetup.ts              ← openVectorStore, startIndexingWhenReady
    │   ├── embeddingWorkerManager.ts  ← Web Worker lifecycle + model loading
    │   ├── vectorStore.ts             ← VectorStore class (delegates to Rust SQLite)
    │   ├── indexingPipeline.ts        ← Full vault + incremental indexing
    │   ├── similaritySearch.ts        ← Cosine similarity, searchByNote, searchByQuery
    │   ├── textChunker.ts             ← Heading-aware markdown chunking
    │   ├── textPreprocessor.ts        ← Clean markdown for embedding
    │   ├── contentHash.ts             ← MD5 hash for change detection
    │   ├── dailyNotes.ts / randomNote.ts / templates.ts
    │   ├── slashCommands.ts + slashCommandExtension.ts
    │   ├── wikilinkCompletion.ts + wikilinkEditorExtension.ts
    │   ├── outline.ts / graph.ts / frontmatter.ts / fuzzy.ts
    │   ├── embed.ts                   ← ![[Note]] embed resolution
    │   ├── exportHtml.ts / exportPdf.ts / backup.ts
    │   └── mermaid.ts / mermaidProcessor.ts
    ├── workers/
    │   └── embeddingWorker.ts         ← ONNX model inference (Web Worker)
    └── types/
        └── index.ts                   ← Shared TypeScript types
```

---

## Data Flow

```
User action
    │
    ▼
React component
    │
    ├── lib/tauri.ts  (typed invoke wrapper)
    │       │
    │       ▼
    │   Tauri command (Rust)
    │       │
    │       ├── File system (.md files)
    │       └── SQLite (.vault-index/index.db)
    │
    └── Zustand store (useAppStore)
            │
            └── eventBus (cross-component events)
```

**Source of truth:** `.md` files on disk. SQLite is a derived index — can always be rebuilt.

---

## SQLite Index (`vector_store.rs`)

Single connection, WAL mode, `locking_mode=EXCLUSIVE`.
Stored at `<vault>/.vault-index/index.db` — moves with the vault.

### Schema

```sql
-- Vector chunks (384-dim f32 LE, base64-encoded BLOB)
vectors (id PK, note_path, chunk_index, content_hash, vector BLOB,
         title, snippet, heading_path, start_offset, end_offset, indexed_at)

-- Backlink index
backlinks (source_path, target_path, snippet)

-- Tag index
tags (tag, note_path)

-- Vault metadata
vault_meta (key TEXT PK, value TEXT)
-- Keys: vaultPath, modelVersion, totalNotes, lastFullIndex
```

### Rust Commands (12 vector + 4 backlink/tag)

| Command | Purpose |
|---------|---------|
| `vector_store_open` | Open/create SQLite DB for vault |
| `vector_store_close` | Close + WAL checkpoint |
| `vector_upsert_chunks` | Batch insert (single transaction) |
| `vector_delete_chunks_for_note` | Delete note's chunks |
| `vector_get_chunks_for_note` | Read note's chunks |
| `vector_get_all_chunks` | Read all chunks (for similarity search) |
| `vector_clear_all` | Wipe vectors + meta |
| `vector_count` | Total chunk count |
| `vector_find_stale_notes` | Hash mismatch OR not indexed → needs re-embed |
| `vector_find_deleted_notes` | In DB but not in vault → remove |
| `vector_get_meta` / `vector_set_meta` | Vault metadata |
| `backlinks_set_for_note` | Replace note's outgoing backlinks |
| `backlinks_get_all` | Load full backlink index |
| `tags_set_for_note` | Replace note's tags |
| `tags_get_all` | Load full tag index |

---

## Vault Identity

```
<vault>/.vault-id  ← UUID (generated on first open, Rust)
```

`VectorStore(vaultId, vaultPath)` — DB name derived from UUID, not path.
Vault moved/renamed → UUID unchanged → index preserved.

---

## State Management

```typescript
interface AppStore {
  // VaultSlice
  vaultPath: string | null
  fileTree: FileNode[]
  vectorStore: VectorStore | null   // delegates to Rust SQLite

  // NoteSlice
  activeNotePath: string | null
  noteContent: string
  saveStatus: 'saved' | 'saving' | 'error'
  readingMode: boolean

  // IndexSlice (RAM cache — loaded from SQLite on vault open)
  backlinkIndex: Record<string, BacklinkEntry[]>
  tagIndex: Record<string, string[]>

  // UiSlice
  settings: AppSettings             // fontSize, theme
  leftPanelOpen/Id, rightPanelOpen/Id
  cutPath: string | null

  // NavigationSlice
  pinnedNotes: string[]
  recentNotes: string[]
  openTabs: string[]                // tab bar state
  activeTag: string | null

  // EmbeddingSlice
  embeddingStatus: 'idle'|'loading'|'ready'|'error'
  indexingProgress: { phase, current, total, message }
  similarNotes: SimilarityResult[]
}
```

---

## Tauri Commands — Full List

### Vault & Notes
| Command | Input | Output |
|---------|-------|--------|
| `open_vault` | `path` | `FileNode[]` |
| `search_vault` | `vault_path, query` | `SearchResult[]` (parallel, memchr) |
| `propagate_rename` | `vault_path, old_name, new_name` | `string[]` |
| `get_or_create_vault_id` | `vault_path` | `string` (UUID) |
| `read_note` | `path` | `string` |
| `write_note` | `path, content` | `void` |
| `create_note` | `path` | `void` |
| `rename_note` | `old_path, new_path` | `void` |
| `delete_note` | `path` | `void` |
| `create_folder` | `path` | `void` |
| `rename_folder` | `old_path, new_path` | `void` |
| `delete_folder` | `path` | `void` |
| `move_folder` | `old_path, new_path` | `void` |
| `read_image` | `path` | `string` (base64) |
| `export_pdf` | `html, path` | `void` |
| `backup_vault` | `vault_path, output_path` | `void` |
| `save_snapshot` | `vault_path, note_path, content` | `void` |
| `list_snapshots` | `vault_path, note_path` | `Snapshot[]` |
| `read_snapshot` | `path` | `string` |
| `delete_snapshot` | `path` | `void` |

### Vector Store (SQLite)
See table in **SQLite Index** section above.

---

## Semantic Search Architecture

```
Vault open / note save
    │
    ▼
indexingPipeline.ts
    ├── flattenTree() → all .md paths
    ├── vector_find_stale_notes() → hash mismatch or not indexed
    ├── vector_find_deleted_notes() → remove orphans
    └── For each stale note:
            │
            ▼
        textChunker → heading-aware chunks
            │
            ▼
        embeddingWorker (Web Worker)
            │
            ▼
        bge-micro-v2 ONNX → 384-dim float vector
            │
            ▼
        vector_upsert_chunks() → SQLite BLOB

─────────────────────────────────────────────────────

User opens note
    │
    ▼
useSimilarNotes hook
    │
    ▼
vector_get_all_chunks() → RAM
    │
    ▼
cosineSimilarity(noteVec, each) → top-8 results
    │
    ▼
SimilarNotesPanel — score bars, snippets, heading path
```

---

## Index Lifecycle

```
Vault open
    │
    ├── vector_store_open(vaultPath) → SQLite connection
    │
    ├── backlinks_get_all() → RAM backlinkIndex  (fast, no rebuild)
    ├── tags_get_all()      → RAM tagIndex       (fast, no rebuild)
    │   └── If empty → buildBacklinkIndex() + buildTagIndex() → persist to SQLite
    │
    └── startIndexingWhenReady() → indexVault() when model ready

Note save (autosave 1000ms debounce)
    │
    ├── writeNote() → .md file
    ├── saveSnapshot() → .vault-recovery/
    ├── updateBacklinkIndex() → RAM + backlinks_set_for_note() → SQLite
    ├── updateTagIndex()      → RAM + tags_set_for_note()      → SQLite
    └── indexSingleNote()     → re-embed if content changed    → SQLite
```

---

## Layout System

```
┌─────────────────────────────────────────────────────────┐
│  ActivityBar (48px)                                      │
│  ┌──────────────┬──────────────────────┬──────────────┐ │
│  │ Left Panel   │ Editor + Preview     │ Right Panel  │ │
│  │ (resizable)  │ (ResizableSplit)     │ (resizable)  │ │
│  │ 160–400px    │ flex-1               │ 200–500px    │ │
│  └──────────────┴──────────────────────┴──────────────┘ │
│  RightActivityBar (48px)                                 │
│  StatusBar                                               │
└─────────────────────────────────────────────────────────┘
```

- Panel widths persisted via `tauri-plugin-store` (`layoutState`)
- Drag sash on panel edge to resize
- `ResizableSplit` handles editor/preview split (20–80%)

---

## Tab System

`navigationSlice.openTabs: string[]` — ordered list of open note paths.

- Note opened → `openTab(path)` adds to tabs
- Tab clicked → `openNote(path)` switches active note
- Tab × → `closeTab(path)` removes, switches to last tab or clears
- Rendered in `TabBar.tsx` above the editor toolbar

---

## Autosave Strategy

1. **1000ms debounce** after last keystroke
2. `writeNote()` → disk
3. `saveSnapshot()` → `.vault-recovery/` (fire-and-forget)
4. `updateBacklinkIndex()` + `backlinks_set_for_note()` → RAM + SQLite
5. `updateTagIndex()` + `tags_set_for_note()` → RAM + SQLite
6. `indexSingleNote()` → re-embed if hash changed → SQLite (if model ready)

---

## Desktop Batteries

Applied from `tauri-ui` reference:

| Battery | Implementation |
|---------|---------------|
| Flash prevention | `tauri.conf.json: visible=false` + `on_page_load` show |
| Selection behavior | `body { user-select: none }`, inputs/editor exempt |
| Overscroll fix | `body { overflow: hidden }`, `#root { height: 100% }` |
| External link guard | `Preview.tsx` click handler → `openUrl()` for http/mailto |

---

## Key Constraints

- TypeScript strict mode — no `any`
- All file I/O through Tauri commands — never browser File APIs
- All paths forward-slash internally — `normalizeVaultPath()` on entry
- File operations retry 3× with 50ms delay — Windows file lock handling
- Tailwind CSS v4 — no `tailwind.config.*`
- Heavy libs (D3, Mermaid, CodeMirror, transformers) in separate Vite chunks
- ESLint enforced — `console.log` forbidden, only `console.warn/error`

---

## Cross-Platform Notes

| | Windows | macOS | Linux |
|--|---------|-------|-------|
| Path separator | `\` | `/` | `/` |
| Shortcut | `Ctrl` | `Cmd` | `Ctrl` |
| SQLite WAL | `-shm` skipped (EXCLUSIVE) | normal | normal |

---

## Known Limitations

- No cloud sync
- No real-time collaboration
- No mobile support
- Plugin system in-process only (no external `.js` files)
- Graph layout basic force-directed (not optimized for large vaults)
- `getAllChunks()` loads all vectors into RAM — future: Rust-side cosine search
- Semantic search brute-force cosine (fine up to ~5000 notes)
