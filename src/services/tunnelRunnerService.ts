import { buildTunnelConfig, frpcManager } from "./frpcManager";
import { customTunnelService } from "./customTunnelService";
import { remoteRunnerService, type RunnerTarget } from "./remoteRunnerService";
import type { UnifiedTunnel } from "@/components/pages/TunnelList/types";

export const LOCAL_RUNNER: RunnerTarget = { kind: "local" };

export function getTunnelKey(tunnel: UnifiedTunnel): string {
  return tunnel.type === "api"
    ? `api_${tunnel.data.id}`
    : `custom_${tunnel.data.id}`;
}

export function getTunnelLogId(tunnel: UnifiedTunnel): number | null {
  if (tunnel.type === "api") return tunnel.data.id;
  return typeof tunnel.data.hashed_id === "number"
    ? tunnel.data.hashed_id
    : null;
}

function shouldGuardRemoteTunnel(): boolean {
  return localStorage.getItem("processGuardEnabled") === "true";
}

export async function startTunnelOnRunner(
  tunnel: UnifiedTunnel,
  userToken: string | undefined,
  runner: RunnerTarget,
): Promise<string> {
  if (runner.kind === "local") {
    if (tunnel.type === "api") {
      if (!userToken) throw new Error("未找到用户令牌，请重新登录");
      return frpcManager.startTunnel(tunnel.data, userToken);
    }
    return customTunnelService.startCustomTunnel(tunnel.data.id);
  }

  if (tunnel.type === "api") {
    if (!userToken) throw new Error("未找到用户令牌，请重新登录");
    return remoteRunnerService.startApiTunnel({
      host_id: runner.host_id,
      tunnel_key: getTunnelKey(tunnel),
      config: await buildTunnelConfig(tunnel.data, userToken),
      guard_enabled: shouldGuardRemoteTunnel(),
    });
  }

  const tunnelId = getTunnelLogId(tunnel);
  if (tunnelId === null) {
    throw new Error("自定义隧道缺少运行标识，请刷新后重试");
  }
  return remoteRunnerService.startCustomTunnel({
    host_id: runner.host_id,
    tunnel_key: getTunnelKey(tunnel),
    tunnel_id: tunnelId,
    config_content: await customTunnelService.getCustomTunnelConfig(
      tunnel.data.id,
    ),
    guard_enabled: shouldGuardRemoteTunnel(),
  });
}

export async function stopTunnelOnRunner(
  tunnel: UnifiedTunnel,
  runner: RunnerTarget,
): Promise<string> {
  if (runner.kind === "remote") {
    return remoteRunnerService.stopTunnel(getTunnelKey(tunnel));
  }
  if (tunnel.type === "api") return frpcManager.stopTunnel(tunnel.data.id);
  return customTunnelService.stopCustomTunnel(tunnel.data.id);
}
