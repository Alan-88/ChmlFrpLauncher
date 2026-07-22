use super::{
    hosts::get_remote_host,
    lifecycle::{
        fetch_remote_logs, probe_remote_run, renew_remote_lease, setup_remote_run,
        stop_remote_process,
    },
    state::{
        load_preferences, load_runs, new_run_id, now, save_preferences, save_runs,
        validate_tunnel_key, RemoteRun, RemoteRunStatus, RunnerTarget, LEASE_SECONDS,
    },
};
use crate::{
    commands::frpc_config::generate_frpc_config,
    models::{LogMessage, TunnelConfig},
};
use chrono::Utc;
use serde::Deserialize;
use std::{
    collections::HashMap,
    sync::Mutex,
    thread,
    time::Duration,
};
use tauri::Emitter;

const REMOTE_MONITOR_INTERVAL: Duration = Duration::from_secs(30);
const STARTUP_LOG_WAIT: Duration = Duration::from_millis(800);

static REMOTE_RUN_LOCK: Mutex<()> = Mutex::new(());

#[derive(Deserialize)]
pub struct RemoteApiStartInput {
    pub host_id: String,
    pub tunnel_key: String,
    pub config: TunnelConfig,
    pub guard_enabled: bool,
}

#[derive(Deserialize)]
pub struct RemoteCustomStartInput {
    pub host_id: String,
    pub tunnel_key: String,
    pub tunnel_id: i32,
    pub config_content: String,
    pub guard_enabled: bool,
}

fn emit_log(app_handle: &tauri::AppHandle, tunnel_id: i32, message: String) {
    let _ = app_handle.emit(
        "frpc-log",
        LogMessage {
            tunnel_id,
            message,
            timestamp: chrono::Local::now().format("%Y/%m/%d %H:%M:%S").to_string(),
        },
    );
}

fn emit_run_update(app_handle: &tauri::AppHandle, runs: &[RemoteRun]) {
    let _ = app_handle.emit("remote-run-updated", runs);
}

fn emit_remote_logs(
    app_handle: &tauri::AppHandle,
    host_name: &str,
    run: &RemoteRun,
    is_first_batch: bool,
    lines: Vec<String>,
) {
    if lines.is_empty() {
        return;
    }
    if is_first_batch {
        emit_log(
            app_handle,
            run.tunnel_id,
            "[I] [ChmlFrpLauncher] 远程 frpc 进程已启动，正在同步运行日志。".to_string(),
        );
    }

    for line in lines {
        let line = strip_ansi_escapes::strip_str(&line);
        emit_log(
            app_handle,
            run.tunnel_id,
            format!("[远程 {} · {}] {}", host_name, run.run_id, line),
        );
    }
}

fn with_remote_run_lock<T>(operation: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let _guard = REMOTE_RUN_LOCK
        .lock()
        .map_err(|_| "远程运行器状态锁异常".to_string())?;
    operation()
}

fn mark_unreachable(run: &mut RemoteRun, message: String) {
    let now = Utc::now();
    let since = run
        .unreachable_since
        .as_deref()
        .and_then(|value| chrono::DateTime::parse_from_rfc3339(value).ok())
        .map(|value| value.with_timezone(&Utc));
    if since.is_none() {
        run.unreachable_since = Some(now.to_rfc3339());
    }
    let elapsed = since
        .map(|value| now.signed_duration_since(value).num_seconds())
        .unwrap_or(0);
    run.status = if elapsed >= LEASE_SECONDS {
        RemoteRunStatus::Unknown
    } else {
        RemoteRunStatus::Reconnecting
    };
    run.message = Some(message);
    run.updated_at = now.to_rfc3339();
}

fn sync_runs(app_handle: &tauri::AppHandle) -> Result<Vec<RemoteRun>, String> {
    let mut runs = load_runs(app_handle)?;
    let mut did_change = false;

    for run in &mut runs {
        if !run.status.is_active() {
            continue;
        }
        let previous_status = run.status.clone();
        let host = match get_remote_host(app_handle, &run.host_id) {
            Ok(host) => host,
            Err(error) => {
                mark_unreachable(run, error);
                did_change = true;
                continue;
            }
        };

        match probe_remote_run(&host, run) {
            Ok(true) => match renew_remote_lease(&host, run) {
                Ok(()) => {
                    run.status = RemoteRunStatus::Running;
                    run.unreachable_since = None;
                    run.message = None;
                    run.updated_at = now();
                    let is_first_log_batch = run.log_offset == 0;
                    match fetch_remote_logs(&host, run) {
                        Ok(lines) => emit_remote_logs(
                            app_handle,
                            &host.name,
                            run,
                            is_first_log_batch,
                            lines,
                        ),
                        Err(error) => mark_unreachable(run, error),
                    }
                }
                Err(error) => mark_unreachable(run, error),
            },
            Ok(false) => {
                run.status = RemoteRunStatus::Stopped;
                run.unreachable_since = None;
                run.message = Some("远端 frpc 已停止".to_string());
                run.updated_at = now();
            }
            Err(error) => mark_unreachable(run, error),
        }

        if run.status != previous_status {
            emit_log(
                app_handle,
                run.tunnel_id,
                format!(
                    "[I] [ChmlFrpLauncher] 远程主机“{}”的运行状态：{}。",
                    host.name,
                    run.status.label()
                ),
            );
        }
        did_change = true;
    }

    if did_change {
        save_runs(app_handle, &runs)?;
        emit_run_update(app_handle, &runs);
    }
    Ok(runs)
}

