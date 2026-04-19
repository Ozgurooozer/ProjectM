use crate::fs_utils::retry_operation;
use std::fs;
use std::path::Path;

#[tauri::command]
pub fn read_note(path: String) -> Result<String, String> {
    retry_operation(|| fs::read_to_string(&path), 3)
}

#[tauri::command]
pub fn write_note(path: String, content: String) -> Result<(), String> {
    let content = content.clone();
    retry_operation(|| fs::write(&path, &content), 3).map(|_| ())
}

#[tauri::command]
pub fn create_note(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err(format!("File already exists: {}", path));
    }
    retry_operation(|| fs::write(&path, ""), 3).map(|_| ())
}

#[tauri::command]
pub fn rename_note(old_path: String, new_path: String) -> Result<(), String> {
    if Path::new(&new_path).exists() {
        return Err(format!("A file already exists at: {}", new_path));
    }
    let old = old_path.clone();
    let new = new_path.clone();
    retry_operation(|| fs::rename(&old, &new), 3).map(|_| ())
}

#[tauri::command]
pub fn delete_note(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File not found: {}", path));
    }
    retry_operation(|| fs::remove_file(p), 3).map(|_| ())
}
