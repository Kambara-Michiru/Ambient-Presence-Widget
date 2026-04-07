mod transport;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Read WebSocket URL from env or use default dev server
            let ws_url = std::env::var("PRESENCE_WS_URL").unwrap_or_else(|_| {
                "ws://localhost:8080/v1/presence/stream?buddy_id=buddy-001&privacy_level=2"
                    .to_string()
            });

            // Start WebSocket transport in background
            tauri::async_runtime::spawn(async move {
                transport::start_transport(app_handle, ws_url).await;
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
