use super::{
    hosts::RemoteHost,
    ssh::{output_error, run_ssh, shell_quote},
    state::{run_directory, RemoteRun, LEASE_SECONDS},
    wrapper::REMOTE_WRAPPER_SCRIPT,
};
use chrono::Utc;
use std::{process::Output, time::Duration};

const SSH_TIMEOUT: Duration = Duration::from_secs(12);
const LOG_CHUNK_BYTES: u64 = 64 * 1024;

fn require_success(output: Output, fallback: &str) -> Result<Output, String> {
    if output.status.success() {
        Ok(output)
    } else {
        Err(output_error(&output, fallback))
    }
}

fn remote_write_file(
    host: &RemoteHost,
    path: &str,
    content: &[u8],
    mode: &str,
) -> Result<(), String> {
    let command = format!(
        "umask 077; cat > {path}; chmod {mode} -- {path}",
        path = shell_quote(path),
        mode = shell_quote(mode),
    );
    require_success(
        run_ssh(host, &command, Some(content), SSH_TIMEOUT)?,
        "写入远端运行文件失败",
    )?;
    Ok(())
}

pub(crate) fn setup_remote_run(
    host: &RemoteHost,
    run: &RemoteRun,
    config_content: &str,
    guard_enabled: bool,
) -> Result<u32, String> {
    if config_content.is_empty() || config_content.len() > 1024 * 1024 {
        return Err("frpc 配置内容无效".to_string());
    }

    let directory = run_directory(host, &run.run_id);
    let config_path = format!("{directory}/frpc.ini");
    let script_path = format!("{directory}/run.sh");
    let run_id_path = format!("{directory}/run_id");
    let lease_path = format!("{directory}/lease");
    let expires_at = Utc::now().timestamp() + LEASE_SECONDS;

    let prepare_command = format!(
        "umask 077; mkdir -p -- {directory}; chmod 700 -- {directory}; printf '%s\\n' {run_id} > {run_id_path}; printf '%s\\n' {expires_at} > {lease_path}; : > {log_path}",
        directory = shell_quote(&directory),
        run_id = shell_quote(&run.run_id),
        run_id_path = shell_quote(&run_id_path),
        expires_at = expires_at,
        lease_path = shell_quote(&lease_path),
        log_path = shell_quote(&format!("{directory}/frpc.log")),
    );
    require_success(
        run_ssh(host, &prepare_command, None, SSH_TIMEOUT)?,
        "创建远端运行目录失败",
    )?;
    remote_write_file(host, &config_path, config_content.as_bytes(), "600")?;
    remote_write_file(host, &script_path, REMOTE_WRAPPER_SCRIPT.as_bytes(), "700")?;

    let launch_command = format!(
        "if command -v setsid >/dev/null 2>&1; then setsid sh {script_path} {directory} {frpc_path} {guard_enabled} >/dev/null 2>&1 < /dev/null & else nohup sh {script_path} {directory} {frpc_path} {guard_enabled} >/dev/null 2>&1 < /dev/null & fi; wrapper_pid=$!; printf '%s\\n' \"$wrapper_pid\" > {wrapper_pid_path}; printf '%s\\n' \"$wrapper_pid\"",
        script_path = shell_quote(&script_path),
        directory = shell_quote(&directory),
        frpc_path = shell_quote(&host.frpc_path),
        guard_enabled = if guard_enabled { "1" } else { "0" },
        wrapper_pid_path = shell_quote(&format!("{directory}/wrapper.pid")),
    );
    let output = require_success(
        run_ssh(host, &launch_command, None, SSH_TIMEOUT)?,
        "启动远端 frpc 包装器失败",
    )?;
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .last()
        .and_then(|value| value.trim().parse::<u32>().ok())
        .ok_or_else(|| "远端包装器未返回 PID".to_string())
}

pub(crate) fn probe_remote_run(host: &RemoteHost, run: &RemoteRun) -> Result<bool, String> {
    let directory = run_directory(host, &run.run_id);
    let command = format!(
        "if [ \"$(cat {run_id_path} 2>/dev/null)\" != {run_id} ]; then printf 'STOPPED\\n'; exit 0; fi; pid=$(cat {pid_path} 2>/dev/null || true); case \"$pid\" in ''|*[!0-9]*) printf 'STOPPED\\n' ;; *) if kill -0 \"$pid\" 2>/dev/null; then printf 'RUNNING\\n'; else printf 'STOPPED\\n'; fi ;; esac",
        run_id_path = shell_quote(&format!("{directory}/run_id")),
        run_id = shell_quote(&run.run_id),
        pid_path = shell_quote(&format!("{directory}/frpc.pid")),
    );
    let output = require_success(
        run_ssh(host, &command, None, SSH_TIMEOUT)?,
        "检查远端 frpc 状态失败",
    )?;
    Ok(String::from_utf8_lossy(&output.stdout).lines().next() == Some("RUNNING"))
}

