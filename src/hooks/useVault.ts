import { useAppStore } from '../store/appStore'
import { selectVaultFolder, openVault, readNote, normalizeVaultPath } from '../lib/tauri'
import { buildBacklinkIndex } from '../lib/backlinks'
import { buildTagIndex } from '../lib/tags'
import { flattenTree } from '../lib/wikilinks'
import { saveLastVaultPath } from '../lib/persistence'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { eventBus } from '../lib/events'

export interface UseVaultReturn {
  vaultPath: string | null
  fileTree: import('../types').FileNode[]
  vaultName: string
  openVaultDialog: () => Promise<void>
  reloadTree: () => Promise<void>
  rebuildIndexes: () => Promise<void>
}

export function useVault(): UseVaultReturn {
  const {
    vaultPath,
    fileTree,
    setVault,
    refreshFileTree,
    setBacklinkIndex,
    setTagIndex,
  } = useAppStore()

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
    const tree = await openVault(normalized)
    setVault(normalized, tree)
    await saveLastVaultPath(normalized)
    const appWindow = getCurrentWindow()
    const name = normalized.split(/[\\/]/).pop() ?? normalized
    appWindow.setTitle(`${name} — Vault`)
    eventBus.emit('vault:opened', { path: normalized })
    await rebuildIndexes()
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
