use base64::{engine::general_purpose, Engine as _};
use std::fs;
use std::path::Path;

#[tauri::command]
pub fn read_image(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let b64 = general_purpose::STANDARD.encode(&bytes);
    let ext = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "image/png",
    };
    Ok(format!("data:{};base64,{}", mime, b64))
}
