use crate::fs_utils::{collect_md_files, normalize_path, read_dir_recursive, FileNode, SearchResult};
use std::fs;
use std::path::Path;

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
    let query_lower = query.to_lowercase();
    let mut results: Vec<SearchResult> = Vec::new();
    let all_paths = collect_md_files(Path::new(&vault_path));

    for path in all_paths {
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let name_without_ext = name.trim_end_matches(".md").to_string();

        if name_without_ext.to_lowercase().contains(&query_lower) {
            results.push(SearchResult {
                path: normalize_path(&path),
                name: name_without_ext,
                snippet: String::new(),
                match_type: "name".to_string(),
            });
            continue;
        }

        if let Ok(content) = fs::read_to_string(&path) {
            if let Some(idx) = content.to_lowercase().find(&query_lower) {
                let mut start = idx.saturating_sub(60);
                while start > 0 && !content.is_char_boundary(start) {
                    start -= 1;
                }
                let mut end = (idx + query.len() + 60).min(content.len());
                while end < content.len() && !content.is_char_boundary(end) {
                    end += 1;
                }
                let snippet = content[start..end].replace('\n', " ").trim().to_string();

                results.push(SearchResult {
                    path: normalize_path(&path),
                    name: name_without_ext,
                    snippet,
                    match_type: "content".to_string(),
                });
            }
        }
    }

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
