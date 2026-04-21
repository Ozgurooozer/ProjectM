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

// ── Backlink index persist ────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacklinkRow {
    pub source_path: String,
    pub target_path: String,
    pub snippet: String,
}

/// Replace all backlinks for a given source note (called after note save).
#[tauri::command]
pub fn backlinks_set_for_note(
    source_path: String,
    entries: Vec<BacklinkRow>,
    state: State<'_, VectorStoreState>,
) -> Result<(), String> {
    let mut guard = state.conn.lock()
        .map_err(|e| format!("mutex poison: {e}"))?;
    let conn = guard.as_mut().ok_or("vector store not open")?;

    let tx = conn.transaction()
        .map_err(|e| format!("begin backlinks tx: {e}"))?;

    tx.execute("DELETE FROM backlinks WHERE source_path = ?1", params![source_path])
        .map_err(|e| format!("delete backlinks: {e}"))?;

    for entry in &entries {
        tx.execute(
            "INSERT OR REPLACE INTO backlinks (source_path, target_path, snippet)
             VALUES (?1, ?2, ?3)",
            params![entry.source_path, entry.target_path, entry.snippet],
        )
        .map_err(|e| format!("insert backlink: {e}"))?;
    }

    tx.commit().map_err(|e| format!("commit backlinks: {e}"))
}

/// Return all backlinks pointing TO a given target note.
#[tauri::command]
pub fn backlinks_get_for_target(
    target_path: String,
    state: State<'_, VectorStoreState>,
) -> Result<Vec<BacklinkRow>, String> {
    let guard = state.conn.lock()
        .map_err(|e| format!("mutex poison: {e}"))?;
    let conn = guard.as_ref().ok_or("vector store not open")?;

    let mut stmt = conn.prepare(
        "SELECT source_path, target_path, snippet FROM backlinks
         WHERE target_path = ?1",
    ).map_err(|e| format!("prepare backlinks: {e}"))?;

    let rows: Result<Vec<BacklinkRow>, _> = stmt
        .query_map(params![target_path], |row| {
            Ok(BacklinkRow {
                source_path: row.get(0)?,
                target_path: row.get(1)?,
                snippet: row.get(2)?,
            })
        })
        .map_err(|e| format!("query backlinks: {e}"))?
        .collect();
    rows.map_err(|e| format!("read backlinks: {e}"))
}

/// Return all backlinks as a flat list (for loading full index on vault open).
#[tauri::command]
pub fn backlinks_get_all(
    state: State<'_, VectorStoreState>,
) -> Result<Vec<BacklinkRow>, String> {
    let guard = state.conn.lock()
        .map_err(|e| format!("mutex poison: {e}"))?;
    let conn = guard.as_ref().ok_or("vector store not open")?;

    let mut stmt = conn.prepare(
        "SELECT source_path, target_path, snippet FROM backlinks",
    ).map_err(|e| format!("prepare all backlinks: {e}"))?;

    let rows: Result<Vec<BacklinkRow>, _> = stmt
        .query_map([], |row| {
            Ok(BacklinkRow {
                source_path: row.get(0)?,
                target_path: row.get(1)?,
                snippet: row.get(2)?,
            })
        })
        .map_err(|e| format!("query all backlinks: {e}"))?
        .collect();
    rows.map_err(|e| format!("read all backlinks: {e}"))
}

// ── Tag index persist ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagRow {
    pub tag: String,
    pub note_path: String,
}

/// Replace all tags for a given note (called after note save).
#[tauri::command]
pub fn tags_set_for_note(
    note_path: String,
    tags: Vec<String>,
    state: State<'_, VectorStoreState>,
) -> Result<(), String> {
    let mut guard = state.conn.lock()
        .map_err(|e| format!("mutex poison: {e}"))?;
    let conn = guard.as_mut().ok_or("vector store not open")?;

    let tx = conn.transaction()
        .map_err(|e| format!("begin tags tx: {e}"))?;

    tx.execute("DELETE FROM tags WHERE note_path = ?1", params![note_path])
        .map_err(|e| format!("delete tags: {e}"))?;

    for tag in &tags {
        tx.execute(
            "INSERT OR REPLACE INTO tags (tag, note_path) VALUES (?1, ?2)",
            params![tag, note_path],
        )
        .map_err(|e| format!("insert tag: {e}"))?;
    }

    tx.commit().map_err(|e| format!("commit tags: {e}"))
}

/// Return all tags as a flat list (for loading full index on vault open).
#[tauri::command]
pub fn tags_get_all(
    state: State<'_, VectorStoreState>,
) -> Result<Vec<TagRow>, String> {
    let guard = state.conn.lock()
        .map_err(|e| format!("mutex poison: {e}"))?;
    let conn = guard.as_ref().ok_or("vector store not open")?;

    let mut stmt = conn.prepare(
        "SELECT tag, note_path FROM tags ORDER BY tag ASC",
    ).map_err(|e| format!("prepare all tags: {e}"))?;

    let rows: Result<Vec<TagRow>, _> = stmt
        .query_map([], |row| {
            Ok(TagRow {
                tag: row.get(0)?,
                note_path: row.get(1)?,
            })
        })
        .map_err(|e| format!("query all tags: {e}"))?
        .collect();
    rows.map_err(|e| format!("read all tags: {e}"))
}

// ── Cosine similarity search ──────────────────────────────────────────────────

