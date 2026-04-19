import { openDB, type IDBPDatabase } from 'idb'

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

const DB_VERSION = 1
const STORE_VECTORS = 'note_vectors'
const STORE_META = 'vault_meta'

function vaultPathToDbName(vaultPath: string): string {
  return `vault_index_${vaultPath
    .replace(/[^a-zA-Z0-9]/g, '_')
    .slice(-60)}`
}

async function openVaultDB(vaultPath: string): Promise<IDBPDatabase> {
  const dbName = vaultPathToDbName(vaultPath)

  return openDB(dbName, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_VECTORS)) {
        db.createObjectStore(STORE_VECTORS, { keyPath: 'path' })
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'id' })
      }
    },
  })
}

export class VectorStore {
  private db: IDBPDatabase | null = null
  private vaultPath: string

  constructor(vaultPath: string) {
    this.vaultPath = vaultPath
  }

  async open(): Promise<void> {
    this.db = await openVaultDB(this.vaultPath)
  }

  private ensureOpen(): IDBPDatabase {
    if (!this.db) throw new Error('VectorStore not opened. Call open() first.')
    return this.db
  }

  async upsertVector(entry: NoteVector): Promise<void> {
    await this.ensureOpen().put(STORE_VECTORS, entry)
  }

  async upsertVectors(entries: NoteVector[]): Promise<void> {
    const db = this.ensureOpen()
    const tx = db.transaction(STORE_VECTORS, 'readwrite')
    await Promise.all([
      ...entries.map((e) => tx.store.put(e)),
      tx.done,
    ])
  }

  async deleteVector(path: string): Promise<void> {
    await this.ensureOpen().delete(STORE_VECTORS, path)
  }

  async clearAll(): Promise<void> {
    await this.ensureOpen().clear(STORE_VECTORS)
  }

  async getVector(path: string): Promise<NoteVector | undefined> {
    return this.ensureOpen().get(STORE_VECTORS, path)
  }

  async getAllVectors(): Promise<NoteVector[]> {
    return this.ensureOpen().getAll(STORE_VECTORS)
  }

  async getIndexedPaths(): Promise<string[]> {
    const db = this.ensureOpen()
    const tx = db.transaction(STORE_VECTORS, 'readonly')
    const keys = await tx.store.getAllKeys()
    return keys as string[]
  }

  async count(): Promise<number> {
    return this.ensureOpen().count(STORE_VECTORS)
  }

  async getMeta(): Promise<VaultMeta | undefined> {
    return this.ensureOpen().get(STORE_META, 'meta')
  }

  async setMeta(meta: Omit<VaultMeta, 'id'>): Promise<void> {
    await this.ensureOpen().put(STORE_META, { id: 'meta', ...meta })
  }

  async findStaleNotes(
    currentNotes: Array<{ path: string; contentHash: string }>
  ): Promise<string[]> {
    const stale: string[] = []

    for (const { path, contentHash } of currentNotes) {
      const stored = await this.getVector(path)
      if (!stored || stored.contentHash !== contentHash) {
        stale.push(path)
      }
    }

    return stale
  }

  async findDeletedNotes(currentPaths: Set<string>): Promise<string[]> {
    const indexed = await this.getIndexedPaths()
    return indexed.filter((p) => !currentPaths.has(p))
  }

  close() {
    this.db?.close()
    this.db = null
  }
}
