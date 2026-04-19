use chrono::Local;
use std::fs;
use std::path::Path;

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub path: String,
    pub note_name: String,
    pub timestamp: String,
    pub size: u64,
}

fn get_recovery_dir(vault_path: &str) -> std::path::PathBuf {
    Path::new(vault_path).join(".vault-recovery")
}

fn timestamp_now() -> String {
    Local::now().format("%Y-%m-%d_%H-%M-%S").to_string()
}

fn parse_snapshot_timestamp(filename: &str) -> String {
    let parts: Vec<&str> = filename.splitn(3, '_').collect();
    if parts.len() >= 2 {
        format!("{} {}", parts[0], parts[1].replace('-', ":"))
    } else {
        filename.to_string()
    }
}

fn sanitize_name(name: &str) -> String {
    name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_")
}

fn cleanup_old_snapshots(
    recovery_dir: &Path,
    safe_name: &str,
    max_keep: usize,
) -> Result<(), String> {
    let suffix = format!("_{}.md", safe_name);

    let mut snapshots: Vec<std::path::PathBuf> = fs::read_dir(recovery_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.ends_with(&suffix))
                .unwrap_or(false)
        })
        .collect();

    snapshots.sort();

    if snapshots.len() > max_keep {
        for old in &snapshots[..snapshots.len() - max_keep] {
            let _ = fs::remove_file(old);
        }
    }

    Ok(())
}

#[tauri::command]
pub fn save_snapshot(
    vault_path: String,
    note_path: String,
    content: String,
) -> Result<(), String> {
    let recovery_dir = get_recovery_dir(&vault_path);
    fs::create_dir_all(&recovery_dir).map_err(|e| e.to_string())?;

    let note_name = Path::new(&note_path)
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let safe_name = sanitize_name(&note_name);
    let snapshot_name = format!("{}_{}.md", timestamp_now(), safe_name);
    let snapshot_path = recovery_dir.join(&snapshot_name);

    fs::write(&snapshot_path, &content).map_err(|e| e.to_string())?;
    cleanup_old_snapshots(&recovery_dir, &safe_name, 20)?;

    Ok(())
}

#[tauri::command]
pub fn list_snapshots(vault_path: String, note_path: String) -> Result<Vec<Snapshot>, String> {
    let recovery_dir = get_recovery_dir(&vault_path);
    if !recovery_dir.exists() {
        return Ok(vec![]);
    }

    let note_name = Path::new(&note_path)
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    let safe_name = sanitize_name(&note_name);
    let suffix = format!("_{}.md", safe_name);

    let mut snapshots: Vec<Snapshot> = fs::read_dir(&recovery_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_name()
                .to_str()
                .map(|n| n.ends_with(&suffix))
                .unwrap_or(false)
        })
        .filter_map(|e| {
            let path = e.path();
            let filename = e.file_name().to_string_lossy().to_string();
            let metadata = fs::metadata(&path).ok()?;
            Some(Snapshot {
                path: path.to_string_lossy().replace('\\', "/").to_string(),
                note_name: note_name.clone(),
                timestamp: parse_snapshot_timestamp(&filename),
                size: metadata.len(),
            })
        })
        .collect();

    snapshots.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(snapshots)
}

#[tauri::command]
pub fn read_snapshot(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_snapshot(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| e.to_string())
}