const VECTOR_DIM: usize = 384;
const VECTOR_BYTES: usize = VECTOR_DIM * 4; // 384 × f32 = 1536 bytes

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VectorSearchResult {
    pub note_path: String,
    pub title: String,
    pub snippet: String,
    pub score: f32,
    pub heading_path: String,
}

/// Convert raw f32 LE bytes into a fixed-size array.
#[inline]
fn bytes_to_f32_array(bytes: &[u8], out: &mut [f32; VECTOR_DIM]) -> Result<(), String> {
    if bytes.len() != VECTOR_BYTES {
        return Err(format!("wrong blob size: expected {VECTOR_BYTES}, got {}", bytes.len()));
    }
    for (i, chunk) in bytes.chunks_exact(4).enumerate() {
        out[i] = f32::from_le_bytes(chunk.try_into().unwrap());
    }
    Ok(())
}

/// L2 norm — unrolled for SIMD auto-vectorization.
#[inline(always)]
fn l2_norm(v: &[f32; VECTOR_DIM]) -> f32 {
    let mut sum = 0.0_f32;
    for chunk in v.chunks_exact(4) {
        sum += chunk[0] * chunk[0] + chunk[1] * chunk[1]
             + chunk[2] * chunk[2] + chunk[3] * chunk[3];
    }
    sum.sqrt()
}

/// Cosine similarity — unrolled for SIMD auto-vectorization.
/// `query_norm` is pre-computed once outside the loop.
#[inline(always)]
fn cosine_similarity_precomputed(
    query: &[f32; VECTOR_DIM],
    query_norm: f32,
    other: &[f32; VECTOR_DIM],
) -> f32 {
    let mut dot = 0.0_f32;
    let mut other_norm_sq = 0.0_f32;
    for i in (0..VECTOR_DIM).step_by(4) {
        dot += query[i]     * other[i]
             + query[i + 1] * other[i + 1]
             + query[i + 2] * other[i + 2]
             + query[i + 3] * other[i + 3];
        other_norm_sq += other[i]     * other[i]
                       + other[i + 1] * other[i + 1]
                       + other[i + 2] * other[i + 2]
                       + other[i + 3] * other[i + 3];
    }
    let other_norm = other_norm_sq.sqrt();
    if other_norm < f32::EPSILON { return 0.0; }
    dot / (query_norm * other_norm)
}

/// Search for the top-K most similar notes to a query vector.
/// Accepts a base64-encoded f32 LE query vector (384 floats = 1536 bytes).
/// Returns results sorted by score descending, grouped by note (best chunk per note).
#[tauri::command]
pub fn vector_search(
    query_vector: String,
    top_k: usize,
    min_score: f32,
    exclude_path: Option<String>,
    state: State<'_, VectorStoreState>,
) -> Result<Vec<VectorSearchResult>, String> {
    if top_k == 0 {
        return Ok(Vec::new());
    }

    // Decode query vector
    let query_bytes = general_purpose::STANDARD
        .decode(&query_vector)
        .map_err(|e| format!("base64 decode query: {e}"))?;

    let mut query_arr = [0.0_f32; VECTOR_DIM];
    bytes_to_f32_array(&query_bytes, &mut query_arr)?;

    let query_norm = l2_norm(&query_arr);
    if query_norm < f32::EPSILON {
        return Err("zero-norm query vector".into());
    }

    let guard = state.conn.lock()
        .map_err(|e| format!("mutex poison: {e}"))?;
    let conn = guard.as_ref().ok_or("vector store not open")?;

    let mut stmt = conn.prepare(
        "SELECT note_path, vector, title, snippet, heading_path FROM vectors",
    ).map_err(|e| format!("prepare vector_search: {e}"))?;

    // best_by_note: note_path → (score, title, snippet, heading_path)
    let mut best_by_note: std::collections::HashMap<String, (f32, String, String, String)> =
        std::collections::HashMap::new();

    let exclude = exclude_path.as_deref();

    let rows: Result<Vec<(String, Vec<u8>, String, String, String)>, _> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Vec<u8>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|e| format!("query vector_search: {e}"))?
        .collect();

    for (note_path, blob, title, snippet, heading_path) in
        rows.map_err(|e| format!("read row: {e}"))?
    {
        if exclude == Some(note_path.as_str()) { continue; }
        if blob.len() != VECTOR_BYTES { continue; }

        let mut chunk_arr = [0.0_f32; VECTOR_DIM];
        if bytes_to_f32_array(&blob, &mut chunk_arr).is_err() { continue; }

        let score = cosine_similarity_precomputed(&query_arr, query_norm, &chunk_arr);
        if score < min_score { continue; }

        let entry = best_by_note.entry(note_path);
        match entry {
            std::collections::hash_map::Entry::Occupied(mut e) => {
                if score > e.get().0 {
                    *e.get_mut() = (score, title, snippet, heading_path);
                }
            }
            std::collections::hash_map::Entry::Vacant(e) => {
                e.insert((score, title, snippet, heading_path));
            }
        }
    }

    // Collect, partial-sort, truncate
    let mut results: Vec<VectorSearchResult> = best_by_note
        .into_iter()
        .map(|(note_path, (score, title, snippet, heading_path))| VectorSearchResult {
            note_path,
            title,
            snippet,
            score,
            heading_path,
        })
        .collect();

    if results.len() > top_k {
        results.select_nth_unstable_by(top_k, |a, b| {
            b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal)
        });
        results.truncate(top_k);
    }

    results.sort_unstable_by(|a, b| {
        b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(results)
}