pub(crate) fn start_remote_run_monitor(app_handle: tauri::AppHandle) {
    thread::spawn(move || loop {
        let _ = with_remote_run_lock(|| sync_runs(&app_handle));
        thread::sleep(REMOTE_MONITOR_INTERVAL);
    });
}

fn start_remote_run(
    app_handle: &tauri::AppHandle,
    host_id: String,
    tunnel_key: String,
    tunnel_id: i32,
    config_content: String,
    guard_enabled: bool,
) -> Result<String, String> {
    validate_tunnel_key(&tunnel_key)?;
    let host = get_remote_host(app_handle, &host_id)?;
    let mut runs = load_runs(app_handle)?;
    if runs
        .iter()
        .any(|run| run.tunnel_key == tunnel_key && run.status.is_active())
    {
        return Err("此隧道已在远程主机运行中".to_string());
    }
    runs.retain(|run| run.tunnel_key != tunnel_key);

    let mut run = RemoteRun {
        tunnel_key,
        tunnel_id,
        host_id,
        run_id: new_run_id(),
        wrapper_pid: None,
        status: RemoteRunStatus::Running,
        started_at: now(),
        updated_at: now(),
        log_offset: 0,
        unreachable_since: None,
        message: None,
    };
    run.wrapper_pid = match setup_remote_run(&host, &run, &config_content, guard_enabled) {
        Ok(pid) => Some(pid),
        Err(error) => {
            let _ = stop_remote_process(&host, &run);
            emit_log(
                app_handle,
                run.tunnel_id,
                format!("[E] [ChmlFrpLauncher] 远程启动失败：{}", error),
            );
            return Err(error);
        }
    };
    runs.push(run.clone());
    save_runs(app_handle, &runs)?;
    emit_log(
        app_handle,
        run.tunnel_id,
        format!(
            "[I] [ChmlFrpLauncher] 远程运行包装器已启动（主机：{}，运行：{}）。",
            host.name, run.run_id
        ),
    );
    emit_run_update(app_handle, &runs);
    thread::sleep(STARTUP_LOG_WAIT);
    let _ = sync_runs(app_handle);
    Ok(format!("已在远程主机“{}”启动", host.name))
}

fn stop_remote_run(app_handle: &tauri::AppHandle, tunnel_key: &str) -> Result<String, String> {
    validate_tunnel_key(tunnel_key)?;
    let mut runs = load_runs(app_handle)?;
    let Some(index) = runs.iter().position(|run| run.tunnel_key == tunnel_key) else {
        return Err("未找到远程运行记录".to_string());
    };
    let run = runs[index].clone();
    let stop_result = get_remote_host(app_handle, &run.host_id)
        .and_then(|host| stop_remote_process(&host, &run).map(|_| host));
    runs.remove(index);
    save_runs(app_handle, &runs)?;
    emit_run_update(app_handle, &runs);

    match stop_result {
        Ok(host) => {
            emit_log(
                app_handle,
                run.tunnel_id,
                format!(
                    "[I] [ChmlFrpLauncher] 已停止远程主机“{}”上的隧道。",
                    host.name
                ),
            );
            Ok("远程 frpc 已停止".to_string())
        }
        Err(error) => {
            let minutes = LEASE_SECONDS / 60;
            emit_log(
                app_handle,
                run.tunnel_id,
                format!(
                    "[W] [ChmlFrpLauncher] 无法立即连接远程主机停止隧道（{}）；已取消续租，远端 frpc 最迟 {} 分钟后停止。",
                    error, minutes
                ),
            );
            Ok(format!(
                "无法立即连接远程主机；已取消续租，远端 frpc 最迟 {} 分钟后停止",
                minutes
            ))
        }
    }
}

pub(crate) fn stop_all_remote_runs(app_handle: &tauri::AppHandle) -> Result<(), String> {
    with_remote_run_lock(|| stop_all_remote_runs_unlocked(app_handle))
}

