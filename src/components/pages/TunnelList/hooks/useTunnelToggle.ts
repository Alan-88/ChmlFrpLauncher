import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { getStoredUser } from "@/services/api";
import { logStore } from "@/services/logStore";
import type { RunnerTarget } from "@/services/remoteRunnerService";
import {
  getTunnelKey,
  getTunnelLogId,
  startTunnelOnRunner,
  stopTunnelOnRunner,
} from "@/services/tunnelRunnerService";
import type { TunnelProgress, UnifiedTunnel } from "../types";

interface UseTunnelToggleProps {
  setTunnelProgress: Dispatch<SetStateAction<Map<string, TunnelProgress>>>;
  setRunningTunnels: Dispatch<SetStateAction<Set<string>>>;
  timeoutRefs: React.MutableRefObject<
    Map<string, ReturnType<typeof setTimeout>>
  >;
  successTimeoutRefs: React.MutableRefObject<
    Map<string, ReturnType<typeof setTimeout>>
  >;
  getRunner: (tunnel: UnifiedTunnel) => RunnerTarget;
}

export function useTunnelToggle({
  setTunnelProgress,
  setRunningTunnels,
  timeoutRefs,
  successTimeoutRefs,
  getRunner,
}: UseTunnelToggleProps) {
  const [togglingTunnels, setTogglingTunnels] = useState<Set<string>>(
    new Set(),
  );

  const handleToggle = async (tunnel: UnifiedTunnel, enabled: boolean) => {
    const tunnelKey = getTunnelKey(tunnel);

    const tunnelName =
      tunnel.type === "api" ? tunnel.data.name : tunnel.data.name;

    if (tunnel.type === "api") {
      const user = getStoredUser();
      if (!user?.usertoken) {
        toast.error("未找到用户令牌，请重新登录");
        return;
      }
    }

    if (togglingTunnels.has(tunnelKey)) {
      return;
    }

    setTogglingTunnels((prev) => new Set(prev).add(tunnelKey));

    try {
      if (enabled) {
        setTunnelProgress((prev) => {
          const next = new Map(prev);
          const resetProgress = {
            progress: 0,
            isError: false,
            isSuccess: false,
          };
          next.set(tunnelKey, resetProgress);
          return next;
        });

        const message = await startTunnelOnRunner(
          tunnel,
          getStoredUser()?.usertoken,
          getRunner(tunnel),
        );

        toast.success(message || `隧道 ${tunnelName} 已启动`);
        setRunningTunnels((prev) => new Set(prev).add(tunnelKey));
      } else {
        const message = await stopTunnelOnRunner(tunnel, getRunner(tunnel));

        const logTunnelId = getTunnelLogId(tunnel);
        if (typeof logTunnelId === "number" && Number.isFinite(logTunnelId)) {
          const timestamp = new Date()
            .toLocaleString("zh-CN", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            })
            .replace(/\//g, "/");
          logStore.addLog({
            tunnel_id: logTunnelId,
            message: `[I] [ChmlFrpLauncher] 隧道"${tunnelName}"已手动停止。`,
            timestamp,
          });
        }

        toast.success(message || `隧道 ${tunnelName} 已停止`);
        setRunningTunnels((prev) => {
          const next = new Set(prev);
          next.delete(tunnelKey);
          return next;
        });
        setTunnelProgress((prev) => {
          const next = new Map(prev);
          next.set(tunnelKey, {
            progress: 0,
            isError: false,
            isSuccess: false,
          });
          return next;
        });
        if (timeoutRefs.current.has(tunnelKey)) {
          clearTimeout(timeoutRefs.current.get(tunnelKey)!);
          timeoutRefs.current.delete(tunnelKey);
        }
        if (successTimeoutRefs.current.has(tunnelKey)) {
          clearTimeout(successTimeoutRefs.current.get(tunnelKey)!);
          successTimeoutRefs.current.delete(tunnelKey);
        }
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : `${enabled ? "启动" : "停止"}失败`;
      toast.error(message);

      if (enabled) {
        const errorProgress = {
          progress: 100,
          isError: true,
          isSuccess: false,
        };
        setTunnelProgress((prev) => {
          const next = new Map(prev);
          next.set(tunnelKey, errorProgress);
          return next;
        });
      }
    } finally {
      setTogglingTunnels((prev) => {
        const next = new Set(prev);
        next.delete(tunnelKey);
        return next;
      });
    }
  };

  return {
    togglingTunnels,
    handleToggle,
  };
}
