// src-tauri/src/vector_store.rs
//
// SQLite-backed vector store for Tauri 2.
// Replaces IndexedDB (idb) — same logical API, Rust-managed persistence.
//
// Connection strategy: single global Mutex<Option<Connection>>.
// One vault open at a time; matches app usage pattern.
//
// Vector serialization: base64-encoded f32 LE bytes.
// 384 floats × 4 bytes = 1536 bytes → ~2048 base64 chars per chunk.

use base64::{engine::general_purpose, Engine as _};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::Mutex;
use tauri::State;

// ── Public state type — registered in lib.rs via app.manage() ────────────────

pub struct VectorStoreState {
    pub conn: Mutex<Option<Connection>>,
}

impl VectorStoreState {
    pub fn new() -> Self {
        Self {
            conn: Mutex::new(None),
        }
    }
}

// ── Serde-friendly transfer types (camelCase for TypeScript) ─────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkRow {
    pub id: String,
    pub note_path: String,
    pub chunk_index: i64,
    pub content_hash: String,
    /// Base64-encoded f32 LE bytes (384 floats → 1536 bytes → ~2048 chars)
    pub vector: String,
    pub title: String,
    pub snippet: String,
    pub heading_path: String,
    pub start_offset: i64,
    pub end_offset: i64,
    pub indexed_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteHash {
    pub path: String,
    pub content_hash: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultMetaRow {
    pub vault_path: String,
    pub model_version: String,
    pub total_notes: i64,
    pub last_full_index: i64,
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/// Derive the SQLite path from the vault root: `<vault>/.vault-index/index.db`
fn db_path(vault_path: &str) -> std::path::PathBuf {
    Path::new(vault_path).join(".vault-index").join("index.db")
}

/// Open (or create) the SQLite database, apply PRAGMAs and schema.
fn open_connection(vault_path: &str) -> Result<Connection, String> {
    let path = db_path(vault_path);

    // Ensure .vault-index/ directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("create .vault-index dir: {e}"))?;
    }

    let conn = Connection::open(&path)
        .map_err(|e| format!("open sqlite: {e}"))?;

    // WAL: readers don't block writers.
    // locking_mode=EXCLUSIVE skips the -shm file entirely (heap-backed)
    // — ideal for single-connection use, avoids Windows -shm file issues.
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA locking_mode = EXCLUSIVE;
         PRAGMA synchronous = NORMAL;
         PRAGMA cache_size = -8000;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )
    .map_err(|e| format!("pragma setup: {e}"))?;

    apply_schema(&conn)?;

    Ok(conn)
}

/// Idempotent schema creation.
fn apply_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS vectors (
            id           TEXT PRIMARY KEY,
            note_path    TEXT NOT NULL,
            chunk_index  INTEGER NOT NULL,
            content_hash TEXT NOT NULL,
            vector       BLOB NOT NULL,
            title        TEXT NOT NULL,
            snippet      TEXT NOT NULL,
            heading_path TEXT NOT NULL,
            start_offset INTEGER NOT NULL,
            end_offset   INTEGER NOT NULL,
            indexed_at   INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_vectors_note ON vectors(note_path);

        CREATE TABLE IF NOT EXISTS vault_meta (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- Phase 2: backlinks & tags (schema created now, used later)
        CREATE TABLE IF NOT EXISTS backlinks (
            source_path TEXT NOT NULL,
            target_path TEXT NOT NULL,
            snippet     TEXT,
            PRIMARY KEY (source_path, target_path)
        );
        CREATE INDEX IF NOT EXISTS idx_backlinks_target
            ON backlinks(target_path);

        CREATE TABLE IF NOT EXISTS tags (
            tag       TEXT NOT NULL,
            note_path TEXT NOT NULL,
            PRIMARY KEY (tag, note_path)
        );
        CREATE INDEX IF NOT EXISTS idx_tags_note ON tags(note_path);",
    )
    .map_err(|e| format!("apply schema: {e}"))
}

