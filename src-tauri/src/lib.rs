mod export;
mod folders;
mod fs_utils;
mod media;
mod notes;
mod recovery;
mod vault;
mod vector_store;

use tauri::webview::PageLoadEvent;
use vector_store::VectorStoreState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(VectorStoreState::new())
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
            vector_store::vector_store_open,
            vector_store::vector_store_close,
            vector_store::vector_upsert_chunks,
            vector_store::vector_delete_chunks_for_note,
            vector_store::vector_get_chunks_for_note,
            vector_store::vector_get_all_chunks,
            vector_store::vector_clear_all,
            vector_store::vector_count,
            vector_store::vector_find_stale_notes,
            vector_store::vector_find_deleted_notes,
            vector_store::vector_get_meta,
            vector_store::vector_set_meta,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
