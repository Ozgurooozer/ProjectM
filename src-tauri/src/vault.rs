use crate::fs_utils::{collect_md_files, normalize_path, read_dir_recursive, FileNode, SearchResult};
use crate::fs_utils::retry_operation;
use std::fs;
use std::path::Path;
use uuid::Uuid;
use rayon::prelude::*;
use memchr::memmem;

#[tauri::command]
pub fn open_vault(path: String) -> Result<Vec<FileNode>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }
    Ok(read_dir_recursive(dir))
}

#[tauri::command]
pub fn search_vault(vault_path: String, query: String) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }

    let query_lower = query.to_lowercase();
    let query_bytes = query_lower.as_bytes();
    let all_paths = collect_md_files(Path::new(&vault_path));

    // Parallel search with rayon + SIMD-accelerated literal search with memchr
    let results: Vec<SearchResult> = all_paths
        .par_iter()
        .filter_map(|path| {
            let name = path.file_name()?.to_string_lossy().to_string();
            let name_without_ext = name.trim_end_matches(".md").to_string();
            let normalized = normalize_path(path);

            // Name match (fast path)
            if name_without_ext.to_lowercase().contains(&query_lower) {
                return Some(SearchResult {
                    path: normalized,
                    name: name_without_ext,
                    snippet: String::new(),
                    match_type: "name".to_string(),
                });
            }

            // Content match — memchr SIMD finder
            let content = fs::read_to_string(path).ok()?;
            let content_lower = content.to_lowercase();
            let finder = memmem::Finder::new(query_bytes);
            let idx = finder.find(content_lower.as_bytes())?;

            let mut start = idx.saturating_sub(60);
            while start > 0 && !content.is_char_boundary(start) {
                start -= 1;
            }
            let mut end = (idx + query.len() + 60).min(content.len());
            while end < content.len() && !content.is_char_boundary(end) {
                end += 1;
            }
            let snippet = content[start..end].replace('\n', " ").trim().to_string();

            Some(SearchResult {
                path: normalized,
                name: name_without_ext,
                snippet,
                match_type: "content".to_string(),
            })
        })
        .collect();

    Ok(results)
}

#[tauri::command]
pub fn propagate_rename(
    vault_path: String,
    old_name: String,
    new_name: String,
) -> Result<Vec<String>, String> {
    let mut updated_files: Vec<String> = Vec::new();
    let all_files = collect_md_files(Path::new(&vault_path));

    let old_pattern = format!("[[{}]]", old_name);
    let new_text = format!("[[{}]]", new_name);
    let old_alias_prefix = format!("[[{}|", old_name);
    let new_alias_prefix = format!("[[{}|", new_name);

    for path in all_files {
        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        if content.contains(&old_pattern) || content.contains(&old_alias_prefix) {
            let updated = content
                .replace(&old_pattern, &new_text)
                .replace(&old_alias_prefix, &new_alias_prefix);
            if let Err(e) = fs::write(&path, &updated) {
                eprintln!("Could not update {}: {}", path.display(), e);
                continue;
            }
            updated_files.push(normalize_path(&path));
        }
    }

    Ok(updated_files)
}

#[tauri::command]
pub fn get_or_create_vault_id(vault_path: String) -> Result<String, String> {
    let vault_root = Path::new(&vault_path);

    let meta = retry_operation(|| fs::metadata(vault_root), 3)?;
    if !meta.is_dir() {
        return Err(format!("Not a directory: {}", vault_path));
    }

    let id_path = vault_root.join(".vault-id");

    // Try to read existing ID
    if retry_operation(|| fs::metadata(&id_path), 3).is_ok() {
        let existing = retry_operation(|| fs::read_to_string(&id_path), 3)?;
        let trimmed = existing.trim();

        if let Ok(parsed) = Uuid::parse_str(trimmed) {
            return Ok(parsed.to_string());
        }

        // File exists but content is invalid — overwrite with new UUID
        let new_id = Uuid::new_v4().to_string();
        retry_operation(|| fs::write(&id_path, format!("{new_id}\n")), 3)?;
        return Ok(new_id);
    }

    // No .vault-id yet — create one
    let new_id = Uuid::new_v4().to_string();
    retry_operation(|| fs::write(&id_path, format!("{new_id}\n")), 3)?;
    Ok(new_id)
}
