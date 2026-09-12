//! vlarena — Rust side.
//!
//! Deliberately thin: the webview owns the UI, and the only reasons to touch
//! Rust are (a) info the JS side can't get on its own, (b) persistence via
//! `tauri-plugin-store`, and (c) CORS-free provider calls via
//! `tauri-plugin-http`. Window sizing, minimum size and chrome all come from
//! `tauri.conf.json`.

use serde::Serialize;
use tauri::Manager;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    /// Version from tauri.conf.json.
    pub version: String,
    /// `linux` | `macos` | `windows`
    pub os: String,
    /// `x86_64` | `aarch64` | …
    pub arch: String,
    /// Where battles, ratings and API keys are persisted.
    pub data_dir: String,
}

#[tauri::command]
fn app_info(app: tauri::AppHandle) -> Result<AppInfo, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|_| String::from("unavailable"));

    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        data_dir,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("error while running vlarena");
}
