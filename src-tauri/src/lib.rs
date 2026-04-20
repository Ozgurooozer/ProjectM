mod export;
mod folders;
mod fs_utils;
mod media;
mod notes;
mod recovery;
mod vault;

use tauri::webview::PageLoadEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .on_page_load(|webview, payload| {
            if webview.label() == "main" && matches!(payload.event(), PageLoadEvent::Finished) {
                let _ = webview.window().show();
            }
        })
        .invoke_handler(tauri::generate_handler![
            vault::open_vault,
            vault::search_vault,
            vault::propagate_rename,
            vault::get_or_create_vault_id,
            notes::read_note,
            notes::write_note,
            notes::create_note,
            notes::rename_note,
            notes::delete_note,
            folders::create_folder,
            folders::rename_folder,
            folders::delete_folder,
            folders::move_folder,
            media::read_image,
            export::export_pdf,
            export::backup_vault,
            recovery::save_snapshot,
            recovery::list_snapshots,
            recovery::read_snapshot,
            recovery::delete_snapshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
