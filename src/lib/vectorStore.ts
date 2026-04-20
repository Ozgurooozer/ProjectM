import { openDB, type IDBPDatabase } from 'idb'

// ── Types ─────────────────────────────────────────────────────────────────────

/** One vector per chunk (not per note) */
export interface ChunkVector {
  /** Composite key: "notePath::chunkIndex" */
  id: string
  notePath: string
  chunkIndex: number
  contentHash: string   // hash of the full note (for stale detection)
  vector: number[]
  title: string         // note title
  snippet: string       // first 200 chars of note
  headingPath: string   // e.g. "Installation > Requirements"
  startOffset: number
  endOffset: number
  indexedAt: number
}

/** Legacy — kept for backward compat, not used for new indexing */
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

// ── DB setup ──────────────────────────────────────────────────────────────────

const DB_VERSION = 2   // bumped from 1 to trigger upgrade
const STORE_CHUNKS = 'note_chunks'
const STORE_META = 'vault_meta'

function vaultIdToDbName(vaultId: string): string {
  const safe = vaultId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return `vault_index_${safe}`
}

async function openVaultDB(vaultId: string): Promise<IDBPDatabase> {
  const dbName = vaultIdToDbName(vaultId)

  return openDB(dbName, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Remove old stores from v1
      if (oldVersion < 2) {
        if (db.objectStoreNames.contains('note_vectors')) {
          db.deleteObjectStore('note_vectors')
        }
      }

      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        const store = db.createObjectStore(STORE_CHUNKS, { keyPath: 'id' })
        // Index by notePath for efficient per-note operations
        store.createIndex('by_notePath', 'notePath', { unique: false })
      }

      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'id' })
      }
    },
  })
}

// ── VectorStore class ─────────────────────────────────────────────────────────

export class VectorStore {
  private db: IDBPDatabase | null = null
  public readonly vaultId: string

  constructor(vaultId: string) {
    this.vaultId = vaultId
  }

  async open(): Promise<void> {
    this.db = await openVaultDB(this.vaultId)
  }

  private ensureOpen(): IDBPDatabase {
    if (!this.db) throw new Error('VectorStore not opened. Call open() first.')
    return this.db
  }

  // ── Chunk operations ────────────────────────────────────────────────────────

  async upsertChunk(entry: ChunkVector): Promise<void> {
    await this.ensureOpen().put(STORE_CHUNKS, entry)
  }

  async upsertChunks(entries: ChunkVector[]): Promise<void> {
    const db = this.ensureOpen()
    const tx = db.transaction(STORE_CHUNKS, 'readwrite')
    await Promise.all([
      ...entries.map((e) => tx.store.put(e)),
      tx.done,
    ])
  }

  async deleteChunksForNote(notePath: string): Promise<void> {
    const db = this.ensureOpen()
    const tx = db.transaction(STORE_CHUNKS, 'readwrite')
    const index = tx.store.index('by_notePath')
    const keys = await index.getAllKeys(notePath)
    await Promise.all(keys.map((k) => tx.store.delete(k)))
    await tx.done
  }

  async getChunksForNote(notePath: string): Promise<ChunkVector[]> {
    const db = this.ensureOpen()
    const index = db.transaction(STORE_CHUNKS, 'readonly').store.index('by_notePath')
    return index.getAll(notePath)
  }

  async getAllChunks(): Promise<ChunkVector[]> {
    return this.ensureOpen().getAll(STORE_CHUNKS)
  }

  async clearAll(): Promise<void> {
    await this.ensureOpen().clear(STORE_CHUNKS)
  }

  async count(): Promise<number> {
    return this.ensureOpen().count(STORE_CHUNKS)
  }

  // ── Stale / deleted detection ───────────────────────────────────────────────

  /**
   * Returns note paths that need re-indexing:
   * - Not yet indexed, OR
   * - Content hash changed
   */
  async findStaleNotes(
    currentNotes: Array<{ path: string; contentHash: string }>
  ): Promise<string[]> {
    const stale: string[] = []

    for (const { path, contentHash } of currentNotes) {
      const chunks = await this.getChunksForNote(path)
      if (chunks.length === 0 || chunks[0].contentHash !== contentHash) {
        stale.push(path)
      }
    }

    return stale
  }

  /**
   * Returns note paths that are indexed but no longer exist in the vault.
   */
  async findDeletedNotes(currentPaths: Set<string>): Promise<string[]> {
    const allChunks = await this.getAllChunks()
    const indexedPaths = new Set(allChunks.map((c) => c.notePath))
    return Array.from(indexedPaths).filter((p) => !currentPaths.has(p))
  }

  // ── Legacy compatibility (used by similaritySearch for note-level search) ───

  /**
   * Returns the best (highest-scoring) chunk per note as a NoteVector-like object.
   * Used by searchByNote to find the note's representative vector.
   */
  async getVector(notePath: string): Promise<NoteVector | undefined> {
    const chunks = await this.getChunksForNote(notePath)
    if (chunks.length === 0) return undefined
    // Use first chunk as representative
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

  /**
   * Returns one NoteVector per note (first chunk) for backward compat.
   */
  async getAllVectors(): Promise<NoteVector[]> {
    const allChunks = await this.getAllChunks()
    // Group by notePath, take first chunk per note
    const byNote = new Map<string, ChunkVector>()
    for (const chunk of allChunks) {
      if (!byNote.has(chunk.notePath)) {
        byNote.set(chunk.notePath, chunk)
      }
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

  /** Legacy upsert — wraps to chunk upsert */
  async upsertVector(entry: NoteVector): Promise<void> {
    const chunk: ChunkVector = {
      id: `${entry.path}::0`,
      notePath: entry.path,
      chunkIndex: 0,
      contentHash: entry.contentHash,
      vector: entry.vector,
      title: entry.title,
      snippet: entry.snippet,
      headingPath: '',
      startOffset: 0,
      endOffset: entry.noteLength,
      indexedAt: entry.indexedAt,
    }
    await this.upsertChunk(chunk)
  }

  /** Legacy delete */
  async deleteVector(notePath: string): Promise<void> {
    await this.deleteChunksForNote(notePath)
  }

  // ── Meta ────────────────────────────────────────────────────────────────────

  async getMeta(): Promise<VaultMeta | undefined> {
    return this.ensureOpen().get(STORE_META, 'meta')
  }

  async setMeta(meta: Omit<VaultMeta, 'id'>): Promise<void> {
    await this.ensureOpen().put(STORE_META, { id: 'meta', ...meta })
  }

  /** Update the vaultPath recorded in meta (called after vault move/rename) */
  async setVaultPathInMeta(vaultPath: string): Promise<void> {
    const existing = await this.getMeta()
    await this.ensureOpen().put(STORE_META, {
      ...(existing ?? { modelVersion: 'bge-micro-v2', totalNotes: 0, lastFullIndex: 0 }),
      id: 'meta',
      vaultPath,
    })
  }

  close() {
    this.db?.close()
    this.db = null
  }
}
