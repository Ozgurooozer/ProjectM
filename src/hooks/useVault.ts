import { useAppStore } from '../store/appStore'
import { selectVaultFolder, openVault, readNote, normalizeVaultPath, getOrCreateVaultId, backlinksGetAll, tagsGetAll, backlinksSetForNote, tagsSetForNote } from '../lib/tauri'
import { buildBacklinkIndex } from '../lib/backlinks'
import { buildTagIndex } from '../lib/tags'
import { flattenTree } from '../lib/wikilinks'
import { saveLastVaultPath, saveRecentNotes } from '../lib/persistence'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { eventBus } from '../lib/events'
import { openVectorStore, startIndexingWhenReady } from '../lib/vaultSetup'
import type { IndexingProgress } from '../lib/indexingPipeline'
import type { BacklinkEntry } from '../types'
import { useRef } from 'react'

export interface UseVaultReturn {
  vaultPath: string | null
  fileTree: import('../types').FileNode[]
  vaultName: string
  openVaultDialog: () => Promise<void>
  reloadTree: () => Promise<void>
  rebuildIndexes: () => Promise<void>
}

function progressToStore(p: IndexingProgress) {
  return {
    phase: p.phase as 'idle' | 'checking' | 'embedding' | 'done' | 'error',
    current: p.current,
    total: p.total,
    message: p.message,
  }
}

