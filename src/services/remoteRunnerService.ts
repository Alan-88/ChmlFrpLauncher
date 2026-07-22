import { invoke } from "@tauri-apps/api/core";
import type { TunnelConfig } from "./frpcManager";

export type RunnerTarget =
  | { kind: "local" }
  | { kind: "remote"; host_id: string };

export type RemoteRunStatus =
  | "running"
  | "reconnecting"
  | "unknown"
  | "stopped";

export interface RemoteRun {
  tunnel_key: string;
  tunnel_id: number;
  host_id: string;
  run_id: string;
  wrapper_pid: number | null;
  status: RemoteRunStatus;
  started_at: string;
  updated_at: string;
  message: string | null;
}

class RemoteRunnerService {
  async getPreferences(): Promise<Record<string, RunnerTarget>> {
    return invoke<Record<string, RunnerTarget>>(
      "get_tunnel_runner_preferences",
    );
  }

  async setPreference(tunnelKey: string, runner: RunnerTarget): Promise<void> {
    await invoke<void>("set_tunnel_runner_preference", { tunnelKey, runner });
  }

  async getRuns(): Promise<RemoteRun[]> {
    return invoke<RemoteRun[]>("get_remote_runs");
  }

  async syncRuns(): Promise<RemoteRun[]> {
    return invoke<RemoteRun[]>("sync_remote_runs");
  }

  async startApiTunnel(input: {
    host_id: string;
    tunnel_key: string;
    config: TunnelConfig;
    guard_enabled: boolean;
  }): Promise<string> {
    return invoke<string>("start_remote_api_frpc", { input });
  }

  async startCustomTunnel(input: {
    host_id: string;
    tunnel_key: string;
    tunnel_id: number;
    config_content: string;
    guard_enabled: boolean;
  }): Promise<string> {
    return invoke<string>("start_remote_custom_frpc", { input });
  }

  async stopTunnel(tunnelKey: string): Promise<string> {
    return invoke<string>("stop_remote_frpc", { tunnelKey });
  }

  async stopAll(): Promise<void> {
    await invoke<void>("stop_all_remote_frpcs");
  }
}

export const remoteRunnerService = new RemoteRunnerService();
