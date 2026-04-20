import { useAppStore } from '../store/appStore'
import { selectVaultFolder, openVault, readNote, normalizeVaultPath, getOrCreateVaultId } from '../lib/tauri'
import { buildBacklinkIndex } from '../lib/backlinks'
import { buildTagIndex } from '../lib/tags'
import { flattenTree } from '../lib/wikilinks'
import { saveLastVaultPath, saveRecentNotes } from '../lib/persistence'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { eventBus } from '../lib/events'
import { openVectorStore, startIndexingWhenReady } from '../lib/vaultSetup'
import type { IndexingProgress } from '../lib/indexingPipeline'
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

  async function openVaultDialog() {
    const path = await selectVaultFolder()
    if (!path) return

    const normalized = normalizeVaultPath(path)

    // Same vault — no need to re-open or re-index
    if (normalized === vaultPath) return

    const [tree, vaultId] = await Promise.all([
      openVault(normalized),
      getOrCreateVaultId(normalized),
    ])
    setVault(normalized, tree)

    // Reset vault-scoped state
    setRecentNotes([])
    await saveRecentNotes([])
    await saveLastVaultPath(normalized)

    const appWindow = getCurrentWindow()
    appWindow.setTitle(`${normalized.split(/[\\/]/).pop() ?? normalized} — Vault`)

    // Rebuild search indexes
    const [backlinkIdx, tagIdx] = await Promise.all([
      buildBacklinkIndex(tree, readNote),
      buildTagIndex(flattenTree(tree), readNote),
    ])
    setBacklinkIndex(backlinkIdx)
    setTagIndex(tagIdx)

    eventBus.emit('vault:opened', { path: normalized })

    // If same vault identity (moved/renamed), reuse existing store
    const currentStore = useAppStore.getState().vectorStore
    if (currentStore && currentStore.vaultId === vaultId) {
      await currentStore.setVaultPathInMeta(normalized)
      return
    }

    // New vault — open fresh store and start indexing
    const store = await openVectorStore(vaultId, normalized)
    setVectorStore(store)
    await store.setVaultPathInMeta(normalized)

    cancelIndexingRef.current?.()
    cancelIndexingRef.current = startIndexingWhenReady(
      store,
      () => useAppStore.getState().fileTree,
      (p) => setIndexingProgress(progressToStore(p))
    )
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
