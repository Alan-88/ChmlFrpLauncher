use crate::{
    commands::process_persistence::stop_all_local_tunnels,
    extensions::remote_runner::runs::stop_all_remote_runs, FrpcProcesses, ProcessGuardState,
};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, Runtime};

#[tauri::command]
pub fn hide_window<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn show_window<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn quit_app(app: AppHandle) {
    let cleanup_app = app.clone();
    let _ = tokio::task::spawn_blocking(move || {
        let guard_state = cleanup_app.state::<ProcessGuardState>();
        guard_state.enabled.store(false, Ordering::SeqCst);
        if let Ok(mut guarded) = guard_state.guarded_processes.lock() {
            guarded.clear();
        }
        let processes = cleanup_app.state::<FrpcProcesses>();
        let _ = stop_all_local_tunnels(&cleanup_app, &processes);
        let _ = stop_all_remote_runs(&cleanup_app);
    })
    .await;
    app.exit(0);
}
