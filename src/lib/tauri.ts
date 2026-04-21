import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { FileNode } from '../types'

export interface SearchResult {
  path: string
  name: string
  snippet: string
  matchType: 'name' | 'content'
}

/** Normalize OS separators → forward-slash throughout the tree */
function normalizeNode(node: FileNode): FileNode {
  return {
    ...node,
    path: node.path.replace(/\\/g, '/'),
    children: node.children?.map(normalizeNode),
  }
}

/** Normalize vault path from dialog (Windows uses \, we use /) */
export function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, '/')
}

export async function selectVaultFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: 'Select Vault Folder',
  })
  return selected as string | null
}

export async function openVault(path: string): Promise<FileNode[]> {
  const tree = await invoke<FileNode[]>('open_vault', { path })
  return tree.map(normalizeNode)
}

/** Get or create a stable UUID for the vault (stored in <vault>/.vault-id) */
export async function getOrCreateVaultId(vaultPath: string): Promise<string> {
  return invoke<string>('get_or_create_vault_id', { vault_path: vaultPath })
}

export async function readNote(path: string): Promise<string> {
  return invoke<string>('read_note', { path })
}

export async function writeNote(path: string, content: string): Promise<void> {
  return invoke<void>('write_note', { path, content })
}

export async function createNote(path: string): Promise<void> {
  return invoke<void>('create_note', { path })
}

export async function renameNote(oldPath: string, newPath: string): Promise<void> {
  return invoke<void>('rename_note', { oldPath, newPath })
}

export async function deleteNote(path: string): Promise<void> {
  return invoke<void>('delete_note', { path })
}

export async function createFolder(path: string): Promise<void> {
  return invoke<void>('create_folder', { path })
}

export async function renameFolder(oldPath: string, newPath: string): Promise<void> {
  return invoke<void>('rename_folder', { oldPath, newPath })
}

export async function deleteFolder(path: string): Promise<void> {
  return invoke<void>('delete_folder', { path })
}

export async function moveFolder(oldPath: string, newPath: string): Promise<void> {
  return invoke<void>('move_folder', { oldPath, newPath })
}

export async function searchVault(vaultPath: string, query: string): Promise<SearchResult[]> {
  return invoke<SearchResult[]>('search_vault', { vaultPath, query })
}

export async function readImage(path: string): Promise<string> {
  return invoke<string>('read_image', { path })
}

export async function backupVault(vaultPath: string, outputPath: string): Promise<void> {
  return invoke<void>('backup_vault', { vaultPath, outputPath })
}

export async function propagateRename(
  vaultPath: string,
  oldName: string,
  newName: string
): Promise<string[]> {
  return invoke<string[]>('propagate_rename', { vaultPath, oldName, newName })
}

// ---- File Recovery ----

export interface Snapshot {
  path: string
  noteName: string
  timestamp: string
  size: number
}

export async function saveSnapshot(
  vaultPath: string,
  notePath: string,
  content: string
): Promise<void> {
  return invoke<void>('save_snapshot', { vaultPath, notePath, content })
}

export async function listSnapshots(
  vaultPath: string,
  notePath: string
): Promise<Snapshot[]> {
  return invoke<Snapshot[]>('list_snapshots', { vaultPath, notePath })
}

export async function readSnapshot(path: string): Promise<string> {
  return invoke<string>('read_snapshot', { path })
}

export async function deleteSnapshot(path: string): Promise<void> {
  return invoke<void>('delete_snapshot', { path })
}

// ---- Vector Store (SQLite) ----

/** Wire format: vector is base64-encoded f32 LE bytes (384 floats → 1536 bytes) */
export interface ChunkRowWire {
  id: string
  notePath: string
  chunkIndex: number
  contentHash: string
  vector: string        // base64
  title: string
  snippet: string
  headingPath: string
  startOffset: number
  endOffset: number
  indexedAt: number
}

export interface NoteHashWire {
  path: string
  contentHash: string
}

export interface VaultMetaRowWire {
  vaultPath: string
  modelVersion: string
  totalNotes: number
  lastFullIndex: number
}

export async function vectorStoreOpen(vaultPath: string): Promise<void> {
  return invoke<void>('vector_store_open', { vaultPath })
}

export async function vectorStoreClose(): Promise<void> {
  return invoke<void>('vector_store_close')
}

export async function vectorUpsertChunks(chunks: ChunkRowWire[]): Promise<void> {
  return invoke<void>('vector_upsert_chunks', { chunks })
}

export async function vectorDeleteChunksForNote(notePath: string): Promise<void> {
  return invoke<void>('vector_delete_chunks_for_note', { notePath })
}

export async function vectorGetChunksForNote(notePath: string): Promise<ChunkRowWire[]> {
  return invoke<ChunkRowWire[]>('vector_get_chunks_for_note', { notePath })
}

export async function vectorGetAllChunks(): Promise<ChunkRowWire[]> {
  return invoke<ChunkRowWire[]>('vector_get_all_chunks')
}

export async function vectorClearAll(): Promise<void> {
  return invoke<void>('vector_clear_all')
}

export async function vectorCount(): Promise<number> {
  return invoke<number>('vector_count')
}

export async function vectorFindStaleNotes(currentNotes: NoteHashWire[]): Promise<string[]> {
  return invoke<string[]>('vector_find_stale_notes', { currentNotes })
}

export async function vectorFindDeletedNotes(currentPaths: string[]): Promise<string[]> {
  return invoke<string[]>('vector_find_deleted_notes', { currentPaths })
}

export async function vectorGetMeta(): Promise<VaultMetaRowWire | null> {
  return invoke<VaultMetaRowWire | null>('vector_get_meta')
}

export async function vectorSetMeta(meta: VaultMetaRowWire): Promise<void> {
  return invoke<void>('vector_set_meta', { meta })
}

// ---- Backlink + Tag Index Persist ----

export interface BacklinkRowWire {
  sourcePath: string
  targetPath: string
  snippet: string
}

export interface TagRowWire {
  tag: string
  notePath: string
}

export async function backlinksSetForNote(
  sourcePath: string,
  entries: BacklinkRowWire[]
): Promise<void> {
  return invoke<void>('backlinks_set_for_note', { sourcePath, entries })
}

export async function backlinksGetAll(): Promise<BacklinkRowWire[]> {
  return invoke<BacklinkRowWire[]>('backlinks_get_all')
}

export async function tagsSetForNote(
  notePath: string,
  tags: string[]
): Promise<void> {
  return invoke<void>('tags_set_for_note', { notePath, tags })
}

export async function tagsGetAll(): Promise<TagRowWire[]> {
  return invoke<TagRowWire[]>('tags_get_all')
}

// ---- Vector Search (Rust-side cosine similarity) ----

export interface VectorSearchResultWire {
  notePath: string
  title: string
  snippet: string
  score: number
  headingPath: string
}

/** Encode number[] (384 floats) → base64 string for Rust. */
function vectorToBase64Search(v: number[]): string {
  const buf = new ArrayBuffer(v.length * 4)
  const view = new DataView(buf)
  for (let i = 0; i < v.length; i++) view.setFloat32(i * 4, v[i], true)
  const bytes = new Uint8Array(buf)
  // Batched to avoid stack overflow on large arrays
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 8192)))
  }
  return btoa(chunks.join(''))
}

export async function vectorSearch(
  queryVector: number[],
  topK: number,
  minScore: number,
  excludePath: string | null,
): Promise<VectorSearchResultWire[]> {
  return invoke<VectorSearchResultWire[]>('vector_search', {
    queryVector: vectorToBase64Search(queryVector),
    topK,
    minScore,
    excludePath,
  })
}
