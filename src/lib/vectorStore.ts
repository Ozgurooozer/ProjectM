// src/lib/vectorStore.ts
//
// VectorStore — same public interface as the IndexedDB version.
// Internally delegates to Rust SQLite via invoke() wrappers.
//
// vector field stays number[] (384 floats) externally;
// base64 conversion happens here, invisibly to callers.

import {
  type ChunkRowWire,
  type NoteHashWire,
  type VaultMetaRowWire,
  vectorStoreOpen,
  vectorStoreClose,
  vectorUpsertChunks,
  vectorDeleteChunksForNote,
  vectorGetChunksForNote,
  vectorGetAllChunks,
  vectorClearAll,
  vectorCount,
  vectorFindStaleNotes,
  vectorFindDeletedNotes,
  vectorGetMeta,
  vectorSetMeta,
} from './tauri'

// ── Public domain types (unchanged interface) ─────────────────────────────────

export interface ChunkVector {
  id: string
  notePath: string
  chunkIndex: number
  contentHash: string
  vector: number[]   // 384 floats — always number[] externally
  title: string
  snippet: string
  headingPath: string
  startOffset: number
  endOffset: number
  indexedAt: number
}

/** Legacy — kept for backward compat */
export interface NoteVector {
  path: string
  contentHash: string
  vector: number[]
  title: string
  snippet: string
  indexedAt: number
  noteLength: number
}

export interface VaultMeta {
  id: 'meta'
  vaultPath: string
  modelVersion: string
  totalNotes: number
  lastFullIndex: number
}

// ── Vector serialization (private) ───────────────────────────────────────────

function vectorToBase64(v: number[]): string {
  const buf = new ArrayBuffer(v.length * 4)
  const view = new DataView(buf)
  v.forEach((f, i) => view.setFloat32(i * 4, f, /* littleEndian= */ true))
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToVector(b64: string): number[] {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const view = new DataView(bytes.buffer)
  return Array.from(
    { length: bytes.length / 4 },
    (_, i) => view.getFloat32(i * 4, /* littleEndian= */ true),
  )
}

// ── Domain ↔ wire converters ──────────────────────────────────────────────────

function chunkToWire(chunk: ChunkVector): ChunkRowWire {
  return {
    id: chunk.id,
    notePath: chunk.notePath,
    chunkIndex: chunk.chunkIndex,
    contentHash: chunk.contentHash,
    vector: vectorToBase64(chunk.vector),
    title: chunk.title,
    snippet: chunk.snippet,
    headingPath: chunk.headingPath,
    startOffset: chunk.startOffset,
    endOffset: chunk.endOffset,
    indexedAt: chunk.indexedAt,
  }
}

function wireToChunk(wire: ChunkRowWire): ChunkVector {
  return {
    id: wire.id,
    notePath: wire.notePath,
    chunkIndex: wire.chunkIndex,
    contentHash: wire.contentHash,
    vector: base64ToVector(wire.vector),
    title: wire.title,
    snippet: wire.snippet,
    headingPath: wire.headingPath,
    startOffset: wire.startOffset,
    endOffset: wire.endOffset,
    indexedAt: wire.indexedAt,
  }
}

function metaToWire(meta: Omit<VaultMeta, 'id'>): VaultMetaRowWire {
  return {
    vaultPath: meta.vaultPath,
    modelVersion: meta.modelVersion,
    totalNotes: meta.totalNotes,
    lastFullIndex: meta.lastFullIndex,
  }
}

function wireToMeta(wire: VaultMetaRowWire): VaultMeta {
  return {
    id: 'meta',
    vaultPath: wire.vaultPath,
    modelVersion: wire.modelVersion,
    totalNotes: wire.totalNotes,
    lastFullIndex: wire.lastFullIndex,
  }
}

// ── VectorStore class ─────────────────────────────────────────────────────────

export class VectorStore {
  public readonly vaultId: string
  private readonly vaultPath: string

  constructor(vaultId: string, vaultPath: string) {
    this.vaultId = vaultId
    this.vaultPath = vaultPath
  }

  // ── lifecycle ───────────────────────────────────────────────────────────────

  async open(): Promise<void> {
    await vectorStoreOpen(this.vaultPath)
  }

  close(): void {
    // Fire-and-forget — triggers WAL checkpoint on the Rust side.
    vectorStoreClose().catch((err: unknown) => {
      console.warn('[VectorStore] close error:', err)
    })
  }

  // ── writes ──────────────────────────────────────────────────────────────────

  async upsertChunks(entries: ChunkVector[]): Promise<void> {
    await vectorUpsertChunks(entries.map(chunkToWire))
  }

  async deleteChunksForNote(notePath: string): Promise<void> {
    await vectorDeleteChunksForNote(notePath)
  }

  async clearAll(): Promise<void> {
    await vectorClearAll()
  }

  // ── reads ───────────────────────────────────────────────────────────────────

  async getChunksForNote(notePath: string): Promise<ChunkVector[]> {
    const rows = await vectorGetChunksForNote(notePath)
    return rows.map(wireToChunk)
  }

  async getAllChunks(): Promise<ChunkVector[]> {
    const rows = await vectorGetAllChunks()
    return rows.map(wireToChunk)
  }

  async count(): Promise<number> {
    return vectorCount()
  }

  // ── change detection ────────────────────────────────────────────────────────

  async findStaleNotes(
    currentNotes: Array<{ path: string; contentHash: string }>
  ): Promise<string[]> {
    const wire: NoteHashWire[] = currentNotes.map((n) => ({
      path: n.path,
      contentHash: n.contentHash,
    }))
    return vectorFindStaleNotes(wire)
  }

  async findDeletedNotes(currentPaths: Set<string>): Promise<string[]> {
    return vectorFindDeletedNotes(Array.from(currentPaths))
  }

  // ── metadata ─────────────────────────────────────────────────────────────────

  async getMeta(): Promise<VaultMeta | undefined> {
    const wire = await vectorGetMeta()
    return wire != null ? wireToMeta(wire) : undefined
  }

  async setMeta(meta: Omit<VaultMeta, 'id'>): Promise<void> {
    await vectorSetMeta(metaToWire(meta))
  }

  async setVaultPathInMeta(vaultPath: string): Promise<void> {
    const existing = await this.getMeta()
    await this.setMeta({
      vaultPath,
      modelVersion: existing?.modelVersion ?? 'bge-micro-v2',
      totalNotes: existing?.totalNotes ?? 0,
      lastFullIndex: existing?.lastFullIndex ?? 0,
    })
  }

  // ── Legacy compatibility ─────────────────────────────────────────────────────

  async getVector(notePath: string): Promise<NoteVector | undefined> {
    const chunks = await this.getChunksForNote(notePath)
    if (chunks.length === 0) return undefined
    const c = chunks[0]
    return {
      path: c.notePath,
      contentHash: c.contentHash,
      vector: c.vector,
      title: c.title,
      snippet: c.snippet,
      indexedAt: c.indexedAt,
      noteLength: c.endOffset,
    }
  }

  async getAllVectors(): Promise<NoteVector[]> {
    const allChunks = await this.getAllChunks()
    const byNote = new Map<string, ChunkVector>()
    for (const chunk of allChunks) {
      if (!byNote.has(chunk.notePath)) byNote.set(chunk.notePath, chunk)
    }
    return Array.from(byNote.values()).map((c) => ({
      path: c.notePath,
      contentHash: c.contentHash,
      vector: c.vector,
      title: c.title,
      snippet: c.snippet,
      indexedAt: c.indexedAt,
      noteLength: c.endOffset,
    }))
  }
}
