import { useState, useEffect, useRef, useCallback } from "react";
import { fetchTunnels, type StoredUser, type Tunnel } from "@/services/api";
import { frpcManager } from "@/services/frpcManager";
import { customTunnelService } from "@/services/customTunnelService";
import {
  remoteRunnerService,
  type RunnerTarget,
} from "@/services/remoteRunnerService";
import { tunnelListCache } from "../cache";
import type { UnifiedTunnel } from "../types";

export function useTunnelList(user: StoredUser | null) {
  const [tunnels, setTunnels] = useState<UnifiedTunnel[]>(() => {
    return tunnelListCache.tunnels.map((t) => ({
      type: "api" as const,
      data: t,
    }));
  });
  const [loading, setLoading] = useState(() => {
    return tunnelListCache.tunnels.length === 0;
  });
  const [error, setError] = useState("");
  const [runningTunnels, setRunningTunnels] = useState<Set<string>>(new Set());

  const tunnelsRef = useRef(tunnels);

  useEffect(() => {
    tunnelsRef.current = tunnels;
  }, [tunnels]);

  const checkRunningStatus = useCallback(
    async (currentTunnels?: UnifiedTunnel[]) => {
      const tunnelsToCheck = currentTunnels || tunnelsRef.current;
      const running = new Set<string>();
      const [preferences, remoteRuns] = await Promise.all([
        remoteRunnerService
          .getPreferences()
          .catch((): Record<string, RunnerTarget> => ({})),
        remoteRunnerService.getRuns().catch(() => []),
      ]);
      const activeRemoteKeys = new Set(
        remoteRuns
          .filter((run) => run.status !== "stopped")
          .map((run) => run.tunnel_key),
      );

      const withTimeout = (promise: Promise<boolean>, timeoutMs: number) =>
        new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), timeoutMs);
          promise
            .then((value) => {
              clearTimeout(timer);
              resolve(value);
            })
            .catch(() => {
              clearTimeout(timer);
              resolve(false);
            });
        });

      await Promise.all(
        tunnelsToCheck.map(async (tunnel) => {
          const tunnelKey =
            tunnel.type === "api"
              ? `api_${tunnel.data.id}`
              : `custom_${tunnel.data.id}`;
          if (preferences[tunnelKey]?.kind === "remote") {
            if (activeRemoteKeys.has(tunnelKey)) running.add(tunnelKey);
            return;
          }

          if (tunnel.type === "api") {
            const isRunning = await withTimeout(
              frpcManager.isTunnelRunning(tunnel.data.id),
              3000,
            );
            if (isRunning) {
              running.add(`api_${tunnel.data.id}`);
            }
          } else {
            const isRunning = await withTimeout(
              customTunnelService.isCustomTunnelRunning(tunnel.data.id),
              3000,
            );
            if (isRunning) {
              running.add(`custom_${tunnel.data.id}`);
            }
          }
        }),
      );

      setRunningTunnels(running);
    },
    [],
  );

  const loadTunnels = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const customTunnels = await customTunnelService
        .getCustomTunnels()
        .catch(() => []);
      const apiTunnels: Tunnel[] = user?.accessToken
        ? await fetchTunnels()
        : [];

      const allTunnels: UnifiedTunnel[] = [
        ...apiTunnels.map((t) => ({ type: "api" as const, data: t })),
        ...customTunnels.map((t) => ({ type: "custom" as const, data: t })),
      ];

      setTunnels(allTunnels);
      tunnelListCache.tunnels = apiTunnels;

      await checkRunningStatus(allTunnels);
      setLoading(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "获取隧道列表失败";
      setError(message);
      console.error("获取隧道列表失败", err);
    } finally {
      setLoading(false);
    }
  }, [checkRunningStatus, user?.accessToken]);

  useEffect(() => {
    void loadTunnels();
  }, [loadTunnels]);

  // 监听守护进程自动重启事件
  useEffect(() => {
    const setupAutoRestartListener = async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const unlisten = await listen<{ tunnel_id: number; timestamp: string }>(
        "tunnel-auto-restarted",
        async () => {
          await checkRunningStatus();
        },
      );

      return unlisten;
    };

    let unlistenFn: (() => void) | undefined;
    setupAutoRestartListener().then((fn) => {
      unlistenFn = fn;
    });

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [checkRunningStatus]);

  // 定期检查运行状态
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkRunningStatus();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkRunningStatus]);
  useEffect(() => {
    let unlistenFn: (() => void) | undefined;

    const setupFocusListener = async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        const unlisten = await appWindow.onFocusChanged(
          ({ payload: focused }) => {
            if (focused) {
              checkRunningStatus();
            }
          },
        );
        unlistenFn = unlisten;
      } catch (error) {
        console.error("Failed to setup window focus listener:", error);
      }
    };

    setupFocusListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [checkRunningStatus]);
  useEffect(() => {
    if (tunnels.length === 0) return;

    const interval = setInterval(() => checkRunningStatus(), 5000);

    return () => clearInterval(interval);
  }, [tunnels, checkRunningStatus]);

  return {
    tunnels,
    loading,
    error,
    runningTunnels,
    setRunningTunnels,
    refreshTunnels: loadTunnels,
    refreshRunningStatus: checkRunningStatus,
  };
}
