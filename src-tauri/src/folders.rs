use std::fs;
use std::path::Path;

#[tauri::command]
pub fn create_folder(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_folder(old_path: String, new_path: String) -> Result<(), String> {
    let old = Path::new(&old_path);
    let new = Path::new(&new_path);
    if !old.exists() {
        return Err(format!("Folder not found: {}", old_path));
    }
    if new.exists() {
        return Err(format!("A folder already exists at: {}", new_path));
    }
    fs::rename(old, new).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_folder(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Folder not found: {}", path));
    }
    if !p.is_dir() {
        return Err(format!("Path is not a folder: {}", path));
    }
    fs::remove_dir_all(p).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn move_folder(old_path: String, new_path: String) -> Result<(), String> {
    let old = Path::new(&old_path);
    let new = Path::new(&new_path);
    if !old.exists() {
        return Err(format!("Folder not found: {}", old_path));
    }
    if new.exists() {
        return Err(format!("A folder already exists at: {}", new_path));
    }
    fs::rename(old, new).map_err(|e| e.to_string())
}
