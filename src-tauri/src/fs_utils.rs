use std::fs;
use std::path::Path;
use std::thread;
use std::time::Duration;

pub const IMAGE_EXTS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg"];

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub children: Option<Vec<FileNode>>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub path: String,
    pub name: String,
    pub snippet: String,
    pub match_type: String,
}

pub fn normalize_path(path: &Path) -> String {
    path.to_string_lossy().to_string().replace('\\', "/")
}

pub fn read_dir_recursive(dir: &Path) -> Vec<FileNode> {
    let mut nodes: Vec<FileNode> = Vec::new();

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return nodes,
    };

    let mut entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
    entries.sort_by_key(|e| {
        let is_file = e.file_type().map(|t| t.is_file()).unwrap_or(false);
        (is_file, e.file_name())
    });

    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('.') {
            continue;
        }

        let metadata = match fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };

        if metadata.is_dir() {
            let children = read_dir_recursive(&path);
            nodes.push(FileNode {
                name,
                path: normalize_path(&path),
                is_directory: true,
                children: Some(children),
            });
        } else {
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            if ext == "md" {
                if fs::File::open(&path).is_err() {
                    continue;
                }
                nodes.push(FileNode {
                    name,
                    path: normalize_path(&path),
                    is_directory: false,
                    children: None,
                });
            } else if IMAGE_EXTS.contains(&ext.as_str()) {
                nodes.push(FileNode {
                    name,
                    path: normalize_path(&path),
                    is_directory: false,
                    children: None,
                });
            }
        }
    }

    nodes
}

pub fn collect_md_files(dir: &Path) -> Vec<std::path::PathBuf> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            if path.is_dir() {
                files.extend(collect_md_files(&path));
            } else if path.extension().map(|e| e == "md").unwrap_or(false) {
                files.push(path);
            }
        }
    }
    files
}

pub fn retry_operation<F, T>(mut op: F, max_retries: u32) -> Result<T, String>
where
    F: FnMut() -> std::io::Result<T>,
{
    let mut last_err = None;
    for attempt in 0..=max_retries {
        match op() {
            Ok(result) => return Ok(result),
            Err(e) => {
                last_err = Some(e);
                if attempt < max_retries {
                    thread::sleep(Duration::from_millis(50));
                }
            }
        }
    }
    Err(last_err
        .map(|e| e.to_string())
        .unwrap_or_else(|| "Unknown error".to_string()))
}
