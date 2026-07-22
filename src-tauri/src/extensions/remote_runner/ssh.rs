use super::hosts::RemoteHost;
use std::{
    io::Write,
    process::{Command, Output, Stdio},
    thread,
    time::{Duration, Instant},
};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

pub(crate) fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

pub(crate) fn run_ssh(
    host: &RemoteHost,
    remote_command: &str,
    stdin_data: Option<&[u8]>,
    timeout: Duration,
) -> Result<Output, String> {
    let mut command = Command::new("ssh");
    command
        .args([
            "-o",
            "BatchMode=yes",
            "-o",
            "ConnectTimeout=8",
            "-o",
            "ConnectionAttempts=1",
            "-o",
            "ServerAliveInterval=5",
            "-o",
            "ServerAliveCountMax=1",
            "-o",
            "LogLevel=ERROR",
        ])
        .arg(&host.ssh_target)
        .arg(remote_command)
        .stdin(if stdin_data.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        command.creation_flags(0x08000000);
    }

    let mut child = command
        .spawn()
        .map_err(|error| format!("无法启动 SSH: {error}"))?;

    if let Some(data) = stdin_data {
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "无法写入 SSH 请求".to_string())?;
        stdin
            .write_all(data)
            .map_err(|error| format!("写入 SSH 请求失败: {error}"))?;
    }

    let deadline = Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return child.wait_with_output().map_err(|error| error.to_string()),
            Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(50)),
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait_with_output();
                return Err("SSH 操作超时".to_string());
            }
            Err(error) => return Err(format!("等待 SSH 进程失败: {error}")),
        }
    }
}

pub(crate) fn output_error(output: &Output, fallback: &str) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let detail = stderr
        .lines()
        .next()
        .or_else(|| stdout.lines().next())
        .unwrap_or(fallback)
        .trim()
        .chars()
        .take(240)
        .collect::<String>();

    if detail.is_empty() {
        fallback.to_string()
    } else {
        detail
    }
}

#[cfg(test)]
mod tests {
    use super::shell_quote;

    #[test]
    fn quotes_single_quotes_for_remote_shell() {
        assert_eq!(shell_quote("a'b"), "'a'\"'\"'b'");
    }
}
