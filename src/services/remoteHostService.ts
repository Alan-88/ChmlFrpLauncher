import { invoke } from "@tauri-apps/api/core";

export interface RemoteHost {
  id: string;
  name: string;
  ssh_target: string;
  frpc_path: string;
  work_dir: string;
  created_at: string;
  updated_at: string;
}

export interface RemoteHostInput {
  id?: string;
  name: string;
  ssh_target: string;
  frpc_path: string;
  work_dir: string;
}

export interface RemoteHostCheck {
  success: boolean;
  host_name: string | null;
  frpc_version: string | null;
  work_dir_ready: boolean;
  message: string;
}

class RemoteHostService {
  async getRemoteHosts(): Promise<RemoteHost[]> {
    return invoke<RemoteHost[]>("get_remote_hosts");
  }

  async saveRemoteHost(input: RemoteHostInput): Promise<RemoteHost> {
    return invoke<RemoteHost>("save_remote_host", { input });
  }

  async deleteRemoteHost(hostId: string): Promise<void> {
    await invoke<void>("delete_remote_host", { hostId });
  }

  async testRemoteHost(hostId: string): Promise<RemoteHostCheck> {
    return invoke<RemoteHostCheck>("test_remote_host", { hostId });
  }
}

export const remoteHostService = new RemoteHostService();