fn decode_vector_b64(b64: &str) -> Result<Vec<u8>, String> {
    general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("base64 decode vector: {e}"))
}

fn encode_vector_b64(bytes: &[u8]) -> String {
    general_purpose::STANDARD.encode(bytes)
}

fn row_to_chunk(row: &rusqlite::Row<'_>) -> rusqlite::Result<ChunkRow> {
    let blob: Vec<u8> = row.get(4)?;
    Ok(ChunkRow {
        id: row.get(0)?,
        note_path: row.get(1)?,
        chunk_index: row.get(2)?,
        content_hash: row.get(3)?,
        vector: encode_vector_b64(&blob),
        title: row.get(5)?,
        snippet: row.get(6)?,
        heading_path: row.get(7)?,
        start_offset: row.get(8)?,
        end_offset: row.get(9)?,
        indexed_at: row.get(10)?,
    })
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// Open (or re-open) the SQLite database for a vault.
/// Called once when the user opens a vault.
#[tauri::command]
pub fn vector_store_open(
    vault_path: String,
    state: State<'_, VectorStoreState>,
) -> Result<(), String> {
    let mut guard = state.conn.lock()
        .map_err(|e| format!("mutex poison: {e}"))?;
    *guard = None; // close existing connection if switching vaults
    let conn = open_connection(&vault_path)?;
    *guard = Some(conn);
    Ok(())
}

/// Close the current SQLite connection.
/// Triggers automatic WAL checkpoint on clean close.
#[tauri::command]
pub fn vector_store_close(
    state: State<'_, VectorStoreState>,
) -> Result<(), String> {
    let mut guard = state.conn.lock()
        .map_err(|e| format!("mutex poison: {e}"))?;
    *guard = None; // drops Connection → sqlite3_close() → WAL checkpoint
    Ok(())
}

/// Upsert a batch of chunk vectors inside a single transaction.
#[tauri::command]
pub fn vector_upsert_chunks(
    chunks: Vec<ChunkRow>,
    state: State<'_, VectorStoreState>,
) -> Result<(), String> {
    let mut guard = state.conn.lock()
        .map_err(|e| format!("mutex poison: {e}"))?;
    let conn = guard.as_mut().ok_or("vector store not open")?;

    let tx = conn.transaction()
        .map_err(|e| format!("begin transaction: {e}"))?;

    for chunk in &chunks {
        let blob = decode_vector_b64(&chunk.vector)?;
        tx.execute(
            "INSERT OR REPLACE INTO vectors
             (id, note_path, chunk_index, content_hash, vector,
              title, snippet, heading_path, start_offset, end_offset, indexed_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                chunk.id, chunk.note_path, chunk.chunk_index,
                chunk.content_hash, blob, chunk.title, chunk.snippet,
                chunk.heading_path, chunk.start_offset, chunk.end_offset,
                chunk.indexed_at,
            ],
        )
        .map_err(|e| format!("upsert chunk '{}': {e}", chunk.id))?;
    }

    tx.commit().map_err(|e| format!("commit upsert: {e}"))
}

/// Delete all chunks belonging to a given note path.
#[tauri::command]
pub fn vector_delete_chunks_for_note(
    note_path: String,
    state: State<'_, VectorStoreState>,
) -> Result<(), String> {
    let mut guard = state.conn.lock()
        .map_err(|e| format!("mutex poison: {e}"))?;
    let conn = guard.as_mut().ok_or("vector store not open")?;
    conn.execute("DELETE FROM vectors WHERE note_path = ?1", params![note_path])
        .map_err(|e| format!("delete chunks: {e}"))?;
    Ok(())
}

/// Return all chunks for a given note path, ordered by chunk_index.
#[tauri::command]
pub fn vector_get_chunks_for_note(
    note_path: String,
    state: State<'_, VectorStoreState>,
) -> Result<Vec<ChunkRow>, String> {
    let guard = state.conn.lock()
        .map_err(|e| format!("mutex poison: {e}"))?;
    let conn = guard.as_ref().ok_or("vector store not open")?;

    let mut stmt = conn.prepare(
        "SELECT id, note_path, chunk_index, content_hash, vector,
                title, snippet, heading_path, start_offset, end_offset, indexed_at
         FROM vectors WHERE note_path = ?1 ORDER BY chunk_index ASC",
    ).map_err(|e| format!("prepare get_chunks: {e}"))?;

    let rows: Result<Vec<ChunkRow>, _> = stmt
        .query_map(params![note_path], row_to_chunk)
        .map_err(|e| format!("query chunks: {e}"))?
        .collect();
    rows.map_err(|e| format!("read chunks: {e}"))
}

/// Return ALL chunks across the entire vault.
#[tauri::command]
pub fn vector_get_all_chunks(
    state: State<'_, VectorStoreState>,
) -> Result<Vec<ChunkRow>, String> {
    let guard = state.conn.lock()
        .map_err(|e| format!("mutex poison: {e}"))?;
    let conn = guard.as_ref().ok_or("vector store not open")?;

    let mut stmt = conn.prepare(
        "SELECT id, note_path, chunk_index, content_hash, vector,
                title, snippet, heading_path, start_offset, end_offset, indexed_at
         FROM vectors ORDER BY note_path ASC, chunk_index ASC",
    ).map_err(|e| format!("prepare get_all: {e}"))?;

    let rows: Result<Vec<ChunkRow>, _> = stmt
        .query_map([], row_to_chunk)
        .map_err(|e| format!("query all: {e}"))?
        .collect();
    rows.map_err(|e| format!("read all chunks: {e}"))
}

/// Delete every row from vectors and vault_meta tables.
#[tauri::command]
pub fn vector_clear_all(
    state: State<'_, VectorStoreState>,
) -> Result<(), String> {
    let mut guard = state.conn.lock()
        .map_err(|e| format!("mutex poison: {e}"))?;
    let conn = guard.as_mut().ok_or("vector store not open")?;
    conn.execute_batch("DELETE FROM vectors; DELETE FROM vault_meta;")
        .map_err(|e| format!("clear all: {e}"))
}

/// Return total number of stored chunks.
#[tauri::command]
pub fn vector_count(
    state: State<'_, VectorStoreState>,
) -> Result<i64, String> {
    let guard = state.conn.lock()
        .map_err(|e| format!("mutex poison: {e}"))?;
    let conn = guard.as_ref().ok_or("vector store not open")?;
    conn.query_row("SELECT COUNT(*) FROM vectors", [], |row| row.get(0))
        .map_err(|e| format!("count: {e}"))
}

/// Return note paths whose stored content_hash differs from the provided hash,
/// AND note paths that are not yet in the DB at all (need fresh indexing).
/// Single SQL query — O(1) DB round-trips regardless of vault size.
#[tauri::command]
pub fn vector_find_stale_notes(
    current_notes: Vec<NoteHash>,
    state: State<'_, VectorStoreState>,
) -> Result<Vec<String>, String> {
    let guard = state.conn.lock()
        .map_err(|e| format!("mutex poison: {e}"))?;
    let conn = guard.as_ref().ok_or("vector store not open")?;

    // Fetch stored (note_path, content_hash) — one representative chunk per note
    let mut stmt = conn.prepare(
        "SELECT note_path, content_hash FROM vectors
         WHERE chunk_index = (
             SELECT MIN(v2.chunk_index) FROM vectors v2
             WHERE v2.note_path = vectors.note_path
         )
         GROUP BY note_path",
    ).map_err(|e| format!("prepare find_stale: {e}"))?;

    let stored: std::collections::HashMap<String, String> = {
        let rows: Result<Vec<(String, String)>, _> = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| format!("query stored hashes: {e}"))?
            .collect();
        rows.map_err(|e| format!("collect stored hashes: {e}"))?
            .into_iter()
            .collect()
    };

    // Stale = hash mismatch OR not in DB at all (needs fresh indexing)
    let stale: Vec<String> = current_notes
        .into_iter()
        .filter(|note| {
            match stored.get(&note.path) {
                Some(stored_hash) => stored_hash != &note.content_hash, // hash changed
                None => true, // not indexed yet → needs indexing
            }
        })
        .map(|n| n.path)
        .collect();

    Ok(stale)
}

