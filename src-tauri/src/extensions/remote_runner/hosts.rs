use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const REMOTE_HOSTS_FILE: &str = "remote_hosts.json";
const SSH_CHECK_TIMEOUT: Duration = Duration::from_secs(12);
const MAX_FIELD_LENGTH: usize = 512;

const REMOTE_CHECK_COMMAND: &str = r#"sh -c 'IFS= read -r frpc_path || exit 2
IFS= read -r work_dir || exit 2
host_name=$(hostname 2>/dev/null || printf unknown)
if [ ! -x "$frpc_path" ]; then
  printf "FRPC_MISSING\n%s\n" "$host_name"
  exit 20
fi
version=$("$frpc_path" --version 2>&1 | sed -n "1p")
if [ -d "$work_dir" ] && [ -w "$work_dir" ]; then
  work_dir_ready=true
else
  work_dir_ready=false
fi
printf "OK\n%s\n%s\n%s\n" "$host_name" "$version" "$work_dir_ready"
'"#;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct RemoteHost {
    pub id: String,
    pub name: String,
    pub ssh_target: String,
    pub frpc_path: String,
    pub work_dir: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct RemoteHostInput {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    pub ssh_target: String,
    pub frpc_path: String,
    pub work_dir: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct RemoteHostCheck {
    pub success: bool,
    pub host_name: Option<String>,
    pub frpc_version: Option<String>,
    pub work_dir_ready: bool,
    pub message: String,
}

fn hosts_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法获取应用数据目录: {error}"))?;
    Ok(app_data_dir.join(REMOTE_HOSTS_FILE))
}

fn load_hosts(app_handle: &tauri::AppHandle) -> Result<Vec<RemoteHost>, String> {
    let path = hosts_path(app_handle)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content =
        fs::read_to_string(&path).map_err(|error| format!("读取运行主机配置失败: {error}"))?;
    serde_json::from_str(&content).map_err(|error| format!("解析运行主机配置失败: {error}"))
}

pub(crate) fn get_remote_host(
    app_handle: &tauri::AppHandle,
    host_id: &str,
) -> Result<RemoteHost, String> {
    load_hosts(app_handle)?
        .into_iter()
        .find(|host| host.id == host_id)
        .ok_or_else(|| "要使用的运行主机不存在".to_string())
}

fn save_hosts(app_handle: &tauri::AppHandle, hosts: &[RemoteHost]) -> Result<(), String> {
    let path = hosts_path(app_handle)?;
    let parent = path
        .parent()
        .ok_or_else(|| "无法获取运行主机配置目录".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("创建运行主机配置目录失败: {error}"))?;
    let content = serde_json::to_string_pretty(hosts)
        .map_err(|error| format!("序列化运行主机配置失败: {error}"))?;
    fs::write(path, content).map_err(|error| format!("保存运行主机配置失败: {error}"))
}

fn normalize_text(value: String, field: &str) -> Result<String, String> {
    let value = value.trim().to_string();
    if value.is_empty() {
        return Err(format!("{field}不能为空"));
    }
    if value.len() > MAX_FIELD_LENGTH || value.contains('\n') || value.contains('\r') {
        return Err(format!("{field}格式无效"));
    }
    Ok(value)
}

fn normalize_input(input: RemoteHostInput) -> Result<RemoteHostInput, String> {
    let name = normalize_text(input.name, "名称")?;
    let ssh_target = normalize_text(input.ssh_target, "SSH Host")?;
    if ssh_target.starts_with('-')
        || !ssh_target.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '@' | '.' | '_' | '-')
        })
    {
        return Err("SSH Host 只能包含字母、数字、@、点、下划线和连字符".to_string());
    }

    let frpc_path = normalize_text(input.frpc_path, "远端 frpc 路径")?;
    let work_dir = normalize_text(input.work_dir, "远端工作目录")?;
    if !frpc_path.starts_with('/') || !work_dir.starts_with('/') {
        return Err("远端 frpc 路径和工作目录必须使用绝对路径".to_string());
    }

    Ok(RemoteHostInput {
        id: input.id.filter(|id| !id.trim().is_empty()),
        name,
        ssh_target,
        frpc_path,
        work_dir,
    })
}

fn new_host_id() -> String {
    let timestamp = Utc::now()
        .timestamp_nanos_opt()
        .unwrap_or_else(|| Utc::now().timestamp_micros() * 1_000);
    format!("remote-{timestamp}-{}", std::process::id())
}

fn summarize_command_error(stderr: &[u8], stdout: &[u8]) -> String {
    let stderr = String::from_utf8_lossy(stderr);
    let stdout = String::from_utf8_lossy(stdout);
    let detail = stderr
        .lines()
        .next()
        .or_else(|| stdout.lines().next())
        .unwrap_or("SSH 检测失败")
        .trim()
        .chars()
        .take(240)
        .collect::<String>();
    if detail.is_empty() {
        "SSH 检测失败".to_string()
    } else {
        detail
    }
}

