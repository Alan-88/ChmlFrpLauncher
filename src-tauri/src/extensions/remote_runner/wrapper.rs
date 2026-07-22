pub(crate) const REMOTE_WRAPPER_SCRIPT: &str = r#"#!/bin/sh
set -u

run_dir=$1
frpc_path=$2
guard_enabled=$3
config_path="$run_dir/frpc.ini"
log_path="$run_dir/frpc.log"
pid_path="$run_dir/frpc.pid"
lease_path="$run_dir/lease"
child_pid=""

lease_valid() {
  expires=$(cat "$lease_path" 2>/dev/null || printf 0)
  case "$expires" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$(date +%s)" -lt "$expires" ]
}

stop_child() {
  if [ -n "$child_pid" ] && kill -0 "$child_pid" 2>/dev/null; then
    kill "$child_pid" 2>/dev/null || true
    wait "$child_pid" 2>/dev/null || true
  fi
  rm -f "$pid_path"
}

trap 'stop_child; exit 0' INT TERM HUP
restarts=0

while lease_valid; do
  "$frpc_path" -c "$config_path" >>"$log_path" 2>&1 &
  child_pid=$!
  printf '%s\n' "$child_pid" > "$pid_path"

  while kill -0 "$child_pid" 2>/dev/null; do
    if ! lease_valid; then
      stop_child
      exit 0
    fi
    sleep 15
  done

  wait "$child_pid" 2>/dev/null || true
  rm -f "$pid_path"
  child_pid=""

  if ! lease_valid || [ "$guard_enabled" != "1" ] || [ "$restarts" -ge 2 ]; then
    exit 0
  fi

  restarts=$((restarts + 1))
  printf '%s [W] [ChmlFrpLauncher] 远程 frpc 已退出，守护进程正在重启（%s/3）\n' "$(date '+%Y/%m/%d %H:%M:%S')" "$restarts" >>"$log_path"
  sleep 3
done
"#;

#[cfg(test)]
mod tests {
    use super::REMOTE_WRAPPER_SCRIPT;

    #[test]
    fn wrapper_stops_when_lease_is_not_valid() {
        assert!(REMOTE_WRAPPER_SCRIPT.contains("while lease_valid; do"));
        assert!(REMOTE_WRAPPER_SCRIPT.contains("stop_child"));
    }
}