/// Return note paths that exist in the DB but are absent from current_paths.
#[tauri::command]
pub fn vector_find_deleted_notes(
    current_paths: Vec<String>,
    state: State<'_, VectorStoreState>,
) -> Result<Vec<String>, String> {
    let guard = state.conn.lock()
        .map_err(|e| format!("mutex poison: {e}"))?;
    let conn = guard.as_ref().ok_or("vector store not open")?;

    let mut stmt = conn.prepare("SELECT DISTINCT note_path FROM vectors")
        .map_err(|e| format!("prepare find_deleted: {e}"))?;

    let db_paths: std::collections::HashSet<String> = {
        let rows: Result<Vec<String>, _> = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| format!("query paths: {e}"))?
            .collect();
        rows.map_err(|e| format!("collect paths: {e}"))?
            .into_iter()
            .collect()
    };

    let current_set: std::collections::HashSet<&str> =
        current_paths.iter().map(String::as_str).collect();

    Ok(db_paths.into_iter()
        .filter(|p| !current_set.contains(p.as_str()))
        .collect())
}

/// Read vault_meta key/value pairs and return as VaultMetaRow.
#[tauri::command]
pub fn vector_get_meta(
    state: State<'_, VectorStoreState>,
) -> Result<Option<VaultMetaRow>, String> {
    let guard = state.conn.lock()
        .map_err(|e| format!("mutex poison: {e}"))?;
    let conn = guard.as_ref().ok_or("vector store not open")?;

    let mut stmt = conn.prepare("SELECT key, value FROM vault_meta")
        .map_err(|e| format!("prepare get_meta: {e}"))?;

    let pairs: std::collections::HashMap<String, String> = {
        let rows: Result<Vec<(String, String)>, _> = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| format!("read meta: {e}"))?
            .collect();
        rows.map_err(|e| format!("collect meta: {e}"))?
            .into_iter()
            .collect()
    };

    if pairs.is_empty() {
        return Ok(None);
    }

    let vault_path = match pairs.get("vaultPath") {
        Some(v) => v.clone(),
        None => return Ok(None),
    };
    let model_version = match pairs.get("modelVersion") {
        Some(v) => v.clone(),
        None => return Ok(None),
    };
    let total_notes = pairs.get("totalNotes")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    let last_full_index = pairs.get("lastFullIndex")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);

    Ok(Some(VaultMetaRow { vault_path, model_version, total_notes, last_full_index }))
}

/// Write vault_meta key/value pairs inside a transaction.
#[tauri::command]
pub fn vector_set_meta(
    meta: VaultMetaRow,
    state: State<'_, VectorStoreState>,
) -> Result<(), String> {
    let mut guard = state.conn.lock()
        .map_err(|e| format!("mutex poison: {e}"))?;
    let conn = guard.as_mut().ok_or("vector store not open")?;

    let tx = conn.transaction()
        .map_err(|e| format!("begin meta transaction: {e}"))?;

    let pairs: [(&str, String); 4] = [
        ("vaultPath", meta.vault_path),
        ("modelVersion", meta.model_version),
        ("totalNotes", meta.total_notes.to_string()),
        ("lastFullIndex", meta.last_full_index.to_string()),
    ];

    for (key, value) in &pairs {
        tx.execute(
            "INSERT OR REPLACE INTO vault_meta (key, value) VALUES (?1, ?2)",
            params![key, value],
        )
        .map_err(|e| format!("set meta key '{key}': {e}"))?;
    }

    tx.commit().map_err(|e| format!("commit meta: {e}"))
}
