use super::hosts::RemoteHost;
use chrono::Utc;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf};
use tauri::Manager;

const PREFERENCES_FILE: &str = "remote_runner_preferences.json";
const RUNS_FILE: &str = "remote_runner_runs.json";
const RUNS_DIRECTORY: &str = "chmlfrp-launcher-runs";
pub(crate) const LEASE_SECONDS: i64 = 10 * 60;

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RunnerTarget {
    Local,
    Remote { host_id: String },
}

impl Default for RunnerTarget {
    fn default() -> Self {
        Self::Local
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RemoteRunStatus {
    Running,
    Reconnecting,
    Unknown,
    Stopped,
}

impl Default for RemoteRunStatus {
    fn default() -> Self {
        Self::Stopped
    }
}

impl RemoteRunStatus {
    pub(crate) fn is_active(&self) -> bool {
        matches!(self, Self::Running | Self::Reconnecting | Self::Unknown)
    }

    pub(crate) fn label(&self) -> &'static str {
        match self {
            Self::Running => "运行中",
            Self::Reconnecting => "连接恢复中",
            Self::Unknown => "状态未知",
            Self::Stopped => "已停止",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct RemoteRun {
    pub tunnel_key: String,
    pub tunnel_id: i32,
    pub host_id: String,
    pub run_id: String,
    pub wrapper_pid: Option<u32>,
    #[serde(default)]
    pub status: RemoteRunStatus,
    pub started_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub log_offset: u64,
    #[serde(default)]
    pub unreachable_since: Option<String>,
    #[serde(default)]
    pub message: Option<String>,
}

fn app_file(app_handle: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法获取应用数据目录: {error}"))?;
    Ok(app_dir.join(name))
}

fn load_json<T: DeserializeOwned + Default>(path: &PathBuf) -> T {
    fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

fn save_json<T: Serialize>(path: &PathBuf, value: &T) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建应用数据目录失败: {error}"))?;
    }
    let content = serde_json::to_string_pretty(value)
        .map_err(|error| format!("序列化远程运行状态失败: {error}"))?;
    fs::write(path, content).map_err(|error| format!("保存远程运行状态失败: {error}"))
}

pub(crate) fn load_preferences(
    app_handle: &tauri::AppHandle,
) -> Result<HashMap<String, RunnerTarget>, String> {
    Ok(load_json(&app_file(app_handle, PREFERENCES_FILE)?))
}

pub(crate) fn save_preferences(
    app_handle: &tauri::AppHandle,
    preferences: &HashMap<String, RunnerTarget>,
) -> Result<(), String> {
    save_json(&app_file(app_handle, PREFERENCES_FILE)?, preferences)
}

pub(crate) fn load_runs(app_handle: &tauri::AppHandle) -> Result<Vec<RemoteRun>, String> {
    Ok(load_json(&app_file(app_handle, RUNS_FILE)?))
}

pub(crate) fn save_runs(app_handle: &tauri::AppHandle, runs: &[RemoteRun]) -> Result<(), String> {
    save_json(&app_file(app_handle, RUNS_FILE)?, &runs)
}

pub(crate) fn validate_tunnel_key(tunnel_key: &str) -> Result<(), String> {
    if tunnel_key.is_empty()
        || tunnel_key.len() > 128
        || !tunnel_key
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
    {
        return Err("隧道运行标识无效".to_string());
    }
    Ok(())
}

pub(crate) fn run_directory(host: &RemoteHost, run_id: &str) -> String {
    format!(
        "{}/{}/{}",
        host.work_dir.trim_end_matches('/'),
        RUNS_DIRECTORY,
        run_id
    )
}

pub(crate) fn new_run_id() -> String {
    let timestamp = Utc::now()
        .timestamp_nanos_opt()
        .unwrap_or_else(|| Utc::now().timestamp_micros() * 1_000);
    format!("run-{timestamp}-{}", std::process::id())
}

pub(crate) fn now() -> String {
    Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::validate_tunnel_key;

    #[test]
    fn tunnel_key_only_accepts_launcher_keys() {
        assert!(validate_tunnel_key("api_123").is_ok());
        assert!(validate_tunnel_key("custom_abc-123").is_ok());
        assert!(validate_tunnel_key("api_1; rm").is_err());
    }
}