export function useVault(): UseVaultReturn {
  const {
    vaultPath,
    fileTree,
    setVault,
    refreshFileTree,
    setBacklinkIndex,
    setTagIndex,
    setVectorStore,
    setIndexingProgress,
    setRecentNotes,
  } = useAppStore()

  const cancelIndexingRef = useRef<(() => void) | null>(null)

  const vaultName = vaultPath ? (vaultPath.split(/[\\/]/).pop() ?? '') : ''

  async function rebuildIndexes() {
    if (!vaultPath || fileTree.length === 0) return
    const [backlinkIdx, tagIdx] = await Promise.all([
      buildBacklinkIndex(fileTree, readNote),
      buildTagIndex(flattenTree(fileTree), readNote),
    ])
    setBacklinkIndex(backlinkIdx)
    setTagIndex(tagIdx)
    eventBus.emit('index:backlinks-updated', { index: backlinkIdx })
    eventBus.emit('index:tags-updated', { index: tagIdx })
  }

  /** Load backlink + tag indexes from SQLite. Returns false if DB is empty (needs rebuild). */
  async function loadIndexesFromSQLite(): Promise<boolean> {
    try {
      const [blRows, tagRows] = await Promise.all([backlinksGetAll(), tagsGetAll()])
      if (blRows.length === 0 && tagRows.length === 0) return false

      const backlinkIdx: Record<string, BacklinkEntry[]> = {}
      for (const row of blRows) {
        if (!backlinkIdx[row.targetPath]) backlinkIdx[row.targetPath] = []
        backlinkIdx[row.targetPath].push({ sourcePath: row.sourcePath, snippet: row.snippet })
      }

      const tagIdx: Record<string, string[]> = {}
      for (const row of tagRows) {
        if (!tagIdx[row.tag]) tagIdx[row.tag] = []
        tagIdx[row.tag].push(row.notePath)
      }

      setBacklinkIndex(backlinkIdx)
      setTagIndex(tagIdx)
      return true
    } catch {
      return false
    }
  }

  /** Persist backlink + tag indexes to SQLite (fire-and-forget). */
  async function persistIndexesToSQLite(
    backlinkIdx: Record<string, BacklinkEntry[]>,
    tagIdx: Record<string, string[]>,
    allPaths: string[]
  ): Promise<void> {
    // Persist backlinks: group by source_path
    const bySource = new Map<string, Array<{ targetPath: string; snippet: string }>>()
    for (const [targetPath, entries] of Object.entries(backlinkIdx)) {
      for (const entry of entries) {
        if (!bySource.has(entry.sourcePath)) bySource.set(entry.sourcePath, [])
        bySource.get(entry.sourcePath)!.push({ targetPath, snippet: entry.snippet })
      }
    }
    for (const [sourcePath, entries] of bySource) {
      await backlinksSetForNote(
        sourcePath,
        entries.map((e) => ({ sourcePath, targetPath: e.targetPath, snippet: e.snippet }))
      ).catch(console.warn)
    }

    // Persist tags: group by note_path
    const byNote = new Map<string, string[]>()
    for (const [tag, paths] of Object.entries(tagIdx)) {
      for (const notePath of paths) {
        if (!byNote.has(notePath)) byNote.set(notePath, [])
        byNote.get(notePath)!.push(tag)
      }
    }
    for (const notePath of allPaths) {
      const tags = byNote.get(notePath) ?? []
      await tagsSetForNote(notePath, tags).catch(console.warn)
    }
  }

  async function openVaultDialog() {
    const path = await selectVaultFolder()
    if (!path) return

    const normalized = normalizeVaultPath(path)

    // Same path — no need to do anything
    if (normalized === vaultPath) return

    // Open vault file tree + get vault identity in parallel
    let tree: import('../types').FileNode[]
    let vaultId: string
    try {
      ;[tree, vaultId] = await Promise.all([
        openVault(normalized),
        getOrCreateVaultId(normalized),
      ])
    } catch (err) {
      console.error('[useVault] openVault failed:', err)
      return
    }

    // Update core state — file tree is now available
    setVault(normalized, tree)
    setRecentNotes([])
    await saveRecentNotes([])
    await saveLastVaultPath(normalized)
    getCurrentWindow().setTitle(`${normalized.split(/[\\/]/).pop() ?? normalized} — Vault`)

    eventBus.emit('vault:opened', { path: normalized })

    // Cancel any running indexing from previous vault
    cancelIndexingRef.current?.()
    cancelIndexingRef.current = null

    // SQLite + indexing — errors here must NOT block the file tree
    try {
      // If same vault identity (moved/renamed path), reuse existing store
      const currentStore = useAppStore.getState().vectorStore
      if (currentStore && currentStore.vaultId === vaultId) {
        await currentStore.setVaultPathInMeta(normalized)
        const loadedFromDB = await loadIndexesFromSQLite()
        if (!loadedFromDB) {
          const [blIdx, tIdx] = await Promise.all([
            buildBacklinkIndex(tree, readNote),
            buildTagIndex(flattenTree(tree), readNote),
          ])
          setBacklinkIndex(blIdx)
          setTagIndex(tIdx)
          void persistIndexesToSQLite(blIdx, tIdx, flattenTree(tree))
        }
        cancelIndexingRef.current = startIndexingWhenReady(
          currentStore,
          () => useAppStore.getState().fileTree,
          (p) => setIndexingProgress(progressToStore(p))
        )
        return
      }

      // New vault — open fresh SQLite store
      const store = await openVectorStore(vaultId, normalized)
      setVectorStore(store)
      await store.setVaultPathInMeta(normalized)

      const loadedFromDB = await loadIndexesFromSQLite()
      if (!loadedFromDB) {
        const [blIdx, tIdx] = await Promise.all([
          buildBacklinkIndex(tree, readNote),
          buildTagIndex(flattenTree(tree), readNote),
        ])
        setBacklinkIndex(blIdx)
        setTagIndex(tIdx)
        void persistIndexesToSQLite(blIdx, tIdx, flattenTree(tree))
      }

      cancelIndexingRef.current = startIndexingWhenReady(
        store,
        () => useAppStore.getState().fileTree,
        (p) => setIndexingProgress(progressToStore(p))
      )
    } catch (err) {
      console.error('[useVault] SQLite/indexing setup failed (file tree still shown):', err)
    }
  }

  async function reloadTree() {
    if (!vaultPath) return
    const tree = await openVault(vaultPath)
    refreshFileTree(tree)
  }

  return {
    vaultPath,
    fileTree,
    vaultName,
    openVaultDialog,
    reloadTree,
    rebuildIndexes,
  }
}
