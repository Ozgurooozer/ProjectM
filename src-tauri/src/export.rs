use std::fs;
use std::io::Write;
use std::path::Path;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;

#[tauri::command]
pub fn export_pdf(_app: tauri::AppHandle, html: String, _path: String) -> Result<(), String> {
    let temp_path = std::env::temp_dir().join("vault_export_temp.html");
    fs::write(&temp_path, &html).map_err(|e| e.to_string())?;
    open::that(&temp_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn backup_vault(vault_path: String, output_path: String) -> Result<(), String> {
    let vault_dir = Path::new(&vault_path);
    let output_file = fs::File::create(&output_path).map_err(|e| e.to_string())?;
    let mut zip_writer = zip::ZipWriter::new(output_file);

    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    let vault_name = vault_dir
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    for entry in WalkDir::new(vault_dir).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        let name = match path.strip_prefix(vault_dir) {
            Ok(n) => n,
            Err(_) => continue,
        };
        let zip_path = format!(
            "{}/{}",
            vault_name,
            name.to_string_lossy().replace('\\', "/")
        );

        if zip_path.ends_with('/') {
            continue;
        }

        let file_name = path.file_name().unwrap_or_default().to_string_lossy();
        if file_name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            zip_writer
                .add_directory(&zip_path, options)
                .map_err(|e| e.to_string())?;
        } else {
            zip_writer
                .start_file(&zip_path, options)
                .map_err(|e| e.to_string())?;
            let bytes = fs::read(path).map_err(|e| e.to_string())?;
            zip_writer.write_all(&bytes).map_err(|e| e.to_string())?;
        }
    }

    zip_writer.finish().map_err(|e| e.to_string())?;
    Ok(())
}
