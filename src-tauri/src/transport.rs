use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio_tungstenite::{connect_async, tungstenite::Message};

const BACKOFF_BASE_MS: u64 = 1_000;
const BACKOFF_MAX_MS: u64 = 60_000;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PresenceEvent {
    pub event: String,
    pub buddy_id: String,
    pub privacy_level: i32,
    pub intensity: f64,
    pub category_hue: i32,
    pub ts: String,
}

/// Start the WebSocket transport loop in the background.
/// Connects to the presence stream URL and forwards events via Tauri IPC.
pub async fn start_transport(app: AppHandle, ws_url: String) {
    let mut attempt: u32 = 0;

    loop {
        log::info!(
            "Connecting to presence stream (attempt {}): {}",
            attempt + 1,
            ws_url
        );

        match connect_async(&ws_url).await {
            Ok((ws_stream, _)) => {
                log::info!("WebSocket connected");
                attempt = 0; // reset on successful connect

                // Notify frontend of connection
                let _ = app.emit("ws_connected", ());

                let (_, mut read) = ws_stream.split();

                while let Some(msg) = read.next().await {
                    match msg {
                        Ok(Message::Text(text)) => {
                            on_message(&app, &text);
                        }
                        Ok(Message::Ping(_)) => {
                            // tungstenite handles pong automatically
                        }
                        Ok(Message::Close(_)) => {
                            log::info!("WebSocket closed by server");
                            break;
                        }
                        Err(e) => {
                            log::warn!("WebSocket error: {e}");
                            break;
                        }
                        _ => {}
                    }
                }

                // Notify frontend of disconnection
                let _ = app.emit("ws_disconnected", ());
            }
            Err(e) => {
                log::warn!("WebSocket connection failed: {e}");
            }
        }

        // Exponential backoff
        let wait_ms =
            (BACKOFF_BASE_MS * 2u64.saturating_pow(attempt)).min(BACKOFF_MAX_MS);
        log::info!("Reconnecting in {}ms", wait_ms);
        tokio::time::sleep(Duration::from_millis(wait_ms)).await;
        attempt = attempt.saturating_add(1);
    }
}

fn on_message(app: &AppHandle, raw: &str) {
    match serde_json::from_str::<PresenceEvent>(raw) {
        Ok(event) => {
            log::debug!("Presence event: {:?}", event);
            let _ = app.emit("presence_event", &event);
        }
        Err(e) => {
            log::warn!("Invalid presence payload: {e} — raw: {raw}");
        }
    }
}
