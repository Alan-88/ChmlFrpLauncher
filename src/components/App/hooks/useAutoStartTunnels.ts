import { useEffect, useRef } from "react";
import { fetchTunnels, type StoredUser, type Tunnel } from "@/services/api";
import { frpcManager } from "@/services/frpcManager";
import { customTunnelService } from "@/services/customTunnelService";
import { autoStartTunnelsService } from "@/services/autoStartTunnelsService";
import {
  remoteRunnerService,
  type RunnerTarget,
} from "@/services/remoteRunnerService";
import {
  getTunnelKey,
  LOCAL_RUNNER,
  startTunnelOnRunner,
} from "@/services/tunnelRunnerService";
import type { UnifiedTunnel } from "@/components/pages/TunnelList/types";

export function useAutoStartTunnels(user: StoredUser | null) {
  const hasStartedApiRef = useRef(false);
  const hasStartedCustomRef = useRef(false);

  useEffect(() => {
    const run = async () => {
      try {
        const [preferences, remoteRuns] = await Promise.all([
          remoteRunnerService
            .getPreferences()
            .catch((): Record<string, RunnerTarget> => ({})),
          remoteRunnerService
            .syncRuns()
            .catch(() => remoteRunnerService.getRuns().catch(() => [])),
        ]);
        const activeRemoteKeys = new Set(
          remoteRuns
            .filter((remoteRun) => remoteRun.status !== "stopped")
            .map((remoteRun) => remoteRun.tunnel_key),
        );

        const startIfNeeded = async (tunnel: UnifiedTunnel) => {
          const tunnelKey = getTunnelKey(tunnel);
          if (activeRemoteKeys.has(tunnelKey)) return;

          const runner = preferences[tunnelKey] ?? LOCAL_RUNNER;
          const localRunning =
            runner.kind === "local" &&
            (tunnel.type === "api"
              ? await frpcManager.isTunnelRunning(tunnel.data.id)
              : await customTunnelService.isCustomTunnelRunning(
                  tunnel.data.id,
                ));
          if (localRunning) return;

          await startTunnelOnRunner(tunnel, user?.usertoken, runner);
        };

        if (!hasStartedCustomRef.current) {
          hasStartedCustomRef.current = true;
          const customTunnels = await customTunnelService
            .getCustomTunnels()
            .catch(() => []);
          await Promise.all(
            customTunnels.map(async (t) => {
              try {
                const enabled = await autoStartTunnelsService.isTunnelEnabled(
                  "custom",
                  t.id,
                );
                if (!enabled) return;
                await startIfNeeded({ type: "custom", data: t });
              } catch (error) {
                console.error(`自动启动自定义隧道失败 (${t.id}):`, error);
              }
            }),
          );
        }

        if (!user?.usertoken || hasStartedApiRef.current) return;
        hasStartedApiRef.current = true;

        const apiTunnels: Tunnel[] = await fetchTunnels().catch(
          () => [] as Tunnel[],
        );
        await Promise.all(
          apiTunnels.map(async (t) => {
            try {
              const enabled = await autoStartTunnelsService.isTunnelEnabled(
                "api",
                t.id,
              );
              if (!enabled) return;
              if (t.nodestate && t.nodestate !== "online") return;
              await startIfNeeded({ type: "api", data: t });
            } catch (error) {
              console.error(`自动启动隧道失败 (api ${t.id}):`, error);
            }
          }),
        );
      } catch (error) {
        console.error("自动启动隧道失败:", error);
      }
    };

    void run();
  }, [user?.usertoken]);
}