fn run_ssh_check(host: &RemoteHost) -> Result<std::process::Output, String> {
    let mut command = Command::new("ssh");
    command
        .args([
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            "-o",
            "ConnectionAttempts=1",
        ])
        .arg(&host.ssh_target)
        .arg(REMOTE_CHECK_COMMAND)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        command.creation_flags(0x08000000);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("无法启动 ssh: {error}"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "无法写入 SSH 检测请求".to_string())?;
    writeln!(stdin, "{}", host.frpc_path)
        .and_then(|_| writeln!(stdin, "{}", host.work_dir))
        .map_err(|error| format!("写入 SSH 检测请求失败: {error}"))?;
    drop(stdin);

    let deadline = Instant::now() + SSH_CHECK_TIMEOUT;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return child.wait_with_output().map_err(|error| error.to_string()),
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(50)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait_with_output();
                return Err("SSH 连接或 frpc 检测超时".to_string());
            }
            Err(error) => return Err(format!("等待 SSH 检测失败: {error}")),
        }
    }
}

fn check_remote_host(host: RemoteHost) -> RemoteHostCheck {
    let output = match run_ssh_check(&host) {
        Ok(output) => output,
        Err(message) => {
            return RemoteHostCheck {
                success: false,
                host_name: None,
                frpc_version: None,
                work_dir_ready: false,
                message,
            }
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut lines = stdout.lines();
    match lines.next() {
        Some("OK") if output.status.success() => {
            let host_name = lines
                .next()
                .map(str::to_string)
                .filter(|value| !value.is_empty());
            let frpc_version = lines
                .next()
                .map(str::to_string)
                .filter(|value| !value.is_empty());
            let work_dir_ready = lines.next() == Some("true");
            let message = if work_dir_ready {
                "SSH 连接和 frpc 检测通过".to_string()
            } else {
                "SSH 连接和 frpc 检测通过；工作目录会在首次远程启动时创建".to_string()
            };
            RemoteHostCheck {
                success: true,
                host_name,
                frpc_version,
                work_dir_ready,
                message,
            }
        }
        Some("FRPC_MISSING") => RemoteHostCheck {
            success: false,
            host_name: lines
                .next()
                .map(str::to_string)
                .filter(|value| !value.is_empty()),
            frpc_version: None,
            work_dir_ready: false,
            message: format!("远端未找到可执行的 frpc：{}", host.frpc_path),
        },
        _ => RemoteHostCheck {
            success: false,
            host_name: None,
            frpc_version: None,
            work_dir_ready: false,
            message: summarize_command_error(&output.stderr, &output.stdout),
        },
    }
}

#[tauri::command]
pub fn get_remote_hosts(app_handle: tauri::AppHandle) -> Result<Vec<RemoteHost>, String> {
    load_hosts(&app_handle)
}

#[tauri::command]
pub fn save_remote_host(
    app_handle: tauri::AppHandle,
    input: RemoteHostInput,
) -> Result<RemoteHost, String> {
    let input = normalize_input(input)?;
    let mut hosts = load_hosts(&app_handle)?;
    let now = Utc::now().to_rfc3339();

    let host = if let Some(id) = input.id {
        let existing = hosts
            .iter_mut()
            .find(|host| host.id == id)
            .ok_or_else(|| "要更新的运行主机不存在".to_string())?;
        existing.name = input.name;
        existing.ssh_target = input.ssh_target;
        existing.frpc_path = input.frpc_path;
        existing.work_dir = input.work_dir;
        existing.updated_at = now;
        existing.clone()
    } else {
        let host = RemoteHost {
            id: new_host_id(),
            name: input.name,
            ssh_target: input.ssh_target,
            frpc_path: input.frpc_path,
            work_dir: input.work_dir,
            created_at: now.clone(),
            updated_at: now,
        };
        hosts.push(host.clone());
        host
    };

    save_hosts(&app_handle, &hosts)?;
    Ok(host)
}

#[tauri::command]
pub fn delete_remote_host(app_handle: tauri::AppHandle, host_id: String) -> Result<(), String> {
    if super::runs::host_has_active_run(&app_handle, &host_id) {
        return Err("该运行主机仍有运行中的隧道，请先停止隧道".to_string());
    }
    let mut hosts = load_hosts(&app_handle)?;
    let count_before = hosts.len();
    hosts.retain(|host| host.id != host_id);
    if hosts.len() == count_before {
        return Err("要删除的运行主机不存在".to_string());
    }
    save_hosts(&app_handle, &hosts)
}

#[tauri::command]
pub async fn test_remote_host(
    app_handle: tauri::AppHandle,
    host_id: String,
) -> Result<RemoteHostCheck, String> {
    let host = load_hosts(&app_handle)?
        .into_iter()
        .find(|host| host.id == host_id)
        .ok_or_else(|| "要测试的运行主机不存在".to_string())?;
    tokio::task::spawn_blocking(move || check_remote_host(host))
        .await
        .map_err(|error| format!("SSH 检测任务失败: {error}"))
}

#[cfg(test)]
mod tests {
    use super::{normalize_input, RemoteHostInput};

    fn input(ssh_target: &str) -> RemoteHostInput {
        RemoteHostInput {
            id: None,
            name: "Test Host".to_string(),
            ssh_target: ssh_target.to_string(),
            frpc_path: "/opt/frp/frpc".to_string(),
            work_dir: "/var/lib/chmlfrp-launcher".to_string(),
        }
    }

    #[test]
    fn accepts_ssh_alias_and_absolute_paths() {
        assert!(normalize_input(input("test-host")).is_ok());
    }

    #[test]
    fn rejects_shell_like_ssh_target() {
        assert!(normalize_input(input("home;rm")).is_err());
    }
}