fn stop_all_remote_runs_unlocked(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let keys = load_runs(app_handle)?
        .into_iter()
        .filter(|run| run.status.is_active())
        .map(|run| run.tunnel_key)
        .collect::<Vec<_>>();
    let mut failures = Vec::new();

    for key in keys {
        if let Err(error) = stop_remote_run(app_handle, &key) {
            failures.push(error);
        }
    }

    if failures.is_empty() {
        Ok(())
    } else {
        Err(failures.join("；"))
    }
}

pub(crate) fn is_remote_tunnel_active(app_handle: &tauri::AppHandle, tunnel_key: &str) -> bool {
    load_runs(app_handle)
        .map(|runs| {
            runs.iter()
                .any(|run| run.tunnel_key == tunnel_key && run.status.is_active())
        })
        .unwrap_or(false)
}

pub(crate) fn active_remote_api_tunnel_ids(app_handle: &tauri::AppHandle) -> Vec<i32> {
    load_runs(app_handle)
        .unwrap_or_default()
        .into_iter()
        .filter(|run| run.status.is_active() && run.tunnel_key.starts_with("api_"))
        .map(|run| run.tunnel_id)
        .collect()
}

pub(crate) fn host_has_active_run(app_handle: &tauri::AppHandle, host_id: &str) -> bool {
    load_runs(app_handle)
        .map(|runs| {
            runs.iter()
                .any(|run| run.host_id == host_id && run.status.is_active())
        })
        .unwrap_or(false)
}

#[tauri::command]
pub fn get_tunnel_runner_preferences(
    app_handle: tauri::AppHandle,
) -> Result<HashMap<String, RunnerTarget>, String> {
    load_preferences(&app_handle)
}

#[tauri::command]
pub fn set_tunnel_runner_preference(
    app_handle: tauri::AppHandle,
    tunnel_key: String,
    runner: RunnerTarget,
) -> Result<(), String> {
    validate_tunnel_key(&tunnel_key)?;
    if let RunnerTarget::Remote { host_id } = &runner {
        get_remote_host(&app_handle, host_id)?;
    }
    if is_remote_tunnel_active(&app_handle, &tunnel_key) {
        return Err("请先停止隧道，再切换运行主机".to_string());
    }
    let mut preferences = load_preferences(&app_handle)?;
    preferences.insert(tunnel_key, runner);
    save_preferences(&app_handle, &preferences)
}

#[tauri::command]
pub fn get_remote_runs(app_handle: tauri::AppHandle) -> Result<Vec<RemoteRun>, String> {
    load_runs(&app_handle)
}

#[tauri::command]
pub async fn sync_remote_runs(app_handle: tauri::AppHandle) -> Result<Vec<RemoteRun>, String> {
    tokio::task::spawn_blocking(move || with_remote_run_lock(|| sync_runs(&app_handle)))
        .await
        .map_err(|error| format!("同步远端运行状态失败: {error}"))?
}

#[tauri::command]
pub async fn start_remote_api_frpc(
    app_handle: tauri::AppHandle,
    input: RemoteApiStartInput,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        with_remote_run_lock(|| {
            let tunnel_id = input.config.tunnel_id;
            let config_content = generate_frpc_config(&input.config)?;
            start_remote_run(
                &app_handle,
                input.host_id,
                input.tunnel_key,
                tunnel_id,
                config_content,
                input.guard_enabled,
            )
        })
    })
    .await
    .map_err(|error| format!("启动远端 frpc 任务失败: {error}"))?
}

#[tauri::command]
pub async fn start_remote_custom_frpc(
    app_handle: tauri::AppHandle,
    input: RemoteCustomStartInput,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        with_remote_run_lock(|| {
            start_remote_run(
                &app_handle,
                input.host_id,
                input.tunnel_key,
                input.tunnel_id,
                input.config_content,
                input.guard_enabled,
            )
        })
    })
    .await
    .map_err(|error| format!("启动远端自定义 frpc 任务失败: {error}"))?
}

#[tauri::command]
pub async fn stop_remote_frpc(
    app_handle: tauri::AppHandle,
    tunnel_key: String,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        with_remote_run_lock(|| stop_remote_run(&app_handle, &tunnel_key))
    })
        .await
        .map_err(|error| format!("停止远端 frpc 任务失败: {error}"))?
}

#[tauri::command]
pub async fn stop_all_remote_frpcs(app_handle: tauri::AppHandle) -> Result<(), String> {
    tokio::task::spawn_blocking(move || stop_all_remote_runs(&app_handle))
        .await
        .map_err(|error| format!("停止远端 frpc 任务失败: {error}"))?
}