pub(crate) fn renew_remote_lease(host: &RemoteHost, run: &RemoteRun) -> Result<(), String> {
    let directory = run_directory(host, &run.run_id);
    let expires_at = Utc::now().timestamp() + LEASE_SECONDS;
    let command = format!(
        "if [ \"$(cat {run_id_path} 2>/dev/null)\" != {run_id} ]; then exit 4; fi; umask 077; printf '%s\\n' {expires_at} > {lease_path}.next && mv {lease_path}.next {lease_path}",
        run_id_path = shell_quote(&format!("{directory}/run_id")),
        run_id = shell_quote(&run.run_id),
        expires_at = expires_at,
        lease_path = shell_quote(&format!("{directory}/lease")),
    );
    require_success(
        run_ssh(host, &command, None, SSH_TIMEOUT)?,
        "续租远端 frpc 失败",
    )?;
    Ok(())
}

pub(crate) fn fetch_remote_logs(
    host: &RemoteHost,
    run: &mut RemoteRun,
) -> Result<Vec<String>, String> {
    let directory = run_directory(host, &run.run_id);
    let log_path = format!("{directory}/frpc.log");
    let command = format!(
        "if [ -f {log_path} ]; then size=$(wc -c < {log_path} | tr -d ' '); else size=0; fi; printf '%s\\n' \"$size\"; if [ \"$size\" -lt {offset} ]; then exit 0; fi; remaining=$((size - {offset})); if [ \"$remaining\" -gt 0 ]; then count=$remaining; if [ \"$count\" -gt {chunk} ]; then count={chunk}; fi; dd if={log_path} bs=1 skip={offset} count=\"$count\" 2>/dev/null; fi",
        log_path = shell_quote(&log_path),
        offset = run.log_offset,
        chunk = LOG_CHUNK_BYTES,
    );
    let output = require_success(
        run_ssh(host, &command, None, SSH_TIMEOUT)?,
        "读取远端 frpc 日志失败",
    )?;
    let bytes = output.stdout;
    let Some(newline_index) = bytes.iter().position(|byte| *byte == b'\n') else {
        return Ok(Vec::new());
    };
    let reported_size = String::from_utf8_lossy(&bytes[..newline_index])
        .trim()
        .parse::<u64>()
        .unwrap_or(run.log_offset);
    if reported_size < run.log_offset {
        run.log_offset = 0;
        return Ok(Vec::new());
    }

    let log_bytes = &bytes[newline_index + 1..];
    run.log_offset = run.log_offset.saturating_add(log_bytes.len() as u64);
    let log_text = String::from_utf8_lossy(log_bytes);
    // ponytail: frpc lines are short; preserve a per-run partial-line buffer if a future client emits >64 KiB lines.
    Ok(log_text
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(str::to_string)
        .collect())
}

pub(crate) fn stop_remote_process(host: &RemoteHost, run: &RemoteRun) -> Result<(), String> {
    let directory = run_directory(host, &run.run_id);
    let command = format!(
        "if [ \"$(cat {run_id_path} 2>/dev/null)\" = {run_id} ]; then for pid_path in {wrapper_pid_path} {frpc_pid_path}; do pid=$(cat \"$pid_path\" 2>/dev/null || true); case \"$pid\" in ''|*[!0-9]*) ;; *) kill \"$pid\" 2>/dev/null || true ;; esac; done; rm -f {lease_path} {config_path}; fi",
        run_id_path = shell_quote(&format!("{directory}/run_id")),
        run_id = shell_quote(&run.run_id),
        wrapper_pid_path = shell_quote(&format!("{directory}/wrapper.pid")),
        frpc_pid_path = shell_quote(&format!("{directory}/frpc.pid")),
        lease_path = shell_quote(&format!("{directory}/lease")),
        config_path = shell_quote(&format!("{directory}/frpc.ini")),
    );
    require_success(
        run_ssh(host, &command, None, SSH_TIMEOUT)?,
        "停止远端 frpc 失败",
    )?;
    Ok(())
}
