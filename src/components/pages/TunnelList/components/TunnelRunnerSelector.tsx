import { ChevronDown } from "lucide-react";
import type { RemoteHost } from "@/services/remoteHostService";
import type { RemoteRun, RunnerTarget } from "@/services/remoteRunnerService";

interface TunnelRunnerSelectorProps {
  runner: RunnerTarget;
  hosts: RemoteHost[];
  run?: RemoteRun;
  disabled: boolean;
  onChange: (runner: RunnerTarget) => void;
}

function runnerValue(runner: RunnerTarget): string {
  return runner.kind === "local" ? "local" : `remote:${runner.host_id}`;
}

function parseRunner(value: string): RunnerTarget {
  return value === "local"
    ? { kind: "local" }
    : { kind: "remote", host_id: value.slice("remote:".length) };
}

export function TunnelRunnerSelector({
  runner,
  hosts,
  run,
  disabled,
  onChange,
}: TunnelRunnerSelectorProps) {
  const selectedHost =
    runner.kind === "remote"
      ? hosts.find((host) => host.id === runner.host_id)
      : undefined;
  const statusLabel =
    run?.status === "reconnecting"
      ? "重连中"
      : run?.status === "unknown"
        ? "未知"
        : undefined;

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
      <div className="relative max-w-[120px]">
        <select
          aria-label="运行主机"
          value={runnerValue(runner)}
          disabled={disabled}
          onChange={(event) => onChange(parseRunner(event.target.value))}
          className="w-full appearance-none bg-transparent py-0.5 pr-3 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          title="选择运行主机"
        >
          <option value="local">本机</option>
          {runner.kind === "remote" && !selectedHost && (
            <option value={runnerValue(runner)}>已删除的主机</option>
          )}
          {hosts.map((host) => (
            <option key={host.id} value={`remote:${host.id}`}>
              {host.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-0 top-1/2 size-3 -translate-y-1/2 opacity-60" />
      </div>
      {statusLabel && (
        <span className="text-[10px] opacity-70">{statusLabel}</span>
      )}
    </div>
  );
}
